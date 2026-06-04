// ══════════════════════════════════════════════════════
//  BLEND — Main Application v2
//  Features:
//  - Numeric room codes only
//  - Shareable links (auto-fill code from URL)
//  - Real-time pause/play sync with name notification
//  - Multiple listeners (observers) beyond 2 hosts
//  - Auto-delete room & songs on end/leave
//  - LocalStorage caching for resilience
//  - Cleanup on tab close
// ══════════════════════════════════════════════════════

'use strict';

// ── Supabase client ──────────────────────────────────
const sb = supabase.createClient(SUPABASE_URL, SUPABASE_ANON);

// ── State ────────────────────────────────────────────
const State = {
  roomCode:   null,
  userId:     null,       // 'A', 'B', or 'listener'
  userName:   null,
  avatarUrl:  null,
  songs:      [],         // [{name, duration, file, localUrl}]
  roomData:   null,
  channel:    null,
  listenerId: null,       // for observer listeners
};

// ── Utils ────────────────────────────────────────────
function genNumericCode() {
  // 6-digit numeric code
  return String(Math.floor(100000 + Math.random() * 900000));
}
function fmtTime(s) {
  s = Math.floor(s || 0);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}
function stripExt(n) { return n.replace(/\.[^.]+$/, '').replace(/[_-]/g, ' '); }
function initials(n) { return (n || '?').split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2); }

function toast(msg, duration = 2800) {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(toast._t);
  toast._t = setTimeout(() => el.classList.remove('show'), duration);
}

function showScreen(id) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  document.getElementById(id).classList.add('active');
}

function setLoading(show, text = 'Connecting…') {
  document.getElementById('loading-text').textContent = text;
  document.getElementById('loading').classList.toggle('hidden', !show);
}

// ── LocalStorage helpers ─────────────────────────────
const LS = {
  save(key, val) { try { localStorage.setItem('blend_' + key, JSON.stringify(val)); } catch(e) {} },
  load(key, def = null) { try { const v = localStorage.getItem('blend_' + key); return v ? JSON.parse(v) : def; } catch(e) { return def; } },
  remove(key) { try { localStorage.removeItem('blend_' + key); } catch(e) {} },
};

// ── URL / Share helpers ──────────────────────────────
function getInviteCode() {
  const params = new URLSearchParams(window.location.search);
  return params.get('code') || params.get('room') || null;
}

function buildShareUrl(code) {
  const base = window.location.origin + window.location.pathname;
  return `${base}?code=${code}`;
}

function clearUrlParams() {
  const url = window.location.pathname;
  window.history.replaceState({}, '', url);
}

// ── App controller ───────────────────────────────────
const App = {

  init() {
    // Check for invite code in URL
    const inviteCode = getInviteCode();
    if (inviteCode && /^\d{4,6}$/.test(inviteCode)) {
      document.getElementById('join-code-input').value = inviteCode;
      document.getElementById('share-join-hint').style.display = '';
      clearUrlParams();
    }

    // Volume slider init
    const volSlider = document.getElementById('volume-slider');
    if (volSlider) {
      const savedVol = LS.load('volume', 100);
      volSlider.value = savedVol;
      Player.audio.volume = savedVol / 100;
      App._updateVolumeSlider(savedVol);
      volSlider.addEventListener('input', e => {
        const v = parseInt(e.target.value);
        Player.audio.volume = v / 100;
        LS.save('volume', v);
        App._updateVolumeSlider(v);
      });
    }

    // Progress bar click to seek
    document.getElementById('progress-bar-click').addEventListener('click', e => {
      if (!Player.active || !Player.audio.duration) return;
      const rect = e.currentTarget.getBoundingClientRect();
      const pct = (e.clientX - rect.left) / rect.width;
      Player.audio.currentTime = pct * Player.audio.duration;
      Player._broadcastState();
    });

    // Beforeunload: cleanup
    window.addEventListener('beforeunload', () => {
      App._cleanupOnLeave(false);
    });

    // Numeric-only enforcement for join input
    document.getElementById('join-code-input').addEventListener('input', e => {
      e.target.value = e.target.value.replace(/\D/g, '');
    });
  },

  _updateVolumeSlider(v) {
    const slider = document.getElementById('volume-slider');
    if (slider) {
      slider.style.background = `linear-gradient(to right, var(--you) ${v}%, var(--bg3) ${v}%)`;
    }
  },

  showCreate() {
    State.userId = 'A';
    document.getElementById('setup-title').textContent = 'Create your profile';
    document.getElementById('btn-proceed-label').textContent = 'Create room →';
    showScreen('screen-setup');
  },

  showJoin() {
    const code = document.getElementById('join-code-input').value.trim();
    if (code.length < 4 || !/^\d+$/.test(code)) {
      toast('Enter a numeric room code'); return;
    }
    State.userId   = 'B';
    State.roomCode = code;
    document.getElementById('setup-title').textContent = 'Join the blend';
    document.getElementById('btn-proceed-label').textContent = 'Join room →';
    showScreen('screen-setup');
  },

  goBack() {
    showScreen('screen-onboard');
    State.songs = [];
    State.userId = null;
    State.roomCode = null;
    document.getElementById('song-list').innerHTML = '';
    document.getElementById('name-input').value = '';
    const prev = document.getElementById('avatar-preview');
    prev.classList.add('hidden');
    document.getElementById('avatar-placeholder').style.display = '';
    App._checkReady();
  },

  async proceed() {
    const name = document.getElementById('name-input').value.trim();
    if (!name || State.songs.length === 0) return;
    State.userName = name;
    setLoading(true, State.userId === 'A' ? 'Creating room…' : 'Joining room…');
    try {
      if (State.userId === 'A') {
        await App._createRoom(name);
      } else {
        await App._joinRoom(name);
      }
    } catch (e) {
      console.error(e);
      toast('Error: ' + e.message);
      setLoading(false);
    }
  },

  async _createRoom(name) {
    const code = genNumericCode();
    State.roomCode = code;

    // Store songs locally — no Supabase storage uploads
    const songMeta = State.songs.map(s => ({
      name: s.name,
      duration: s.duration,
      // No URL — loaded from local file
    }));

    // Save to Supabase room table (metadata only)
    const { error } = await sb.from('rooms').insert({
      code,
      user_a_name:   name,
      user_a_songs:  songMeta,
      user_a_avatar: State.avatarUrl || null,
      status:        'waiting',
      listener_count: 1,
    });
    if (error) throw error;

    // Cache locally
    LS.save('session', { code, slot: 'A', name, songs: songMeta });

    setLoading(false);
    App._showWaiting(code, name);
    App._subscribeRoom(code);
  },

  async _joinRoom(name) {
    const code = State.roomCode;
    const { data, error } = await sb.from('rooms').select('*').eq('code', code).single();
    if (error || !data) throw new Error('Room not found. Check the code!');
    if (data.status === 'playing') {
      // Allow as observer/listener
      await App._joinAsListener(data, name);
      return;
    }

    const songMeta = State.songs.map(s => ({ name: s.name, duration: s.duration }));

    const { error: err2 } = await sb.from('rooms').update({
      user_b_name:   name,
      user_b_songs:  songMeta,
      user_b_avatar: State.avatarUrl || null,
      status:        'playing',
      listener_count: 2,
    }).eq('code', code);
    if (err2) throw err2;

    LS.save('session', { code, slot: 'B', name, songs: songMeta });

    setLoading(false);
    State.roomData = { ...data, user_b_name: name, user_b_songs: songMeta };
    App._subscribeRoom(code);
    Player.start(State.roomData, 'B');
  },

  async _joinAsListener(roomData, name) {
    // Listener — no songs to add, just listen/sync
    State.userId = 'listener';
    State.listenerId = 'L_' + Date.now();
    const newCount = (roomData.listener_count || 2) + 1;
    await sb.from('rooms').update({ listener_count: newCount }).eq('code', roomData.code).catch(() => {});

    LS.save('session', { code: roomData.code, slot: 'listener', name });
    setLoading(false);
    toast(`Joined as listener — welcome, ${name}!`);
    State.roomData = roomData;
    App._subscribeRoom(roomData.code);
    // Start player in listener-only mode (no songs from this user)
    Player.start(roomData, 'listener', name);
  },

  _showWaiting(code, name) {
    document.getElementById('room-code-display').textContent = code;
    document.getElementById('you-name-label').textContent = name;
    const avEl = document.getElementById('you-av-small');
    if (State.avatarUrl) {
      avEl.innerHTML = `<img src="${State.avatarUrl}" style="width:100%;height:100%;object-fit:cover;border-radius:50%;" />`;
    } else {
      avEl.textContent = initials(name);
    }
    showScreen('screen-waiting');
  },

  _subscribeRoom(code) {
    if (State.channel) {
      sb.removeChannel(State.channel);
    }
    State.channel = sb.channel(`room:${code}`)
      .on('postgres_changes', {
        event: 'UPDATE',
        schema: 'public',
        table: 'rooms',
        filter: `code=eq.${code}`,
      }, payload => {
        const room = payload.new;
        State.roomData = room;

        // Update listener count everywhere
        App._updateListenerCount(room.listener_count || 2);

        if (room.status === 'playing' && State.userId === 'A') {
          // Friend joined!
          const chip = document.getElementById('friend-chip');
          chip.classList.remove('faded');
          chip.classList.add('arrived');
          const avEl = chip.querySelector('.member-avatar');
          if (room.user_b_avatar) {
            avEl.innerHTML = `<img src="${room.user_b_avatar}" style="width:100%;height:100%;object-fit:cover;border-radius:50%;" />`;
          } else {
            avEl.textContent = initials(room.user_b_name);
          }
          chip.querySelector('span:last-child').textContent = room.user_b_name;
          setTimeout(() => Player.start(room, 'A'), 1000);
        }

        // Room closed by other user
        if (room.status === 'ended') {
          App._onRoomEnded(false);
          return;
        }

        // Sync playback state
        if (room.playback_state && Player.active) {
          Player.syncState(room.playback_state);
        }
      })
      .on('postgres_changes', {
        event: 'DELETE',
        schema: 'public',
        table: 'rooms',
        filter: `code=eq.${code}`,
      }, () => {
        App._onRoomEnded(false);
      })
      .subscribe();
  },

  _updateListenerCount(count) {
    document.getElementById('listener-count-wrap') &&
      (document.getElementById('listener-count-wrap').style.display = count > 2 ? '' : 'none');
    const lc = document.getElementById('listener-count');
    if (lc) lc.textContent = count;
    const plc = document.getElementById('player-listener-count');
    if (plc) plc.textContent = count;
  },

  // ── Sharing ──────────────────────────────────────
  async shareLink() {
    const url = buildShareUrl(State.roomCode);
    if (navigator.share) {
      try {
        await navigator.share({
          title: 'Join my Blend room!',
          text: `Join my music blend room with code ${State.roomCode}`,
          url,
        });
        return;
      } catch (e) { /* fallthrough */ }
    }
    // Clipboard fallback
    try {
      await navigator.clipboard.writeText(url);
      toast('🔗 Invite link copied!');
    } catch (e) {
      toast(`Share this: ${url}`);
    }
  },

  copyCode() {
    const code = State.roomCode;
    navigator.clipboard?.writeText(code).catch(() => {});
    const btn = document.getElementById('copy-btn');
    btn.classList.add('copied');
    btn.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg> Copied!`;
    toast(`Code ${code} copied!`);
    setTimeout(() => {
      btn.classList.remove('copied');
      btn.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg> Copy code`;
    }, 2000);
  },

  // ── Leave / End room ─────────────────────────────
  leaveRoom() {
    App.showConfirm(
      'Leave blend?',
      State.userId === 'A' ? 'This will end the room for everyone.' : 'You\'ll leave the blend.',
      async () => {
        await App._cleanupOnLeave(true);
      }
    );
  },

  showConfirm(title, msg, onOk) {
    document.getElementById('confirm-title').textContent = title;
    document.getElementById('confirm-msg').textContent = msg;
    document.getElementById('confirm-ok-btn').onclick = onOk;
    document.getElementById('confirm-dialog').classList.remove('hidden');
  },

  hideConfirm() {
    document.getElementById('confirm-dialog').classList.add('hidden');
  },

  async _cleanupOnLeave(navigate = true) {
    App.hideConfirm();
    Player.stop();

    if (State.roomCode) {
      try {
        if (State.userId === 'A') {
          // Host leaves — delete room entirely (cascades everything)
          await sb.from('rooms').update({ status: 'ended' }).eq('code', State.roomCode);
          // Small delay then hard delete
          setTimeout(async () => {
            await sb.from('rooms').delete().eq('code', State.roomCode).catch(() => {});
          }, 1500);
        } else if (State.userId === 'B') {
          // User B leaves — mark as ended
          await sb.from('rooms').update({ status: 'ended' }).eq('code', State.roomCode).catch(() => {});
        } else if (State.userId === 'listener') {
          // Decrement count
          const count = (State.roomData?.listener_count || 2) - 1;
          await sb.from('rooms').update({ listener_count: Math.max(2, count) }).eq('code', State.roomCode).catch(() => {});
        }
      } catch (e) { console.warn('Cleanup error', e); }
    }

    // Clear local state
    LS.remove('session');
    if (State.channel) {
      sb.removeChannel(State.channel);
      State.channel = null;
    }

    if (navigate) {
      // Reset all state
      State.roomCode  = null;
      State.userId    = null;
      State.userName  = null;
      State.songs     = [];
      State.roomData  = null;
      document.getElementById('song-list').innerHTML = '';
      document.getElementById('name-input').value = '';
      document.getElementById('avatar-preview').classList.add('hidden');
      document.getElementById('avatar-placeholder').style.display = '';
      App._checkReady();
      showScreen('screen-onboard');
    }
  },

  _onRoomEnded(wasUs) {
    if (!wasUs) {
      toast('The blend has ended 👋');
    }
    Player.stop();
    LS.remove('session');
    if (State.channel) {
      sb.removeChannel(State.channel);
      State.channel = null;
    }
    State.roomCode = null;
    State.userId   = null;
    State.songs    = [];
    State.roomData = null;
    document.getElementById('song-list').innerHTML = '';
    document.getElementById('name-input').value = '';
    document.getElementById('avatar-preview').classList.add('hidden');
    document.getElementById('avatar-placeholder').style.display = '';
    App._checkReady();
    setTimeout(() => showScreen('screen-onboard'), 800);
  },

  _checkReady() {
    const name = (document.getElementById('name-input')?.value || '').trim();
    const btn  = document.getElementById('btn-proceed');
    // Listener mode doesn't need songs
    const needSongs = State.userId !== 'listener';
    if (btn) btn.disabled = !(name && (State.songs.length > 0 || !needSongs));
  },
};

// ── Setup UI events ──────────────────────────────────
document.getElementById('name-input').addEventListener('input', App._checkReady);

document.getElementById('avatar-file').addEventListener('change', e => {
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = ev => {
    State.avatarUrl = ev.target.result;
    const prev = document.getElementById('avatar-preview');
    prev.src = ev.target.result;
    prev.classList.remove('hidden');
    document.getElementById('avatar-placeholder').style.display = 'none';
  };
  reader.readAsDataURL(file);
});

document.getElementById('song-file').addEventListener('change', e => {
  const files = Array.from(e.target.files);
  files.forEach(file => {
    const url = URL.createObjectURL(file);
    const audio = new Audio();
    audio.src = url;
    const addSong = (dur) => {
      const song = { name: stripExt(file.name), duration: dur, file, localUrl: url };
      State.songs.push(song);
      renderSongList();
      App._checkReady();
    };
    audio.addEventListener('loadedmetadata', () => addSong(audio.duration));
    audio.addEventListener('error', () => addSong(0));
  });
  e.target.value = '';
});

function renderSongList() {
  const list = document.getElementById('song-list');
  list.innerHTML = State.songs.map((s, i) => `
    <div class="song-item" id="si-${i}">
      <div class="song-thumb">♪</div>
      <div class="song-info">
        <div class="song-name">${s.name}</div>
        <div class="song-dur">${s.duration ? fmtTime(s.duration) : '—'}</div>
      </div>
      <button class="song-remove" onclick="removeSong(${i})" aria-label="Remove">×</button>
    </div>
  `).join('');
}

function removeSong(i) {
  URL.revokeObjectURL(State.songs[i]?.localUrl);
  State.songs.splice(i, 1);
  renderSongList();
  App._checkReady();
}

document.getElementById('join-code-input').addEventListener('keydown', e => {
  if (e.key === 'Enter') App.showJoin();
});

// ── Player ───────────────────────────────────────────
const Player = {
  active:      false,
  queue:       [],
  idx:         0,
  audio:       new Audio(),
  isPlaying:   false,
  mySlot:      'A',
  myName:      '',
  _eventsSetup: false,

  start(room, mySlot, listenerName) {
    Player.active  = true;
    Player.mySlot  = mySlot;
    Player.myName  = listenerName || (mySlot === 'A' ? room.user_a_name : room.user_b_name) || 'You';

    // Build interleaved queue
    const aS = (room.user_a_songs || []).map(s => ({ ...s, owner: room.user_a_name, slot: 'A' }));
    const bS = (room.user_b_songs || []).map(s => ({ ...s, owner: room.user_b_name, slot: 'B' }));
    Player.queue = [];
    const len = Math.max(aS.length, bS.length);
    for (let i = 0; i < len; i++) {
      if (aS[i]) Player.queue.push(aS[i]);
      if (bS[i]) Player.queue.push(bS[i]);
    }

    // Names
    const myName = mySlot === 'listener' ? listenerName : (mySlot === 'A' ? room.user_a_name : room.user_b_name);
    const frName = mySlot === 'A' ? room.user_b_name : (mySlot === 'B' ? room.user_a_name : room.user_a_name);
    document.getElementById('player-you-name').textContent    = myName || 'You';
    document.getElementById('player-friend-name').textContent = frName || 'Friend';

    showScreen('screen-player');
    Player._setupAudioEvents();
    Player._loadTrack(0);
    Player._play();
    Player._renderQueue();

    // If there's a saved playback state, sync to it
    if (room.playback_state) {
      setTimeout(() => Player.syncState(room.playback_state, true), 800);
    }
  },

  stop() {
    Player.active = false;
    Player.audio.pause();
    Player.audio.src = '';
    Player.isPlaying = false;
    Player.queue = [];
    Player.idx = 0;
  },

  _loadTrack(i) {
    if (Player.queue.length === 0) return;
    if (i >= Player.queue.length) i = 0;
    Player.idx = i;
    const track = Player.queue[i];
    if (!track) return;

    // Use local file if available, otherwise no audio (listeners can't play unless host)
    const localSong = State.songs.find(s => s.name === track.name);
    if (localSong?.localUrl) {
      Player.audio.src = localSong.localUrl;
    } else if (track.url) {
      Player.audio.src = track.url;
    } else {
      // Listener with no local file — muted/sync only
      Player.audio.src = '';
    }

    Player.audio.load();

    const isYou = (track.slot === Player.mySlot);
    document.getElementById('track-name').textContent  = track.name;
    document.getElementById('track-owner').textContent = isYou ? 'From your library' : `From ${track.owner}'s library`;

    const art = document.getElementById('art-inner');
    const tag = document.getElementById('owner-tag');
    art.className = 'art-inner spinning ' + (isYou ? 'you-art' : 'friend-art');
    tag.className = 'owner-tag ' + (isYou ? 'you-tag' : 'friend-tag');
    tag.textContent = isYou ? 'You' : track.owner;

    document.getElementById('progress-fill').style.width = '0%';
    document.getElementById('time-current').textContent = '0:00';
    document.getElementById('time-total').textContent   = fmtTime(track.duration || 0);

    Player._renderQueue();
    Player._broadcastState();
  },

  _setupAudioEvents() {
    if (Player._eventsSetup) return;
    Player._eventsSetup = true;

    Player.audio.addEventListener('timeupdate', () => {
      if (!Player.audio.duration) return;
      const pct = (Player.audio.currentTime / Player.audio.duration) * 100;
      document.getElementById('progress-fill').style.width = pct.toFixed(2) + '%';
      document.getElementById('time-current').textContent = fmtTime(Player.audio.currentTime);
      document.getElementById('time-total').textContent   = fmtTime(Player.audio.duration);
    });

    Player.audio.addEventListener('ended', () => Player.next());

    Player.audio.addEventListener('error', () => {
      // Silently skip if no audio source (listener mode)
      if (Player.audio.src && Player.audio.src !== window.location.href) {
        toast('Could not load audio — skipping');
        setTimeout(() => Player.next(), 1000);
      }
    });
  },

  _play() {
    if (Player.audio.src) {
      Player.audio.play().catch(e => console.warn('Autoplay blocked:', e));
    }
    Player.isPlaying = true;
    document.getElementById('icon-play').classList.add('hidden');
    document.getElementById('icon-pause').classList.remove('hidden');
    document.getElementById('art-inner').classList.add('spinning');
    App._hidePauseBanner();
  },

  _pause(pausedByName) {
    Player.audio.pause();
    Player.isPlaying = false;
    document.getElementById('icon-play').classList.remove('hidden');
    document.getElementById('icon-pause').classList.add('hidden');
    document.getElementById('art-inner').classList.remove('spinning');
    if (pausedByName) {
      App._showPauseBanner(pausedByName);
    }
  },

  togglePlay() {
    if (Player.isPlaying) {
      Player._pause();
    } else {
      Player._play();
    }
    Player._broadcastState();
  },

  next() {
    if (Player.queue.length === 0) return;
    Player._loadTrack((Player.idx + 1) % Player.queue.length);
    if (Player.isPlaying) Player._play();
  },

  prev() {
    if (Player.audio.currentTime > 3) {
      Player.audio.currentTime = 0;
      Player._broadcastState();
      return;
    }
    if (Player.queue.length === 0) return;
    Player._loadTrack((Player.idx - 1 + Player.queue.length) % Player.queue.length);
    if (Player.isPlaying) Player._play();
  },

  _renderQueue() {
    const list = document.getElementById('queue-list');
    if (!list) return;
    const upcoming = Player.queue.slice(Player.idx + 1, Player.idx + 6);
    if (upcoming.length === 0) {
      list.innerHTML = `<div style="font-size:13px;color:var(--text3);padding:8px 0;">End of queue — will loop 🔁</div>`;
      return;
    }
    list.innerHTML = upcoming.map(t => {
      const isYou = t.slot === Player.mySlot;
      const color = isYou ? 'var(--you)' : 'var(--friend)';
      return `<div class="queue-item">
        <div class="queue-dot" style="background:${color}"></div>
        <div class="queue-song">${t.name}</div>
        <div class="queue-owner">${isYou ? 'You' : t.owner}</div>
      </div>`;
    }).join('');
  },

  async _broadcastState() {
    if (!State.roomCode) return;
    const state = {
      idx:         Player.idx,
      playing:     Player.isPlaying,
      time:        Player.audio.currentTime || 0,
      updatedBy:   State.userId,
      updatedName: State.userName || Player.myName,
      ts:          Date.now(),
    };
    await sb.from('rooms')
      .update({ playback_state: state })
      .eq('code', State.roomCode)
      .catch(() => {});
  },

  syncState(ps, force = false) {
    if (!Player.active) return;
    // Don't sync our own broadcasts (unless forced on join)
    if (!force && ps.updatedBy === State.userId) return;

    // Track changed
    if (ps.idx !== undefined && ps.idx !== Player.idx) {
      Player._loadTrack(ps.idx);
    }

    // Sync time if off by >2s
    if (ps.time !== undefined && Math.abs(Player.audio.currentTime - ps.time) > 2) {
      Player.audio.currentTime = ps.time;
    }

    if (ps.playing && !Player.isPlaying) {
      Player._play();
    }
    if (!ps.playing && Player.isPlaying) {
      // Show who paused it (not us)
      const pauserName = ps.updatedName || 'Your friend';
      Player._pause(pauserName !== State.userName ? pauserName : null);
    }
  },
};

// ── Pause banner helpers ─────────────────────────────
App._showPauseBanner = function(name) {
  const banner = document.getElementById('pause-banner');
  if (!banner) return;
  document.getElementById('pause-banner-text').textContent = `⏸ ${name} paused the blend`;
  banner.classList.remove('hidden');
  clearTimeout(App._pauseBannerTimer);
  App._pauseBannerTimer = setTimeout(() => App._hidePauseBanner(), 4000);
};
App._hidePauseBanner = function() {
  const banner = document.getElementById('pause-banner');
  if (banner) banner.classList.add('hidden');
};

// ── Init ──────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => App.init());
