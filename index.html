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
  return (n || '?')
    .split(' ')
    .map(w => w[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);
}

function toast(msg, duration = 2500) {
  const el = document.getElementById('toast');
  if (!el) return;

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
  const txt = document.getElementById('loading-text');

  if (txt) txt.textContent = text;
  if (el) el.classList.toggle('hidden', !show);
}

function saveProfile() {
  localStorage.setItem('blend_profile', JSON.stringify({
    name: State.userName,
  }));
}

function loadProfile() {
  try {
    const saved = JSON.parse(localStorage.getItem('blend_profile') || '{}');
    if (saved.name) {
      document.getElementById('name-input').value = saved.name;
    }
  } catch {}
}

function saveLastRoom() {
  localStorage.setItem('last_blend_room', JSON.stringify({
    code: State.roomCode,
    userId: State.userId,
    userName: State.userName,
    time: Date.now(),
  }));
}

function clearLastRoom() {
  localStorage.removeItem('last_blend_room');
}

function estimateStorage() {
  const total = State.songs.reduce((sum, s) => sum + (s.file?.size || 0), 0);
  const mb = total / 1024 / 1024;

  const el = document.getElementById('storage-warning');
  if (el) {
    el.textContent = `Cloud use: ${mb.toFixed(1)} MB. Files delete after blend ends.`;
  }

  return mb;
}

async function setActivity(text) {
  const el = document.getElementById('live-activity');
  if (el) el.textContent = text;

  if (!State.roomCode) return;

  await sb.from('rooms').update({
    activity: {
      text,
      by: State.userName,
      at: Date.now(),
    },
  }).eq('code', State.roomCode);
}

const QueueBuilder = {
  mode: 'balanced',

  build(room) {
    const aS = (room.user_a_songs || []).map(s => ({
      ...s,
      owner: room.user_a_name,
      slot: 'A',
    }));

    const bS = (room.user_b_songs || []).map(s => ({
      ...s,
      owner: room.user_b_name,
      slot: 'B',
    }));

    if (QueueBuilder.mode === 'smart') {
      return QueueBuilder.smart(aS, bS);
    }

    return QueueBuilder.balanced(aS, bS);
  },

  balanced(aS, bS) {
    const queue = [];
    const max = Math.max(aS.length, bS.length);

    for (let i = 0; i < max; i++) {
      if (aS[i]) queue.push(aS[i]);
      if (bS[i]) queue.push(bS[i]);
    }

    return queue;
  },

  smart(aS, bS) {
    const queue = [];

    const shortA = [...aS].sort((a, b) => (a.duration || 0) - (b.duration || 0));
    const shortB = [...bS].sort((a, b) => (a.duration || 0) - (b.duration || 0));

    const max = Math.max(shortA.length, shortB.length);

    for (let i = 0; i < max; i++) {
      if (i % 2 === 0) {
        if (shortA[i]) queue.push(shortA[i]);
        if (shortB[i]) queue.push(shortB[i]);
      } else {
        if (shortB[i]) queue.push(shortB[i]);
        if (shortA[i]) queue.push(shortA[i]);
      }
    }

    return queue;
  },
};

const App = {
  init() {
    loadProfile();

    const params = new URLSearchParams(location.search);
    const room = params.get('room');

    if (room && /^\d{6}$/.test(room)) {
      document.getElementById('join-code-input').value = room;
      toast('Room code loaded from link');
    }

    try {
      const last = JSON.parse(localStorage.getItem('last_blend_room') || '{}');

      if (!room && last.code && Date.now() - last.time < 1000 * 60 * 60 * 24) {
        const ok = confirm(`Rejoin last blend room ${last.code}?`);

        if (ok) {
          document.getElementById('join-code-input').value = last.code;
          toast('Last room loaded');
        }
      }
    } catch {}

    App._checkReady();
    estimateStorage();
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
      if (State.userId === 'A') {
        await App._createRoom(name);
      } else {
        await App._joinRoom(name);
      }
    } catch (e) {
      console.error(e);
      setLoading(false);
      toast('Error: ' + e.message);
    }
  },

  async _createRoom(name) {
    const code = genCode();
    State.roomCode = code;

    const songMeta = await App._uploadSongs('A');

    const { error } = await sb.from('rooms').insert({
      code,
      user_a_name: name,
      user_a_songs: songMeta,
      user_a_avatar: null,
      status: 'waiting',
      playback_state: null,
      queue_mode: 'balanced',
      activity: {
        text: `${name} created the blend`,
        by: name,
        at: Date.now(),
      },
      created_at: new Date().toISOString(),
    });

    if (error) throw error;

    State.shareLink = `${location.origin}${location.pathname}?room=${code}`;

    setLoading(false);

    App._showWaiting(code, name);
    App._subscribeRoom(code);
    App._setupPresence(code);
    saveLastRoom();
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
      user_b_avatar: null,
      status: 'playing',
      activity: {
        text: `${name} joined the blend`,
        by: name,
        at: Date.now(),
      },
    }).eq('code', code);

    if (err2) throw err2;

    setLoading(false);

    State.roomData = {
      ...data,
      user_b_name: name,
      user_b_songs: songMeta,
      status: 'playing',
    };

    QueueBuilder.mode = data.queue_mode || 'balanced';

    App._subscribeRoom(code);
    App._setupPresence(code);
    saveLastRoom();

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
        size: song.file.size || 0,
      });
    }

    return meta;
  },

  _showWaiting(code, name) {
    document.getElementById('room-code-display').textContent = code;
    document.getElementById('you-name-label').textContent = name;

    const avEl = document.getElementById('you-av-small');
    if (avEl) avEl.textContent = initials(name);

    showScreen('screen-waiting');
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

        if (room.activity?.text) {
          const el = document.getElementById('live-activity');
          if (el) el.textContent = room.activity.text;
        }

        if (room.queue_mode) {
          QueueBuilder.mode = room.queue_mode;
          Player.updateModeUI();
        }

        if (room.status === 'playing' && State.userId === 'A' && !Player.active) {
          const chip = document.getElementById('friend-chip');

          if (chip) {
            chip.classList.remove('faded');
            chip.classList.add('arrived');
            chip.querySelector('.member-avatar').textContent = initials(room.user_b_name);
            chip.querySelector('span:last-child').textContent = room.user_b_name;
          }

          setTimeout(() => Player.start(room, 'A'), 700);
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
      config: {
        presence: {
          key: `${State.userId}-${Date.now()}`,
        },
      },
    });

    State.presenceChannel
      .on('presence', { event: 'sync' }, () => {
        const state = State.presenceChannel.presenceState();
        const count = Object.keys(state).length;
        const sync = document.getElementById('sync-status');

        if (sync) sync.textContent = `${count} device${count === 1 ? '' : 's'} online`;
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
    navigator.clipboard?.writeText(State.roomCode);
    toast(`Code ${State.roomCode} copied`);
  },

  copyShareLink() {
    const link = `${location.origin}${location.pathname}?room=${State.roomCode}`;
    navigator.clipboard?.writeText(link);
    toast('Share link copied');
  },

  downloadSummary() {
    const room = State.roomData;
    if (!room) return;

    const totalSongs = Player.queue.length;
    const played = Math.min(Player.idx + 1, totalSongs);

    const summary = `
BLEND SUMMARY

Room Code: ${State.roomCode}

Users:
${room.user_a_name || 'User A'}
${room.user_b_name || 'User B'}

Total Songs: ${totalSongs}
Played Till: ${played}

Queue Mode: ${QueueBuilder.mode}

Ended By: ${State.userName || 'Not ended yet'}
Time: ${new Date().toLocaleString()}

NOTE:
Cloud songs, chats, votes, and room data are deleted after ending blend.
`;

    const blob = new Blob([summary], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);

    const a = document.createElement('a');
    a.href = url;
    a.download = `blend-summary-${State.roomCode}.txt`;
    a.click();

    URL.revokeObjectURL(url);
  },

  async endBlend() {
    if (!State.roomData) return;

    const cleanup = document.getElementById('cleanup-screen');
    const text = document.getElementById('cleanup-text');

    if (cleanup) cleanup.classList.remove('hidden');
    if (text) text.textContent = 'Deleting songs from cloud...';

    setLoading(true, 'Ending blend...');

    try {
      const room = State.roomData;

      App.downloadSummary();

      const paths = [];

      [...(room.user_a_songs || []), ...(room.user_b_songs || [])].forEach(song => {
        if (song.storageKey) paths.push(song.storageKey);
      });

      if (paths.length) {
        const { error: removeError } = await sb.storage.from(STORAGE_BUCKET).remove(paths);
        if (removeError) console.warn(removeError.message);
      }

      if (text) text.textContent = 'Deleting chats and votes...';

      await sb.from('blend_messages').delete().eq('room_code', State.roomCode);
      await sb.from('blend_votes').delete().eq('room_code', State.roomCode);

      if (text) text.textContent = 'Deleting room data...';

      await sb.from('rooms').delete().eq('code', State.roomCode);

      clearLastRoom();

      Player.stop();
      Chat.stop();

      if (State.channel) sb.removeChannel(State.channel);
      if (State.presenceChannel) sb.removeChannel(State.presenceChannel);

      if (text) text.textContent = 'Done. Everything deleted from Supabase.';

      setLoading(false);
      toast('Blend ended. Cloud cleaned.');

      setTimeout(() => {
        showScreen('screen-onboard');
      }, 1000);

    } catch (e) {
      console.error(e);
      setLoading(false);
      toast('Cleanup error: ' + e.message);
    }
  },

  _checkReady() {
    const name = (document.getElementById('name-input')?.value || '').trim();
    const btn = document.getElementById('btn-proceed');

    if (btn) btn.disabled = !(name && State.songs.length > 0);
  },
};

const Chat = {
  channel: null,
  typingTimer: null,

  start(roomCode) {
    Chat.stop();
    Chat.load(roomCode);

    Chat.channel = sb.channel(`chat-${roomCode}`)
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'blend_messages',
        filter: `room_code=eq.${roomCode}`,
      }, payload => {
        Chat.renderMessage(payload.new);
      })
      .on('broadcast', { event: 'typing' }, payload => {
        if (payload.payload.user !== State.userName) {
          const el = document.getElementById('typing-status');
          if (el) el.textContent = `${payload.payload.user} is typing...`;

          clearTimeout(Chat.typingTimer);
          Chat.typingTimer = setTimeout(() => {
            if (el) el.textContent = '';
          }, 1200);
        }
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
    const { data } = await sb
      .from('blend_messages')
      .select('*')
      .eq('room_code', roomCode)
      .order('created_at', { ascending: true });

    const box = document.getElementById('chat-messages');
    if (box) box.innerHTML = '';

    (data || []).forEach(Chat.renderMessage);
  },

  async send() {
    const input = document.getElementById('chat-input');
    if (!input) return;

    const msg = input.value.trim();
    if (!msg) return;

    input.value = '';

    await sb.from('blend_messages').insert({
      room_code: State.roomCode,
      user_name: State.userName,
      message: msg,
    });

    setActivity(`${State.userName} sent a message`);
  },

  typing() {
    if (!Chat.channel) return;

    Chat.channel.send({
      type: 'broadcast',
      event: 'typing',
      payload: {
        user: State.userName,
      },
    });
  },

  renderMessage(m) {
    const box = document.getElementById('chat-messages');
    if (!box) return;

    const div = document.createElement('div');
    div.innerHTML = `<b>${m.user_name}:</b> ${m.message}`;
    box.appendChild(div);
    box.scrollTop = box.scrollHeight;
  },
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

    QueueBuilder.mode = room.queue_mode || QueueBuilder.mode || 'balanced';
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

    Player.updateModeUI();
    Player._setupAudioEvents();
    Player._loadTrack(0);
    Player._play();

    Chat.start(State.roomCode);
    estimateStorage();
    saveLastRoom();

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
    const btn = document.getElementById('queue-mode-btn');
    const stats = document.getElementById('stats-mode');

    if (btn) btn.textContent = QueueBuilder.mode === 'smart' ? 'Smart Queue' : 'Balanced Queue';
    if (stats) stats.textContent = QueueBuilder.mode === 'smart' ? 'Smart' : 'Balanced';
  },

  _loadTrack(i) {
    if (!Player.queue.length) return;

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

    if (art) art.className = 'art-inner spinning ' + (isYou ? 'you-art' : 'friend-art');
    if (tag) {
      tag.className = 'owner-tag ' + (isYou ? 'you-tag' : 'friend-tag');
      tag.textContent = isYou ? 'You' : track.owner;
    }

    document.getElementById('progress-fill').style.width = '0%';
    document.getElementById('time-current').textContent = '0:00';
    document.getElementById('time-total').textContent = fmtTime(track.duration || 0);

    const total = document.getElementById('stats-total');
    const current = document.getElementById('stats-current');

    if (total) total.textContent = Player.queue.length;
    if (current) current.textContent = Player.idx + 1;

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

    const art = document.getElementById('art-inner');
    if (art) art.classList.add('spinning');
  },

  _pause() {
    Player.audio.pause();
    Player.isPlaying = false;

    document.getElementById('icon-play').classList.remove('hidden');
    document.getElementById('icon-pause').classList.add('hidden');

    const art = document.getElementById('art-inner');
    if (art) art.classList.remove('spinning');
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
    setActivity(`${State.userName} skipped to next song`);
  },

  prev() {
    if (Player.audio.currentTime > 3) {
      Player.audio.currentTime = 0;
      Player._broadcastState('seek');
      setActivity(`${State.userName} restarted the song`);
      return;
    }

    Player._loadTrack(Player.idx - 1);

    if (Player.isPlaying) Player._play();

    Player._broadcastState('prev');
    setActivity(`${State.userName} went to previous song`);
  },

  async toggleQueueMode() {
    QueueBuilder.mode = QueueBuilder.mode === 'balanced' ? 'smart' : 'balanced';

    await sb.from('rooms').update({
      queue_mode: QueueBuilder.mode,
    }).eq('code', State.roomCode);

    Player.queue = QueueBuilder.build(State.roomData);
    Player._loadTrack(0);
    Player.updateModeUI();

    setActivity(`${State.userName} changed queue to ${QueueBuilder.mode}`);
    toast(`${QueueBuilder.mode} queue enabled`);
  },

  async voteSkip() {
    await sb.from('blend_votes').insert({
      room_code: State.roomCode,
      track_idx: Player.idx,
      user_id: State.userId,
      vote_type: 'skip',
    });

    const { data } = await sb
      .from('blend_votes')
      .select('*')
      .eq('room_code', State.roomCode)
      .eq('track_idx', Player.idx)
      .eq('vote_type', 'skip');

    const unique = new Set((data || []).map(v => v.user_id));

    if (unique.size >= 2) {
      await sb.from('blend_votes').delete().eq('room_code', State.roomCode);

      Player.next();
      setActivity('Both voted skip. Next song started.');
    } else {
      setActivity(`${State.userName} voted to skip`);
      toast('Skip vote added');
    }
  },

  _renderQueue() {
    const list = document.getElementById('queue-list');
    if (!list) return;

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

document.getElementById('name-input').addEventListener('input', App._checkReady);

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
      estimateStorage();
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
      estimateStorage();
      App._checkReady();
    });
  });

  e.target.value = '';
});

document.getElementById('join-code-input').addEventListener('input', e => {
  e.target.value = e.target.value.replace(/\D/g, '').slice(0, 6);
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
  estimateStorage();
  App._checkReady();
}

window.addEventListener('beforeunload', () => {
  if (State.presenceChannel) {
    State.presenceChannel.untrack();
  }
});

App.init();
