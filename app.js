// ══════════════════════════════════════════════════════
// BLEND — Supabase realtime + synced playback + cleanup
// ══════════════════════════════════════════════════════

'use strict';

const sb = supabase.createClient(SUPABASE_URL, SUPABASE_ANON);

const State = {
  roomCode: null,
  userId: null,
  userName: null,
  avatarUrl: null,
  songs: [],
  roomData: null,
  channel: null,
  presenceChannel: null,
  shareLink: null,
};

function genCode() {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

function fmtTime(s) {
  s = Math.floor(s || 0);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

function stripExt(n) {
  return n.replace(/\.[^.]+$/, '').replace(/[_-]/g, ' ');
}

function initials(n) {
  return (n || '?').split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2);
}

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

function saveProfile() {
  localStorage.setItem('blend_profile', JSON.stringify({
    name: State.userName,
    avatar: State.avatarUrl,
  }));
}

function loadProfile() {
  try {
    const saved = JSON.parse(localStorage.getItem('blend_profile') || '{}');
    if (saved.name) document.getElementById('name-input').value = saved.name;
    if (saved.avatar) {
      State.avatarUrl = saved.avatar;
      document.getElementById('avatar-preview').src = saved.avatar;
      document.getElementById('avatar-preview').classList.remove('hidden');
      document.getElementById('avatar-placeholder').style.display = 'none';
    }
  } catch {}
}

const App = {
  init() {
    loadProfile();

    const params = new URLSearchParams(location.search);
    const room = params.get('room');
    if (room && /^\d{6}$/.test(room)) {
      document.getElementById('join-code-input').value = room;
      toast('Room code loaded from link');
    }

    App._checkReady();
  },

  showCreate() {
    State.userId = 'A';
    document.getElementById('setup-title').textContent = 'Create your profile';
    document.getElementById('btn-proceed-label').textContent = 'Create room →';
    showScreen('screen-setup');
  },

  showJoin() {
    const code = document.getElementById('join-code-input').value.trim();
    if (!/^\d{6}$/.test(code)) {
      toast('Enter valid 6 digit room code');
      return;
    }

    State.userId = 'B';
    State.roomCode = code;
    document.getElementById('setup-title').textContent = 'Join the blend';
    document.getElementById('btn-proceed-label').textContent = 'Join room →';
    showScreen('screen-setup');
  },

  goBack() {
    showScreen('screen-onboard');
  },

  async proceed() {
    const name = document.getElementById('name-input').value.trim();
    if (!name || State.songs.length === 0) return;

    State.userName = name;
    saveProfile();

    setLoading(true, State.userId === 'A' ? 'Creating room…' : 'Joining room…');

    try {
      if (State.userId === 'A') await App._createRoom(name);
      else await App._joinRoom(name);
    } catch (e) {
      console.error(e);
      toast('Error: ' + e.message);
      setLoading(false);
    }
  },

  async _createRoom(name) {
    let code = genCode();
    State.roomCode = code;

    const songMeta = await App._uploadSongs('A');

    const { error } = await sb.from('rooms').insert({
      code,
      user_a_name: name,
      user_a_songs: songMeta,
      user_a_avatar: State.avatarUrl,
      status: 'waiting',
      playback_state: null,
      created_at: new Date().toISOString(),
    });

    if (error) throw error;

    State.shareLink = `${location.origin}${location.pathname}?room=${code}`;

    setLoading(false);
    App._showWaiting(code, name);
    App._subscribeRoom(code);
    App._setupPresence(code);
  },

  async _joinRoom(name) {
    const code = State.roomCode;

    const { data, error } = await sb.from('rooms').select('*').eq('code', code).single();

    if (error || !data) throw new Error('Room not found');
    if (data.status === 'ended') throw new Error('This blend already ended');
    if (data.user_b_name && data.status === 'playing') {
      throw new Error('Room already has 2 main users');
    }

    const songMeta = await App._uploadSongs('B');

    const { error: err2 } = await sb.from('rooms').update({
      user_b_name: name,
      user_b_songs: songMeta,
      user_b_avatar: State.avatarUrl,
      status: 'playing',
    }).eq('code', code);

    if (err2) throw err2;

    setLoading(false);

    State.roomData = {
      ...data,
      user_b_name: name,
      user_b_songs: songMeta,
      status: 'playing',
    };

    App._subscribeRoom(code);
    App._setupPresence(code);
    Player.start(State.roomData, 'B');
  },

  async _uploadSongs(slot) {
    const meta = [];

    for (const song of State.songs) {
      if (!song.file) continue;

      const safeName = song.name.replace(/[^\w\s.-]/g, '').slice(0, 80);
      const key = `${State.roomCode}/${slot}/${Date.now()}_${safeName}`;

      const { error } = await sb.storage.from(STORAGE_BUCKET).upload(key, song.file, {
        contentType: song.file.type || 'audio/mpeg',
        upsert: true,
      });

      if (error) throw error;

      const { data: urlData } = sb.storage.from(STORAGE_BUCKET).getPublicUrl(key);

      meta.push({
        name: song.name,
        duration: song.duration || 0,
        url: urlData.publicUrl,
        storageKey: key,
      });
    }

    return meta;
  },

  _showWaiting(code, name) {
    document.getElementById('room-code-display').textContent = code;
    document.getElementById('you-name-label').textContent = name;

    const avEl = document.getElementById('you-av-small');
    avEl.textContent = initials(name);

    App._injectShareUI();

    showScreen('screen-waiting');
  },

  _injectShareUI() {
    if (document.getElementById('share-link-btn')) return;

    const card = document.querySelector('.room-card');

    const btn = document.createElement('button');
    btn.id = 'share-link-btn';
    btn.className = 'copy-btn';
    btn.style.marginTop = '10px';
    btn.textContent = 'Copy share link';
    btn.onclick = App.copyShareLink;

    card.appendChild(btn);
  },

  _injectEndButton() {
    if (document.getElementById('end-blend-btn')) return;

    const top = document.querySelector('.player-top');

    const btn = document.createElement('button');
    btn.id = 'end-blend-btn';
    btn.className = 'copy-btn';
    btn.textContent = 'End Blend';
    btn.onclick = App.endBlend;

    top.appendChild(btn);
  },

  _subscribeRoom(code) {
    if (State.channel) sb.removeChannel(State.channel);

    State.channel = sb.channel(`room-db-${code}`)
      .on('postgres_changes', {
        event: 'UPDATE',
        schema: 'public',
        table: 'rooms',
        filter: `code=eq.${code}`,
      }, payload => {
        const room = payload.new;
        State.roomData = room;

        if (room.status === 'ended') {
          toast('Blend ended');
          Player.stop();
          showScreen('screen-onboard');
          return;
        }

        if (room.status === 'playing' && State.userId === 'A' && !Player.active) {
          const chip = document.getElementById('friend-chip');
          chip.classList.remove('faded');
          chip.classList.add('arrived');
          chip.querySelector('.member-avatar').textContent = initials(room.user_b_name);
          chip.querySelector('span:last-child').textContent = room.user_b_name;

          setTimeout(() => Player.start(room, 'A'), 800);
        }

        if (room.playback_state && Player.active) {
          Player.syncState(room.playback_state);
        }
      })
      .subscribe();
  },

  _setupPresence(code) {
    if (State.presenceChannel) sb.removeChannel(State.presenceChannel);

    State.presenceChannel = sb.channel(`presence-${code}`, {
      config: { presence: { key: `${State.userId}-${Date.now()}` } },
    });

    State.presenceChannel
      .on('presence', { event: 'sync' }, () => {
        const state = State.presenceChannel.presenceState();
        const count = Object.keys(state).length;
        if (count > 1) toast(`${count} devices online`, 1200);
      })
      .subscribe(async status => {
        if (status === 'SUBSCRIBED') {
          await State.presenceChannel.track({
            name: State.userName,
            slot: State.userId,
            onlineAt: Date.now(),
          });
        }
      });
  },

  copyCode() {
    const code = State.roomCode;
    navigator.clipboard?.writeText(code);
    toast(`Code ${code} copied`);
  },

  copyShareLink() {
    const link = `${location.origin}${location.pathname}?room=${State.roomCode}`;
    navigator.clipboard?.writeText(link);
    toast('Share link copied');
  },

  async endBlend() {
    if (!State.roomData) return;

    setLoading(true, 'Ending blend…');

    try {
      await App._deleteRoomFiles(State.roomData);

      await sb.from('rooms').update({
        status: 'ended',
        user_a_songs: [],
        user_b_songs: [],
        playback_state: null,
        ended_at: new Date().toISOString(),
        ended_by: State.userName,
      }).eq('code', State.roomCode);

      setLoading(false);
      toast('Blend ended and songs deleted');
      Player.stop();
      showScreen('screen-onboard');
    } catch (e) {
      console.error(e);
      setLoading(false);
      toast('Could not fully delete: ' + e.message);
    }
  },

  async _deleteRoomFiles(room) {
    const paths = [];

    [...(room.user_a_songs || []), ...(room.user_b_songs || [])].forEach(s => {
      if (s.storageKey) paths.push(s.storageKey);
    });

    if (paths.length > 0) {
      const { error } = await sb.storage.from(STORAGE_BUCKET).remove(paths);
      if (error) console.warn(error.message);
    }
  },

  _checkReady() {
    const name = (document.getElementById('name-input')?.value || '').trim();
    const btn = document.getElementById('btn-proceed');
    if (btn) btn.disabled = !(name && State.songs.length > 0);
  },
};

// UI events
document.getElementById('name-input').addEventListener('input', App._checkReady);

document.getElementById('avatar-file').addEventListener('change', e => {
  const file = e.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = ev => {
    State.avatarUrl = ev.target.result;
    const prev = document.getElementById('avatar-preview');
    const ph = document.getElementById('avatar-placeholder');

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
      State.songs.push({
        name: stripExt(file.name),
        duration: audio.duration,
        file,
        localUrl: url,
      });

      renderSongList();
      App._checkReady();
    });

    audio.addEventListener('error', () => {
      State.songs.push({
        name: stripExt(file.name),
        duration: 0,
        file,
        localUrl: url,
      });

      renderSongList();
      App._checkReady();
    });
  });

  e.target.value = '';
});

document.getElementById('join-code-input').addEventListener('keydown', e => {
  if (e.key === 'Enter') App.showJoin();
});

function renderSongList() {
  const list = document.getElementById('song-list');

  list.innerHTML = State.songs.map((s, i) => `
    <div class="song-item">
      <div class="song-thumb">♪</div>
      <div class="song-info">
        <div class="song-name">${s.name}</div>
        <div class="song-dur">${s.duration ? fmtTime(s.duration) : '—'}</div>
      </div>
      <button class="song-remove" onclick="removeSong(${i})">×</button>
    </div>
  `).join('');
}

function removeSong(i) {
  State.songs.splice(i, 1);
  renderSongList();
  App._checkReady();
}

const Player = {
  active: false,
  queue: [],
  idx: 0,
  audio: new Audio(),
  isPlaying: false,
  mySlot: 'A',
  syncTimer: null,
  ignoreSync: false,

  start(room, mySlot) {
    Player.active = true;
    Player.mySlot = mySlot;

    const aS = (room.user_a_songs || []).map(s => ({ ...s, owner: room.user_a_name, slot: 'A' }));
    const bS = (room.user_b_songs || []).map(s => ({ ...s, owner: room.user_b_name, slot: 'B' }));

    Player.queue = [];

    const len = Math.max(aS.length, bS.length);
    for (let i = 0; i < len; i++) {
      if (aS[i]) Player.queue.push(aS[i]);
      if (bS[i]) Player.queue.push(bS[i]);
    }

    if (Player.queue.length === 0) {
      toast('No songs found');
      return;
    }

    document.getElementById('player-you-name').textContent =
      mySlot === 'A' ? room.user_a_name : room.user_b_name;

    document.getElementById('player-friend-name').textContent =
      mySlot === 'A' ? room.user_b_name : room.user_a_name;

    showScreen('screen-player');
    App._injectEndButton();

    Player._setupAudioEvents();
    Player._loadTrack(0);
    Player._play();

    clearInterval(Player.syncTimer);
    Player.syncTimer = setInterval(() => {
      if (Player.active && Player.isPlaying) Player._broadcastState('sync');
    }, 1200);
  },

  stop() {
    Player.active = false;
    Player.audio.pause();
    Player.audio.src = '';
    clearInterval(Player.syncTimer);
  },

  _loadTrack(i) {
    if (i >= Player.queue.length) i = 0;
    if (i < 0) i = Player.queue.length - 1;

    Player.idx = i;

    const track = Player.queue[i];
    const localSong = State.songs.find(s => s.name === track.name);

    Player.audio.src = localSong?.localUrl || track.url;
    Player.audio.load();

    const isYou = track.slot === Player.mySlot;

    document.getElementById('track-name').textContent = track.name;
    document.getElementById('track-owner').textContent =
      isYou ? 'From your library' : `From ${track.owner}`;

    const art = document.getElementById('art-inner');
    const tag = document.getElementById('owner-tag');

    art.className = 'art-inner spinning ' + (isYou ? 'you-art' : 'friend-art');
    tag.className = 'owner-tag ' + (isYou ? 'you-tag' : 'friend-tag');
    tag.textContent = isYou ? 'You' : track.owner;

    document.getElementById('progress-fill').style.width = '0%';
    document.getElementById('time-current').textContent = '0:00';
    document.getElementById('time-total').textContent = fmtTime(track.duration || 0);

    Player._renderQueue();
  },

  _setupAudioEvents() {
    if (Player.audio._ready) return;
    Player.audio._ready = true;

    Player.audio.addEventListener('timeupdate', () => {
      if (!Player.audio.duration) return;

      const pct = (Player.audio.currentTime / Player.audio.duration) * 100;
      document.getElementById('progress-fill').style.width = pct.toFixed(2) + '%';
      document.getElementById('time-current').textContent = fmtTime(Player.audio.currentTime);
      document.getElementById('time-total').textContent = fmtTime(Player.audio.duration);
    });

    Player.audio.addEventListener('ended', () => Player.next());

    Player.audio.addEventListener('error', () => {
      toast('Audio failed, skipping');
      setTimeout(() => Player.next(), 800);
    });
  },

  _play() {
    Player.audio.play().catch(() => {
      toast('Tap play to start audio');
    });

    Player.isPlaying = true;

    document.getElementById('icon-play').classList.add('hidden');
    document.getElementById('icon-pause').classList.remove('hidden');
    document.getElementById('art-inner').classList.add('spinning');
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
      Player._broadcastState('pause');
    } else {
      Player._play();
      Player._broadcastState('play');
    }
  },

  next() {
    Player._loadTrack(Player.idx + 1);
    if (Player.isPlaying) Player._play();
    Player._broadcastState('next');
  },

  prev() {
    if (Player.audio.currentTime > 3) {
      Player.audio.currentTime = 0;
      Player._broadcastState('seek');
      return;
    }

    Player._loadTrack(Player.idx - 1);
    if (Player.isPlaying) Player._play();
    Player._broadcastState('prev');
  },

  _renderQueue() {
    const list = document.getElementById('queue-list');
    const upcoming = Player.queue.slice(Player.idx + 1, Player.idx + 5);

    if (!upcoming.length) {
      list.innerHTML = `<div style="font-size:13px;color:var(--text3);padding:8px 0;">End of queue — will loop</div>`;
      return;
    }

    list.innerHTML = upcoming.map(t => {
      const isYou = t.slot === Player.mySlot;
      return `
        <div class="queue-item">
          <div class="queue-dot"></div>
          <div class="queue-song">${t.name}</div>
          <div class="queue-owner">${isYou ? 'You' : t.owner}</div>
        </div>
      `;
    }).join('');
  },

  async _broadcastState(action = 'sync') {
    if (!State.roomCode || Player.ignoreSync) return;

    const state = {
      idx: Player.idx,
      playing: Player.isPlaying,
      time: Player.audio.currentTime || 0,
      action,
      byName: State.userName,
      updatedBy: State.userId,
      updatedAt: Date.now(),
    };

    await sb.from('rooms').update({
      playback_state: state,
    }).eq('code', State.roomCode);
  },

  syncState(ps) {
    if (!ps || ps.updatedBy === State.userId) return;

    Player.ignoreSync = true;

    if (typeof ps.idx === 'number' && ps.idx !== Player.idx) {
      Player._loadTrack(ps.idx);
    }

    if (Math.abs(Player.audio.currentTime - ps.time) > 1.5) {
      Player.audio.currentTime = ps.time || 0;
    }

    if (ps.playing && !Player.isPlaying) {
      Player._play();
      if (ps.action === 'play') toast(`${ps.byName} resumed song`);
    }

    if (!ps.playing && Player.isPlaying) {
      Player._pause();
      if (ps.action === 'pause') toast(`${ps.byName} paused song`);
    }

    setTimeout(() => {
      Player.ignoreSync = false;
    }, 300);
  },
};

window.addEventListener('beforeunload', () => {
  if (State.presenceChannel) {
    State.presenceChannel.untrack();
  }
});

App.init();
