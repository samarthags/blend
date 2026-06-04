'use strict';

const sb = supabase.createClient(SUPABASE_URL, SUPABASE_ANON);

const State = {
  roomCode: null,
  userId: null,
  userName: null,
  songs: [],
  roomData: null,
  channel: null,
  presenceChannel: null,
  syncChannel: null,
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

function esc(s) {
  return String(s || '').replace(/[&<>"']/g, m => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#039;'
  }[m]));
}

function toast(msg, duration = 2200) {
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

function estimateStorage() {
  const total = State.songs.reduce((sum, s) => sum + (s.file?.size || 0), 0);
  const mb = total / 1024 / 1024;
  document.getElementById('storage-warning').textContent =
    `Cloud use: ${mb.toFixed(1)} MB. Deleted after blend ends.`;
}

function saveProfile() {
  localStorage.setItem('blend_profile', JSON.stringify({ name: State.userName }));
}

function loadProfile() {
  try {
    const data = JSON.parse(localStorage.getItem('blend_profile') || '{}');
    if (data.name) document.getElementById('name-input').value = data.name;
  } catch {}
}

function saveLastRoom() {
  localStorage.setItem('last_blend_room', JSON.stringify({
    code: State.roomCode,
    userId: State.userId,
    name: State.userName,
    time: Date.now()
  }));
}

function clearLastRoom() {
  localStorage.removeItem('last_blend_room');
}

async function setActivity(text) {
  const el = document.getElementById('live-activity');
  if (el) el.textContent = text;

  if (!State.roomCode) return;

  await sb.from('rooms').update({
    activity: { text, by: State.userName, at: Date.now() }
  }).eq('code', State.roomCode);
}

const QueueBuilder = {
  mode: 'balanced',

  build(room) {
    const a = (room.user_a_songs || []).map(s => ({ ...s, owner: room.user_a_name, slot: 'A' }));
    const b = (room.user_b_songs || []).map(s => ({ ...s, owner: room.user_b_name, slot: 'B' }));

    return QueueBuilder.mode === 'smart'
      ? QueueBuilder.smart(a, b)
      : QueueBuilder.balanced(a, b);
  },

  balanced(a, b) {
    const q = [];
    const max = Math.max(a.length, b.length);

    for (let i = 0; i < max; i++) {
      if (a[i]) q.push(a[i]);
      if (b[i]) q.push(b[i]);
    }

    return q;
  },

  smart(a, b) {
    const q = [];
    const aa = [...a].sort((x, y) => (x.duration || 0) - (y.duration || 0));
    const bb = [...b].sort((x, y) => (x.duration || 0) - (y.duration || 0));
    const max = Math.max(aa.length, bb.length);

    for (let i = 0; i < max; i++) {
      if (i % 2 === 0) {
        if (aa[i]) q.push(aa[i]);
        if (bb[i]) q.push(bb[i]);
      } else {
        if (bb[i]) q.push(bb[i]);
        if (aa[i]) q.push(aa[i]);
      }
    }

    return q;
  }
};

const App = {
  init() {
    loadProfile();

    const params = new URLSearchParams(location.search);
    const room = params.get('room');

    if (room && /^\d{6}$/.test(room)) {
      document.getElementById('join-code-input').value = room;
      toast('Room loaded from link');
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
      toast('Enter valid 6 digit code');
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
    if (!name || !State.songs.length) return;

    State.userName = name;
    saveProfile();

    setLoading(true, State.userId === 'A' ? 'Creating room…' : 'Joining room…');

    try {
      if (State.userId === 'A') await App._createRoom(name);
      else await App._joinRoom(name);
    } catch (e) {
      console.error(e);
      setLoading(false);
      toast(e.message);
    }
  },

  async _createRoom(name) {
    State.roomCode = genCode();

    const songMeta = await App._uploadSongs('A');

    const { error } = await sb.from('rooms').insert({
      code: State.roomCode,
      user_a_name: name,
      user_a_songs: songMeta,
      status: 'waiting',
      queue_mode: 'balanced',
      playback_state: {},
      activity: { text: `${name} created the blend`, by: name, at: Date.now() }
    });

    if (error) throw error;

    setLoading(false);

    document.getElementById('room-code-display').textContent = State.roomCode;
    document.getElementById('you-name-label').textContent = name;
    document.getElementById('you-av-small').textContent = initials(name);

    showScreen('screen-waiting');

    App._subscribeRoom(State.roomCode);
    App._setupPresence(State.roomCode);
    saveLastRoom();
  },

  async _joinRoom(name) {
    const { data, error } = await sb.from('rooms').select('*').eq('code', State.roomCode).single();

    if (error || !data) throw new Error('Room not found');
    if (data.user_b_name) throw new Error('Room already full');

    const songMeta = await App._uploadSongs('B');

    const { error: err2 } = await sb.from('rooms').update({
      user_b_name: name,
      user_b_songs: songMeta,
      status: 'playing',
      activity: { text: `${name} joined the blend`, by: name, at: Date.now() }
    }).eq('code', State.roomCode);

    if (err2) throw err2;

    State.roomData = {
      ...data,
      user_b_name: name,
      user_b_songs: songMeta,
      status: 'playing'
    };

    setLoading(false);

    App._subscribeRoom(State.roomCode);
    App._setupPresence(State.roomCode);
    saveLastRoom();

    Player.start(State.roomData, 'B');
  },

  async _uploadSongs(slot) {
    const meta = [];

    for (const song of State.songs) {
      const safe = song.name.replace(/[^\w\s.-]/g, '').slice(0, 70);
      const key = `${State.roomCode}/${slot}/${Date.now()}_${safe}`;

      const { error } = await sb.storage.from(STORAGE_BUCKET).upload(key, song.file, {
        contentType: song.file.type || 'audio/mpeg',
        upsert: true
      });

      if (error) throw error;

      const { data } = sb.storage.from(STORAGE_BUCKET).getPublicUrl(key);

      meta.push({
        name: song.name,
        duration: song.duration || 0,
        url: data.publicUrl,
        storageKey: key,
        size: song.file.size || 0
      });
    }

    return meta;
  },

  _subscribeRoom(code) {
    if (State.channel) sb.removeChannel(State.channel);

    State.channel = sb.channel(`room-db-${code}`)
      .on('postgres_changes', {
        event: 'UPDATE',
        schema: 'public',
        table: 'rooms',
        filter: `code=eq.${code}`
      }, payload => {
        const room = payload.new;
        State.roomData = room;

        if (room.activity?.text) {
          document.getElementById('live-activity').textContent = room.activity.text;
        }

        if (room.queue_mode) {
          QueueBuilder.mode = room.queue_mode;
          Player.updateModeUI();
        }

        if (room.status === 'playing' && State.userId === 'A' && !Player.active) {
          const chip = document.getElementById('friend-chip');
          chip.classList.remove('faded');
          chip.querySelector('.member-avatar').textContent = initials(room.user_b_name);
          chip.querySelector('span:last-child').textContent = room.user_b_name;

          setTimeout(() => Player.start(room, 'A'), 500);
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
      config: { presence: { key: `${State.userId}-${Date.now()}` } }
    });

    State.presenceChannel
      .on('presence', { event: 'sync' }, () => {
        const count = Object.keys(State.presenceChannel.presenceState()).length;
        document.getElementById('sync-status').textContent =
          `${count} device${count === 1 ? '' : 's'} online`;
      })
      .subscribe(async status => {
        if (status === 'SUBSCRIBED') {
          await State.presenceChannel.track({
            name: State.userName,
            slot: State.userId,
            onlineAt: Date.now()
          });
        }
      });
  },

  copyCode() {
    navigator.clipboard?.writeText(State.roomCode);
    toast('Code copied');
  },

  copyShareLink() {
    const link = `${location.origin}${location.pathname}?room=${State.roomCode}`;
    navigator.clipboard?.writeText(link);
    toast('Share link copied');
  },

  async endBlend() {
    if (!State.roomData) return;

    setLoading(true, 'Cleaning blend…');

    const screen = document.getElementById('cleanup-screen');
    const text = document.getElementById('cleanup-text');

    screen.classList.remove('hidden');
    text.textContent = 'Deleting songs from cloud...';

    try {
      const room = State.roomData;
      const paths = [];

      [...(room.user_a_songs || []), ...(room.user_b_songs || [])].forEach(s => {
        if (s.storageKey) paths.push(s.storageKey);
      });

      if (paths.length) {
        await sb.storage.from(STORAGE_BUCKET).remove(paths);
      }

      text.textContent = 'Deleting chat and votes...';

      await sb.from('blend_messages').delete().eq('room_code', State.roomCode);
      await sb.from('blend_votes').delete().eq('room_code', State.roomCode);

      text.textContent = 'Deleting room...';

      await sb.from('rooms').delete().eq('code', State.roomCode);

      Player.stop();
      Chat.stop();
      Reactions.stop();

      if (State.channel) sb.removeChannel(State.channel);
      if (State.presenceChannel) sb.removeChannel(State.presenceChannel);
      if (State.syncChannel) sb.removeChannel(State.syncChannel);

      clearLastRoom();

      text.textContent = 'Done. Everything deleted.';
      setLoading(false);
      toast('Blend ended. Cloud cleaned.');

      setTimeout(() => location.href = location.pathname, 900);
    } catch (e) {
      console.error(e);
      setLoading(false);
      toast('Cleanup failed: ' + e.message);
    }
  },

  _checkReady() {
    const name = document.getElementById('name-input').value.trim();
    document.getElementById('btn-proceed').disabled = !(name && State.songs.length);
  }
};

function startFastSync() {
  if (State.syncChannel) sb.removeChannel(State.syncChannel);

  State.syncChannel = sb.channel(`fast-sync-${State.roomCode}`)
    .on('broadcast', { event: 'player' }, payload => {
      if (!Player.active) return;
      Player.syncState(payload.payload);
    })
    .subscribe();
}

const Chat = {
  channel: null,
  typingTimer: null,

  start(roomCode) {
    Chat.stop();
    Chat.load(roomCode);

    Chat.channel = sb.channel(`blend-chat-${roomCode}`)
      .on('broadcast', { event: 'chat' }, payload => {
        Chat.renderMessage(payload.payload);
      })
      .on('broadcast', { event: 'typing' }, payload => {
        if (payload.payload.user === State.userName) return;

        const el = document.getElementById('typing-status');
        el.textContent = `${payload.payload.user} is typing...`;

        clearTimeout(Chat.typingTimer);
        Chat.typingTimer = setTimeout(() => el.textContent = '', 1200);
      })
      .subscribe();
  },

  stop() {
    if (Chat.channel) {
      sb.removeChannel(Chat.channel);
      Chat.channel = null;
    }
  },

  async load(roomCode) {
    const { data } = await sb.from('blend_messages')
      .select('*')
      .eq('room_code', roomCode)
      .order('created_at', { ascending: true });

    document.getElementById('chat-messages').innerHTML = '';
    (data || []).forEach(Chat.renderMessage);
  },

  async send() {
    const input = document.getElementById('chat-input');
    const msg = input.value.trim();
    if (!msg) return;

    input.value = '';

    const message = {
      room_code: State.roomCode,
      user_name: State.userName,
      message: msg,
      created_at: new Date().toISOString()
    };

    Chat.renderMessage(message);

    if (Chat.channel) {
      Chat.channel.send({ type: 'broadcast', event: 'chat', payload: message });
    }

    await sb.from('blend_messages').insert(message);
  },

  typing() {
    if (!Chat.channel) return;

    Chat.channel.send({
      type: 'broadcast',
      event: 'typing',
      payload: { user: State.userName }
    });
  },

  renderMessage(m) {
    const box = document.getElementById('chat-messages');
    const div = document.createElement('div');
    div.innerHTML = `<b>${esc(m.user_name)}:</b> ${esc(m.message)}`;
    box.appendChild(div);
    box.scrollTop = box.scrollHeight;
  }
};

const Reactions = {
  channel: null,

  start(roomCode) {
    Reactions.stop();

    Reactions.channel = sb.channel(`reactions-${roomCode}`)
      .on('broadcast', { event: 'reaction' }, payload => {
        Reactions.show(payload.payload.emoji, payload.payload.user);
      })
      .subscribe();
  },

  stop() {
    if (Reactions.channel) {
      sb.removeChannel(Reactions.channel);
      Reactions.channel = null;
    }
  },

  send(emoji) {
    Reactions.show(emoji, State.userName);

    if (Reactions.channel) {
      Reactions.channel.send({
        type: 'broadcast',
        event: 'reaction',
        payload: { emoji, user: State.userName }
      });
    }
  },

  show(emoji, user) {
    const box = document.getElementById('reaction-float');
    const div = document.createElement('div');
    div.textContent = `${emoji} ${user}`;
    div.className = 'floating-reaction';
    box.appendChild(div);

    setTimeout(() => div.remove(), 1800);
  }
};

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

    QueueBuilder.mode = room.queue_mode || 'balanced';
    Player.queue = QueueBuilder.build(room);

    if (!Player.queue.length) {
      toast('No songs found');
      return;
    }

    document.getElementById('player-you-name').textContent =
      mySlot === 'A' ? room.user_a_name : room.user_b_name;

    document.getElementById('player-friend-name').textContent =
      mySlot === 'A' ? room.user_b_name : room.user_a_name;

    showScreen('screen-player');

    startFastSync();
    Chat.start(State.roomCode);
    Reactions.start(State.roomCode);

    Player.updateModeUI();
    Player._setupAudioEvents();
    Player._loadTrack(0);
    Player._play();

    clearInterval(Player.syncTimer);
    Player.syncTimer = setInterval(() => {
      if (Player.active && Player.isPlaying) Player._broadcastState('sync');
    }, 1200);

    setActivity(`${State.userName} started listening`);
  },

  stop() {
    Player.active = false;
    Player.audio.pause();
    Player.audio.src = '';
    Player.isPlaying = false;
    clearInterval(Player.syncTimer);
  },

  updateModeUI() {
    document.getElementById('queue-mode-btn').textContent =
      QueueBuilder.mode === 'smart' ? 'Smart Queue' : 'Balanced Queue';

    document.getElementById('stats-mode').textContent =
      QueueBuilder.mode === 'smart' ? 'Smart' : 'Balanced';
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

    document.getElementById('owner-tag').textContent = isYou ? 'You' : track.owner;

    document.getElementById('progress-fill').style.width = '0%';
    document.getElementById('time-current').textContent = '0:00';
    document.getElementById('time-total').textContent = fmtTime(track.duration || 0);

    document.getElementById('stats-total').textContent = Player.queue.length;
    document.getElementById('stats-current').textContent = Player.idx + 1;

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
    Player.audio.play().catch(() => toast('Tap play to start audio'));
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
      setActivity(`${State.userName} paused song`);
    } else {
      Player._play();
      Player._broadcastState('play');
      setActivity(`${State.userName} resumed song`);
    }
  },

  next() {
    Player._loadTrack(Player.idx + 1);
    if (Player.isPlaying) Player._play();
    Player._broadcastState('next');
    setActivity(`${State.userName} skipped song`);
  },

  prev() {
    Player._loadTrack(Player.idx - 1);
    if (Player.isPlaying) Player._play();
    Player._broadcastState('prev');
    setActivity(`${State.userName} went previous`);
  },

  async toggleQueueMode() {
    QueueBuilder.mode = QueueBuilder.mode === 'balanced' ? 'smart' : 'balanced';

    await sb.from('rooms').update({ queue_mode: QueueBuilder.mode }).eq('code', State.roomCode);

    Player.queue = QueueBuilder.build(State.roomData);
    Player._loadTrack(0);
    Player.updateModeUI();
    Player._broadcastState('queue');

    setActivity(`${State.userName} changed queue to ${QueueBuilder.mode}`);
  },

  async voteSkip() {
    await sb.from('blend_votes').insert({
      room_code: State.roomCode,
      track_idx: Player.idx,
      user_id: State.userId,
      vote_type: 'skip'
    });

    const { data } = await sb.from('blend_votes')
      .select('*')
      .eq('room_code', State.roomCode)
      .eq('track_idx', Player.idx)
      .eq('vote_type', 'skip');

    const unique = new Set((data || []).map(v => v.user_id));

    if (unique.size >= 2) {
      await sb.from('blend_votes').delete().eq('room_code', State.roomCode);
      Player.next();
      setActivity('Both voted skip');
    } else {
      toast('Skip vote added');
      setActivity(`${State.userName} voted skip`);
    }
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
          <div class="queue-song">${esc(t.name)}</div>
          <div class="queue-owner">${isYou ? 'You' : esc(t.owner)}</div>
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
      updatedAt: Date.now()
    };

    if (State.syncChannel) {
      State.syncChannel.send({
        type: 'broadcast',
        event: 'player',
        payload: state
      });
    }

    await sb.from('rooms').update({ playback_state: state }).eq('code', State.roomCode);
  },

  syncState(ps) {
    if (!ps || ps.updatedBy === State.userId) return;

    Player.ignoreSync = true;

    if (typeof ps.idx === 'number' && ps.idx !== Player.idx) {
      Player._loadTrack(ps.idx);
    }

    if (Math.abs((Player.audio.currentTime || 0) - (ps.time || 0)) > 0.8) {
      try { Player.audio.currentTime = ps.time || 0; } catch {}
    }

    if (ps.playing && !Player.isPlaying) {
      Player._play();
      toast(`${ps.byName} resumed song`);
    }

    if (!ps.playing && Player.isPlaying) {
      Player._pause();
      toast(`${ps.byName} paused song`);
    }

    setTimeout(() => Player.ignoreSync = false, 250);
  }
};

document.getElementById('name-input').addEventListener('input', App._checkReady);

document.getElementById('join-code-input').addEventListener('input', e => {
  e.target.value = e.target.value.replace(/\D/g, '').slice(0, 6);
});

document.getElementById('join-code-input').addEventListener('keydown', e => {
  if (e.key === 'Enter') App.showJoin();
});

document.getElementById('song-file').addEventListener('change', e => {
  Array.from(e.target.files).forEach(file => {
    const url = URL.createObjectURL(file);
    const audio = new Audio();
    audio.src = url;

    audio.addEventListener('loadedmetadata', () => {
      State.songs.push({
        name: stripExt(file.name),
        duration: audio.duration,
        file,
        localUrl: url
      });

      renderSongList();
      estimateStorage();
      App._checkReady();
    });

    audio.addEventListener('error', () => {
      State.songs.push({
        name: stripExt(file.name),
        duration: 0,
        file,
        localUrl: url
      });

      renderSongList();
      estimateStorage();
      App._checkReady();
    });
  });

  e.target.value = '';
});

function renderSongList() {
  document.getElementById('song-list').innerHTML = State.songs.map((s, i) => `
    <div class="song-item">
      <div class="song-thumb">♪</div>
      <div class="song-info">
        <div class="song-name">${esc(s.name)}</div>
        <div class="song-dur">${s.duration ? fmtTime(s.duration) : '—'}</div>
      </div>
      <button class="song-remove" onclick="removeSong(${i})">×</button>
    </div>
  `).join('');
}

function removeSong(i) {
  State.songs.splice(i, 1);
  renderSongList();
  estimateStorage();
  App._checkReady();
}

window.addEventListener('beforeunload', () => {
  if (State.presenceChannel) State.presenceChannel.untrack();
});

App.init();
