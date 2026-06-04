// ══════════════════════════════════════════════════════
//  BLEND — Main Application
//  Supabase realtime + local audio playback
// ══════════════════════════════════════════════════════

'use strict';

// ── Supabase client ──────────────────────────────────
const sb = supabase.createClient(SUPABASE_URL, SUPABASE_ANON);

// ── State ────────────────────────────────────────────
const State = {
  roomCode:    null,
  userId:      null,   // 'A' or 'B'
  userName:    null,
  avatarUrl:   null,
  songs:       [],     // [{name, duration, file, storageKey}]
  roomData:    null,
  channel:     null,
};

// ── Utils ────────────────────────────────────────────
function genCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  return Array.from({length: 5}, () => chars[Math.floor(Math.random() * chars.length)]).join('');
}
function fmtTime(s) {
  s = Math.floor(s || 0);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}
function stripExt(n) { return n.replace(/\.[^.]+$/, '').replace(/[_-]/g, ' '); }
function initials(n) { return (n || '?').split(' ').map(w => w[0]).join('').toUpperCase().slice(0,2); }

function toast(msg, duration = 2500) {
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
  const el = document.getElementById('loading');
  document.getElementById('loading-text').textContent = text;
  el.classList.toggle('hidden', !show);
}

// ── App controller ───────────────────────────────────
const App = {

  showCreate() {
    State.userId = 'A';
    document.getElementById('setup-title').textContent = 'Create your profile';
    document.getElementById('btn-proceed-label').textContent = 'Create room →';
    showScreen('screen-setup');
  },

  showJoin() {
    const code = document.getElementById('join-code-input').value.trim().toUpperCase();
    if (code.length < 4) { toast('Enter a room code first'); return; }
    State.userId   = 'B';
    State.roomCode = code;
    document.getElementById('setup-title').textContent = 'Join the blend';
    document.getElementById('btn-proceed-label').textContent = 'Join room →';
    showScreen('screen-setup');
  },

  goBack() {
    showScreen('screen-onboard');
    State.songs = [];
    document.getElementById('song-list').innerHTML = '';
    document.getElementById('name-input').value = '';
    document.getElementById('avatar-preview').classList.add('hidden');
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
    const code = genCode();
    State.roomCode = code;

    const songMeta = await App._uploadSongs('A');

    const { error } = await sb.from('rooms').insert({
      code,
      user_a_name:  name,
      user_a_songs: songMeta,
      user_a_avatar: State.avatarUrl,
      status: 'waiting',
    });

    if (error) throw error;

    setLoading(false);
    App._showWaiting(code, name);
    App._subscribeRoom(code);
  },

  async _joinRoom(name) {
    const code = State.roomCode;
    const { data, error } = await sb.from('rooms').select('*').eq('code', code).single();
    if (error || !data) throw new Error('Room not found. Check the code!');
    if (data.status === 'playing') throw new Error('This room is already full.');

    const songMeta = await App._uploadSongs('B');

    const { error: err2 } = await sb.from('rooms').update({
      user_b_name:  name,
      user_b_songs: songMeta,
      user_b_avatar: State.avatarUrl,
      status: 'playing',
    }).eq('code', code);

    if (err2) throw err2;

    setLoading(false);
    State.roomData = { ...data, user_b_name: name, user_b_songs: songMeta };
    App._subscribeRoom(code);
    Player.start(State.roomData, 'B');
  },

  async _uploadSongs(slot) {
    const meta = [];
    for (const song of State.songs) {
      if (!song.file) continue;
      const key = `${State.roomCode}/${slot}/${Date.now()}_${song.name}`;
      const { error } = await sb.storage.from(STORAGE_BUCKET).upload(key, song.file, {
        contentType: song.file.type || 'audio/mpeg',
        upsert: true,
      });
      if (error) { console.warn('Upload warn:', error.message); }
      const { data: urlData } = sb.storage.from(STORAGE_BUCKET).getPublicUrl(key);
      meta.push({ name: song.name, duration: song.duration, url: urlData.publicUrl });
    }
    return meta;
  },

  _showWaiting(code, name) {
    document.getElementById('room-code-display').textContent = code;
    document.getElementById('you-name-label').textContent = name;
    const avEl = document.getElementById('you-av-small');
    if (State.avatarUrl) {
      avEl.innerHTML = `<img src="${State.avatarUrl}" alt="${name}" style="width:100%;height:100%;object-fit:cover;border-radius:50%;" />`;
    } else {
      avEl.textContent = initials(name);
    }
    showScreen('screen-waiting');
  },

  _subscribeRoom(code) {
    State.channel = sb.channel(`room:${code}`)
      .on('postgres_changes', {
        event: 'UPDATE',
        schema: 'public',
        table: 'rooms',
        filter: `code=eq.${code}`,
      }, payload => {
        const room = payload.new;
        State.roomData = room;

        if (room.status === 'playing' && State.userId === 'A') {
          // Friend joined!
          const chip = document.getElementById('friend-chip');
          chip.classList.remove('faded');
          chip.classList.add('arrived');
          chip.querySelector('.member-avatar').textContent = initials(room.user_b_name);
          chip.querySelector('span:last-child').textContent = room.user_b_name;

          setTimeout(() => Player.start(room, 'A'), 1200);
        }

        // Sync playback state changes
        if (room.playback_state && Player.active) {
          Player.syncState(room.playback_state);
        }
      })
      .subscribe();
  },

  copyCode() {
    const code = State.roomCode;
    navigator.clipboard?.writeText(code).catch(() => {});
    const btn = document.getElementById('copy-btn');
    btn.classList.add('copied');
    btn.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg> Copied!`;
    toast(`Code "${code}" copied!`);
    setTimeout(() => {
      btn.classList.remove('copied');
      btn.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg> Copy code`;
    }, 2000);
  },

  _checkReady() {
    const name = (document.getElementById('name-input')?.value || '').trim();
    const btn  = document.getElementById('btn-proceed');
    if (btn) btn.disabled = !(name && State.songs.length > 0);
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
    const ph   = document.getElementById('avatar-placeholder');
    prev.src = ev.target.result;
    prev.classList.remove('hidden');
    ph.style.display = 'none';
  };
  reader.readAsDataURL(file);
});

document.getElementById('song-file').addEventListener('change', e => {
  const files = Array.from(e.target.files);
  files.forEach(file => {
    const url = URL.createObjectURL(file);
    const audio = new Audio();
    audio.src = url;
    audio.addEventListener('loadedmetadata', () => {
      const song = { name: stripExt(file.name), duration: audio.duration, file, localUrl: url };
      State.songs.push(song);
      renderSongList();
      App._checkReady();
    });
    audio.addEventListener('error', () => {
      const song = { name: stripExt(file.name), duration: 0, file, localUrl: url };
      State.songs.push(song);
      renderSongList();
      App._checkReady();
    });
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
  State.songs.splice(i, 1);
  renderSongList();
  App._checkReady();
}

// Allow pressing Enter on join input
document.getElementById('join-code-input').addEventListener('keydown', e => {
  if (e.key === 'Enter') App.showJoin();
});

// ── Player ───────────────────────────────────────────
const Player = {
  active:     false,
  queue:      [],       // [{name, url, owner, ownerSlot}]
  idx:        0,
  audio:      new Audio(),
  isPlaying:  false,
  syncTimer:  null,
  mySlot:     'A',

  start(room, mySlot) {
    Player.active  = true;
    Player.mySlot  = mySlot;

    // Build interleaved queue
    const aS = (room.user_a_songs || []).map(s => ({ ...s, owner: room.user_a_name, slot: 'A' }));
    const bS = (room.user_b_songs || []).map(s => ({ ...s, owner: room.user_b_name, slot: 'B' }));
    Player.queue = [];
    const len = Math.max(aS.length, bS.length);
    for (let i = 0; i < len; i++) {
      if (aS[i]) Player.queue.push(aS[i]);
      if (bS[i]) Player.queue.push(bS[i]);
    }

    // Update player header
    const myName = mySlot === 'A' ? room.user_a_name : room.user_b_name;
    const frName = mySlot === 'A' ? room.user_b_name : room.user_a_name;
    document.getElementById('player-you-name').textContent    = myName || 'You';
    document.getElementById('player-friend-name').textContent = frName || 'Friend';

    showScreen('screen-player');
    Player._loadTrack(0);
    Player._play();
    Player._setupAudioEvents();
    Player._renderQueue();
  },

  _loadTrack(i) {
    if (i >= Player.queue.length) i = 0;
    Player.idx = i;
    const track = Player.queue[i];
    if (!track) return;

    // Try local file first (for uploader), else use storage URL
    const localSong = State.songs.find(s => s.name === track.name);
    Player.audio.src = (localSong?.localUrl) || track.url;
    Player.audio.load();

    const isYou = (track.slot === Player.mySlot);

    document.getElementById('track-name').textContent  = track.name;
    document.getElementById('track-owner').textContent = isYou ? 'From your library' : `From ${track.owner}'s library`;

    const art  = document.getElementById('art-inner');
    const tag  = document.getElementById('owner-tag');
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
    const audio = Player.audio;

    audio.addEventListener('timeupdate', () => {
      if (!audio.duration) return;
      const pct = (audio.currentTime / audio.duration) * 100;
      document.getElementById('progress-fill').style.width = pct.toFixed(2) + '%';
      document.getElementById('time-current').textContent = fmtTime(audio.currentTime);
      document.getElementById('time-total').textContent   = fmtTime(audio.duration);
    });

    audio.addEventListener('ended', () => Player.next());

    audio.addEventListener('error', () => {
      toast('Could not load audio — skipping');
      setTimeout(() => Player.next(), 1000);
    });
  },

  _play() {
    Player.audio.play().catch(e => console.warn('Autoplay blocked:', e));
    Player.isPlaying = true;
    document.getElementById('icon-play').classList.add('hidden');
    document.getElementById('icon-pause').classList.remove('hidden');
  },

  _pause() {
    Player.audio.pause();
    Player.isPlaying = false;
    document.getElementById('icon-play').classList.remove('hidden');
    document.getElementById('icon-pause').classList.add('hidden');
    document.getElementById('art-inner').classList.remove('spinning');
  },

  togglePlay() {
    if (Player.isPlaying) {
      Player._pause();
    } else {
      Player._play();
      document.getElementById('art-inner').classList.add('spinning');
    }
    Player._broadcastState();
  },

  next() {
    Player._loadTrack((Player.idx + 1) % Player.queue.length);
    if (Player.isPlaying) Player._play();
  },

  prev() {
    if (Player.audio.currentTime > 3) {
      Player.audio.currentTime = 0;
      return;
    }
    Player._loadTrack((Player.idx - 1 + Player.queue.length) % Player.queue.length);
    if (Player.isPlaying) Player._play();
  },

  _renderQueue() {
    const list = document.getElementById('queue-list');
    const upcoming = Player.queue.slice(Player.idx + 1, Player.idx + 5);
    if (upcoming.length === 0) {
      list.innerHTML = `<div style="font-size:13px;color:var(--text3);padding:8px 0;">End of queue — will loop</div>`;
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
    if (!State.roomCode || !State.channel) return;
    const state = {
      idx:       Player.idx,
      playing:   Player.isPlaying,
      time:      Player.audio.currentTime,
      updatedBy: State.userId,
    };
    // Write to DB so late-joiner / refresh gets state
    await sb.from('rooms').update({ playback_state: state }).eq('code', State.roomCode).catch(() => {});
  },

  syncState(ps) {
    // Ignore our own broadcasts
    if (ps.updatedBy === State.userId) return;
    if (ps.idx !== Player.idx) {
      Player._loadTrack(ps.idx);
    }
    // Sync time if off by >2s
    if (Math.abs(Player.audio.currentTime - ps.time) > 2) {
      Player.audio.currentTime = ps.time;
    }
    if (ps.playing && !Player.isPlaying) Player._play();
    if (!ps.playing && Player.isPlaying) Player._pause();
  },
};
