'use strict';

// ============================================
// BLEND APP.JS PART 1
// Setup + Share Links + Uploads + Room Create
// ============================================

// ---------- SUPABASE ----------

const sb = supabase.createClient(
SUPABASE_URL,
SUPABASE_ANON
);

// ---------- GLOBAL STATE ----------

const State = {
roomId: null,
roomData: null,

userRole: null, // creator / friend
userName: null,

songs: [],

realtimeChannel: null,
presenceChannel: null,

createdAt: Date.now()
};

// ---------- DOM ----------

const HomeScreen =
document.getElementById('screen-home');

const SetupScreen =
document.getElementById('screen-setup');

const ShareScreen =
document.getElementById('screen-share');

const PlayerScreen =
document.getElementById('screen-player');

const SongInput =
document.getElementById('songInput');

const NameInput =
document.getElementById('nameInput');

const SongList =
document.getElementById('songList');

const StorageInfo =
document.getElementById('storageInfo');

const ContinueBtn =
document.getElementById('continueBtn');

const ShareLinkBox =
document.getElementById('shareLinkBox');

// ---------- HELPERS ----------

function showScreen(id) {

document
.querySelectorAll('.screen')
.forEach(el => el.classList.remove('active'));

document
.getElementById(id)
.classList.add('active');
}

function toast(message) {

const el =
document.getElementById('toast');

el.textContent = message;

el.classList.add('show');

clearTimeout(el._timer);

el._timer =
setTimeout(() => {
el.classList.remove('show');
}, 2500);
}

function uuid() {

return crypto.randomUUID();
}

function bytesToMB(bytes) {

return (
bytes /
1024 /
1024
).toFixed(2);
}

function escapeHTML(text) {

return String(text)
.replace(/&/g, '&')
.replace(/</g, '<')
.replace(/>/g, '>');
}

// ---------- ROUTING ----------

function checkInviteLink() {

const params =
new URLSearchParams(location.search);

const roomId =
params.get('room');

if (!roomId) return;

State.roomId = roomId;
State.userRole = 'friend';

showScreen('screen-setup');

document.querySelector(
'.screen-title'
)?.remove();
}

// ---------- CREATE BUTTON ----------

document
.getElementById('createBlendBtn')
.addEventListener('click', () => {

State.userRole = 'creator';

showScreen('screen-setup');
});

// ---------- SONG INPUT ----------

SongInput.addEventListener(
'change',
handleSongSelection
);

async function handleSongSelection(e) {

const files =
[...e.target.files];

for (const file of files) {

```
const localUrl =
URL.createObjectURL(file);

const audio =
new Audio(localUrl);

const duration =
await new Promise(resolve => {

  audio.addEventListener(
  'loadedmetadata',
  () => resolve(audio.duration)
  );

  audio.addEventListener(
  'error',
  () => resolve(0)
  );
});

State.songs.push({

  id: uuid(),

  file,

  name:
  file.name.replace(
  /\.[^.]+$/,
  ''
  ),

  duration,

  size:
  file.size,

  localUrl
});
```

}

renderSongs();
}

// ---------- SONG LIST ----------

function renderSongs() {

SongList.innerHTML = '';

let totalBytes = 0;

State.songs.forEach(song => {

```
totalBytes += song.size;

const row =
document.createElement('div');

row.className =
'song-row';

row.innerHTML = `

  <div class="song-left">

    <i class="fa-solid fa-music"></i>

    <div>

      <strong>
      ${escapeHTML(song.name)}
      </strong>

      <small>
      ${Math.floor(song.duration)}s
      </small>

    </div>

  </div>

  <button
  class="remove-song"
  data-id="${song.id}">

  <i class="fa-solid fa-xmark"></i>

  </button>

`;

SongList.appendChild(row);
```

});

StorageInfo.textContent =
`${State.songs.length} songs • ${bytesToMB(totalBytes)} MB`;

document
.querySelectorAll('.remove-song')
.forEach(btn => {

```
btn.onclick = () => {

  State.songs =
  State.songs.filter(
  s => s.id !== btn.dataset.id
  );

  renderSongs();
};
```

});

ContinueBtn.disabled =
!(
NameInput.value.trim()
&&
State.songs.length
);
}

// ---------- NAME INPUT ----------

NameInput.addEventListener(
'input',
() => {

ContinueBtn.disabled =
!(
NameInput.value.trim()
&&
State.songs.length
);
});

// ---------- CONTINUE ----------

ContinueBtn.addEventListener(
'click',
startBlendSetup
);

async function startBlendSetup() {

const name =
NameInput.value.trim();

if (!name) {
toast('Enter your name');
return;
}

if (!State.songs.length) {
toast('Add songs first');
return;
}

State.userName = name;

localStorage.setItem(
'blend_name',
name
);

try {

```
if (
  State.userRole ===
  'creator'
) {

  await createRoom();
}

else {

  await joinRoom();
}
```

}

catch(err) {

```
console.error(err);

toast(
  err.message ||
  'Something went wrong'
);
```

}
}

// ---------- CREATE ROOM ----------

async function createRoom() {

const roomId =
uuid();

State.roomId =
roomId;

const uploadedSongs =
await uploadSongs(
roomId,
'creator'
);

const roomData = {

```
id: roomId,

creator_name:
State.userName,

creator_songs:
uploadedSongs,

friend_name: null,
friend_songs: [],

status:
'waiting',

playback: {},

created_at:
new Date()
.toISOString()
```

};

const { error } =
await sb
.from('rooms')
.insert(roomData);

if (error) throw error;

const link =

location.origin +
location.pathname +
'?room=' +
roomId;

ShareLinkBox.textContent =
link;

document
.getElementById(
'copyLinkBtn'
)
.onclick = () => {

```
navigator.clipboard
.writeText(link);

toast(
  'Link copied'
);
```

};

showScreen(
'screen-share'
);
}

// ---------- JOIN ROOM ----------

async function joinRoom() {

const { data, error } =
await sb
.from('rooms')
.select('*')
.eq(
'id',
State.roomId
)
.single();

if (
error ||
!data
) {

```
throw new Error(
  'Room not found'
);
```

}

const uploadedSongs =
await uploadSongs(
State.roomId,
'friend'
);

const update =
await sb
.from('rooms')
.update({

```
friend_name:
State.userName,

friend_songs:
uploadedSongs,

status:
'active'
```

})
.eq(
'id',
State.roomId
);

if (
update.error
) {

```
throw update.error;
```

}

location.reload();
}

// ---------- SONG UPLOAD ----------

async function uploadSongs(
roomId,
folder
) {

const uploaded = [];

for (
const song
of State.songs
) {

```
const path =

  roomId +
  '/' +
  folder +
  '/' +
  Date.now() +
  '_' +
  song.file.name;

const upload =
await sb.storage
  .from(
  STORAGE_BUCKET
  )
  .upload(
  path,
  song.file
  );

if (
  upload.error
) {

  throw upload.error;
}

const url =
sb.storage
  .from(
  STORAGE_BUCKET
  )
  .getPublicUrl(
  path
  );

uploaded.push({

  name:
  song.name,

  duration:
  song.duration,

  size:
  song.size,

  path,

  url:
  url.data
  .publicUrl
});
```

}

return uploaded;
}

// ---------- APP START ----------

window.addEventListener(
'load',
() => {

checkInviteLink();

const savedName =
localStorage.getItem(
'blend_name'
);

if (
savedName
) {

```
NameInput.value =
savedName;
```

}

setTimeout(() => {

```
document
.getElementById(
'loading-screen'
)
?.remove();
```

}, 800);
});
// ============================================
// BLEND APP.JS PART 2
// Realtime + Player + Pause/Resume Sync
// ============================================

// ---------- PLAYER STATE ----------

const Player = {

audio: new Audio(),

queue: [],

currentIndex: 0,

playing: false,

roomData: null,

syncLock: false,

initialized: false
};

// ---------- LOAD ROOM ----------

async function loadRoomData() {

const { data, error } =
await sb
.from('rooms')
.select('*')
.eq(
'id',
State.roomId
)
.single();

if (
error ||
!data
) {

```
toast(
  'Room unavailable'
);

return;
```

}

Player.roomData = data;

buildSmartQueue();

setupRealtime();

setupPlayer();

showScreen(
'screen-player'
);
}

// ---------- SMART QUEUE ----------

function buildSmartQueue() {

const room =
Player.roomData;

const creatorSongs =
room.creator_songs || [];

const friendSongs =
room.friend_songs || [];

const queue = [];

const max =
Math.max(
creatorSongs.length,
friendSongs.length
);

for (
let i = 0;
i < max;
i++
) {

```
if (
  creatorSongs[i]
) {

  queue.push({

    owner:
    room.creator_name,

    ...creatorSongs[i]
  });
}

if (
  friendSongs[i]
) {

  queue.push({

    owner:
    room.friend_name,

    ...friendSongs[i]
  });
}
```

}

Player.queue = queue;

renderUpNext();
}

// ---------- UP NEXT ----------

function renderUpNext() {

const list =
document.getElementById(
'upNextList'
);

list.innerHTML = '';

const items =
Player.queue.slice(
Player.currentIndex + 1,
Player.currentIndex + 6
);

items.forEach(song => {

```
const row =
document.createElement(
  'div'
);

row.className =
'up-next-row';

row.innerHTML = `

  <i class="fa-solid fa-music"></i>

  <div>

    <strong>
    ${song.name}
    </strong>

    <small>
    ${song.owner}
    </small>

  </div>

`;

list.appendChild(
  row
);
```

});
}

// ---------- PLAYER UI ----------

function setupPlayer() {

if (
Player.initialized
) return;

Player.initialized =
true;

const pauseBtn =
document.getElementById(
'pauseBtn'
);

pauseBtn.addEventListener(
'click',
togglePause
);

Player.audio.addEventListener(
'timeupdate',
updateProgress
);

Player.audio.addEventListener(
'ended',
playNextTrack
);
}

// ---------- START PLAYBACK ----------

function startBlendPlayback() {

if (
!Player.queue.length
) {

```
toast(
  'No songs found'
);

return;
```

}

loadTrack(
Player.currentIndex
);

playCurrentTrack();
}

// ---------- LOAD TRACK ----------

function loadTrack(index) {

const song =
Player.queue[index];

if (!song) return;

Player.audio.src =
song.url;

document.getElementById(
'trackTitle'
).textContent =
song.name;

document.getElementById(
'totalTime'
).textContent =
formatTime(
song.duration
);

renderUpNext();
}

// ---------- PLAY ----------

async function playCurrentTrack() {

try {

```
await Player.audio.play();

Player.playing =
true;

updatePauseButton();

syncPlayback(
  'play'
);
```

}

catch {

```
toast(
  'Tap play'
);
```

}
}

// ---------- PAUSE ----------

function pauseCurrentTrack() {

Player.audio.pause();

Player.playing =
false;

updatePauseButton();

syncPlayback(
'pause'
);
}

// ---------- TOGGLE ----------

function togglePause() {

if (
Player.playing
) {

```
pauseCurrentTrack();
```

}

else {

```
playCurrentTrack();
```

}
}

// ---------- BUTTON ----------

function updatePauseButton() {

const btn =
document.getElementById(
'pauseBtn'
);

btn.innerHTML =

```
Player.playing

?

`
<i class="fa-solid fa-circle-pause"></i>
Pause Blend
`

:

`
<i class="fa-solid fa-circle-play"></i>
Resume Blend
`;
```

}

// ---------- PROGRESS ----------

function updateProgress() {

const fill =
document.getElementById(
'progressFill'
);

const current =
Player.audio.currentTime;

const duration =
Player.audio.duration;

if (
!duration
) return;

const percent =

```
(
  current /
  duration
) * 100;
```

fill.style.width =
percent + '%';

document.getElementById(
'currentTime'
).textContent =
formatTime(
current
);
}

// ---------- NEXT TRACK ----------

function playNextTrack() {

Player.currentIndex++;

if (
Player.currentIndex >=
Player.queue.length
) {

```
Player.currentIndex = 0;
```

}

loadTrack(
Player.currentIndex
);

playCurrentTrack();

syncPlayback(
'next'
);
}

// ---------- FORMAT TIME ----------

function formatTime(seconds) {

seconds =
Math.floor(
seconds || 0
);

const min =
Math.floor(
seconds / 60
);

const sec =
String(
seconds % 60
).padStart(
2,
'0'
);

return `${min}:${sec}`;
}

// ---------- REALTIME ----------

function setupRealtime() {

if (
State.realtimeChannel
) {

```
sb.removeChannel(
  State.realtimeChannel
);
```

}

State.realtimeChannel =

sb.channel(
'blend-room-' +
State.roomId
);

State.realtimeChannel

.on(
'broadcast',
{
event:
'playback'
},
payload => {

```
  handleRealtimePlayback(
    payload.payload
  );
}
```

)

.subscribe();
}

// ---------- BROADCAST ----------

function syncPlayback(action) {

if (
Player.syncLock
) return;

State.realtimeChannel.send({

```
type:
'broadcast',

event:
'playback',

payload: {

  action,

  index:
  Player.currentIndex,

  currentTime:
  Player.audio.currentTime,

  user:
  State.userName
}
```

});
}

// ---------- RECEIVE ----------

function handleRealtimePlayback(
data
) {

if (
data.user ===
State.userName
) return;

Player.syncLock =
true;

if (
data.index !==
Player.currentIndex
) {

```
Player.currentIndex =
data.index;

loadTrack(
  data.index
);
```

}

Player.audio.currentTime =
data.currentTime || 0;

if (
data.action ===
'pause'
) {

```
Player.audio.pause();

Player.playing =
false;

updatePauseButton();

toast(
  `${data.user} paused music`
);
```

}

if (
data.action ===
'play'
) {

```
Player.audio.play();

Player.playing =
true;

updatePauseButton();

toast(
  `${data.user} resumed music`
);
```

}

if (
data.action ===
'next'
) {

```
toast(
  'Now playing next song'
);
```

}

setTimeout(() => {

```
Player.syncLock =
false;
```

}, 500);
}

// ---------- PLAYER ENTRY ----------

async function enterPlayer() {

await loadRoomData();

startBlendPlayback();

document.getElementById(
'blendNames'
).textContent =

```
(
  Player.roomData
  .creator_name
  || 'Creator'
)

+

' × '

+

(
  Player.roomData
  .friend_name
  || 'Friend'
);
```

}
// ============================================
// BLEND APP.JS PART 3
// Chat Modal + Reactions + Presence
// ============================================

// ---------- CHAT ----------

const Chat = {

initialized: false,

channel: null
};

// ---------- CHAT START ----------

function startChat() {

if (
Chat.initialized
) return;

Chat.initialized = true;

Chat.channel =

sb.channel(
'chat-' +
State.roomId
);

Chat.channel

.on(
'broadcast',
{
event: 'message'
},
payload => {

```
  renderChatMessage(
    payload.payload,
    false
  );
}
```

)

.on(
'broadcast',
{
event: 'typing'
},
payload => {

```
  showTyping(
    payload.payload.user
  );
}
```

)

.subscribe();

setupChatUI();
}

// ---------- CHAT UI ----------

function setupChatUI() {

const fab =
document.getElementById(
'chatFab'
);

const modal =
document.getElementById(
'chatModal'
);

const close =
document.getElementById(
'closeChat'
);

const send =
document.getElementById(
'sendChatBtn'
);

const input =
document.getElementById(
'chatInput'
);

fab.onclick = () => {

```
modal.classList.add(
  'open'
);
```

};

close.onclick = () => {

```
modal.classList.remove(
  'open'
);
```

};

send.onclick =
sendChatMessage;

input.addEventListener(
'keydown',
e => {

```
  if (
    e.key === 'Enter'
  ) {

    sendChatMessage();
  }

  sendTyping();
}
```

);
}

// ---------- SEND MESSAGE ----------

function sendChatMessage() {

const input =
document.getElementById(
'chatInput'
);

const text =
input.value.trim();

if (!text) return;

const message = {

```
user:
State.userName,

text,

time:
Date.now()
```

};

renderChatMessage(
message,
true
);

Chat.channel.send({

```
type:
'broadcast',

event:
'message',

payload:
message
```

});

input.value = '';
}

// ---------- MESSAGE UI ----------

function renderChatMessage(
msg,
mine
) {

const box =
document.getElementById(
'chatMessages'
);

const bubble =
document.createElement(
'div'
);

bubble.className =

```
mine
?

'chat-bubble mine'

:

'chat-bubble';
```

bubble.innerHTML = `

```
<strong>
  ${msg.user}
</strong>

<p>
  ${msg.text}
</p>
```

`;

box.appendChild(
bubble
);

box.scrollTop =
box.scrollHeight;
}

// ---------- TYPING ----------

let typingTimeout;

function sendTyping() {

clearTimeout(
typingTimeout
);

Chat.channel.send({

```
type:
'broadcast',

event:
'typing',

payload: {

  user:
  State.userName
}
```

});

typingTimeout =
setTimeout(() => {

}, 500);
}

function showTyping(user) {

if (
user ===
State.userName
) return;

const el =
document.getElementById(
'typingIndicator'
);

el.textContent =
`${user} is typing...`;

clearTimeout(
showTyping.timer
);

showTyping.timer =
setTimeout(() => {

```
el.textContent =
'';
```

}, 1200);
}

// ============================================
// REACTIONS
// ============================================

const Reactions = {

channel: null
};

// ---------- START ----------

function startReactions() {

Reactions.channel =

sb.channel(
'reactions-' +
State.roomId
);

Reactions.channel

.on(
'broadcast',
{
event:
'reaction'
},
payload => {

```
  spawnReaction(
    payload.payload.icon
  );
}
```

)

.subscribe();

setupReactionUI();
}

// ---------- UI ----------

function setupReactionUI() {

const fab =
document.getElementById(
'reactionFab'
);

const panel =
document.getElementById(
'reactionPanel'
);

fab.onclick = () => {

```
panel.classList.toggle(
  'open'
);
```

};

panel
.querySelectorAll(
'button'
)
.forEach(btn => {

```
btn.onclick = () => {

  const icon =
  btn.dataset.reaction;

  sendReaction(
    icon
  );

  panel.classList.remove(
    'open'
  );
};
```

});
}

// ---------- SEND ----------

function sendReaction(icon) {

spawnReaction(
icon
);

Reactions.channel.send({

```
type:
'broadcast',

event:
'reaction',

payload: {

  icon
}
```

});
}

// ---------- SPAWN ----------

function spawnReaction(
icon
) {

const container =
document.getElementById(
'reactionContainer'
);

const div =
document.createElement(
'div'
);

div.className =
'floating-reaction';

div.innerHTML =

```
`<i class="fa-solid fa-${icon}"></i>`;
```

container.appendChild(
div
);

setTimeout(() => {

```
div.remove();
```

}, 2500);
}

// ============================================
// PRESENCE
// ============================================

function startPresence() {

if (
State.presenceChannel
) {

```
sb.removeChannel(
  State.presenceChannel
);
```

}

State.presenceChannel =

sb.channel(
'presence-' +
State.roomId,
{
config: {

```
    presence: {

      key:
      State.userName
    }
  }
}
```

);

State.presenceChannel

.on(
'presence',
{
event:
'sync'
},
updatePresence
)

.subscribe(
async status => {

```
  if (
    status ===
    'SUBSCRIBED'
  ) {

    await State
    .presenceChannel
    .track({

      user:
      State.userName,

      online:
      true,

      joined:
      Date.now()
    });
  }
}
```

);
}

// ---------- UPDATE ----------

function updatePresence() {

const state =

State
.presenceChannel
.presenceState();

const count =

Object.keys(
state
).length;

const text =
document.getElementById(
'onlineText'
);

if (
count <= 1
) {

```
text.textContent =
'Waiting...';
```

}

else {

```
text.textContent =
`${count} online`;
```

}
}

// ============================================
// START ALL REALTIME
// ============================================

function startRealtimeSystems() {

startChat();

startReactions();

startPresence();
}

// ============================================
// AUTO START
// ============================================

document.addEventListener(
'DOMContentLoaded',
() => {

if (
State.roomId
) {

```
startRealtimeSystems();
```

}
});
// ============================================
// BLEND APP.JS PART 4
// Cleanup + End Blend + Helpers
// ============================================

// ---------- END BLEND ----------

async function endBlend() {

try {

```
if (
  State.userRole !==
  'creator'
) {

  toast(
    'Only creator can end blend'
  );

  return;
}

const screen =
document.getElementById(
  'cleanupScreen'
);

const text =
document.getElementById(
  'cleanupText'
);

screen.classList.add(
  'active'
);

// ------------------------
// GET ROOM
// ------------------------

const { data } =
await sb
  .from('rooms')
  .select('*')
  .eq(
    'id',
    State.roomId
  )
  .single();

if (!data) {

  throw new Error(
    'Room missing'
  );
}

// ------------------------
// DELETE SONGS
// ------------------------

text.textContent =
'Deleting uploaded songs...';

const files = [];

(
  data.creator_songs || []
)
.forEach(song => {

  if (
    song.path
  ) {

    files.push(
      song.path
    );
  }
});

(
  data.friend_songs || []
)
.forEach(song => {

  if (
    song.path
  ) {

    files.push(
      song.path
    );
  }
});

if (
  files.length
) {

  await sb
    .storage
    .from(
      STORAGE_BUCKET
    )
    .remove(
      files
    );
}

// ------------------------
// DELETE ROOM
// ------------------------

text.textContent =
'Deleting room...';

await sb
  .from('rooms')
  .delete()
  .eq(
    'id',
    State.roomId
  );

// ------------------------
// CLEAN CHANNELS
// ------------------------

text.textContent =
'Disconnecting...';

cleanupRealtime();

// ------------------------
// CLEAR CACHE
// ------------------------

localStorage.removeItem(
  'blend_room'
);

localStorage.removeItem(
  'blend_queue'
);

// ------------------------
// FINISH
// ------------------------

text.textContent =
'Blend ended successfully';

setTimeout(() => {

  location.href =
  location.pathname;

}, 1800);
```

}

catch(err) {

```
console.error(err);

toast(
  err.message
);
```

}
}

// ---------- BUTTON ----------

const endBtn =
document.getElementById(
'endBlendBtn'
);

if (endBtn) {

endBtn.onclick =
endBlend;
}

// ============================================
// CLEANUP CHANNELS
// ============================================

function cleanupRealtime() {

try {

```
if (
  State.realtimeChannel
) {

  sb.removeChannel(
    State.realtimeChannel
  );
}

if (
  State.presenceChannel
) {

  sb.removeChannel(
    State.presenceChannel
  );
}

if (
  Chat.channel
) {

  sb.removeChannel(
    Chat.channel
  );
}

if (
  Reactions.channel
) {

  sb.removeChannel(
    Reactions.channel
  );
}
```

}

catch(e) {

```
console.log(e);
```

}
}

// ============================================
// LOCAL STORAGE
// ============================================

function saveRoomCache() {

localStorage.setItem(

```
'blend_room',

JSON.stringify({

  roomId:
  State.roomId,

  role:
  State.userRole,

  name:
  State.userName
})
```

);
}

function loadRoomCache() {

try {

```
const cache =

JSON.parse(

  localStorage.getItem(
    'blend_room'
  )
);

if (!cache)
return;

State.roomId =
cache.roomId;

State.userRole =
cache.role;

State.userName =
cache.name;
```

}

catch {}
}

// ============================================
// PAGE LEAVE
// ============================================

window.addEventListener(
'beforeunload',
() => {

cleanupRealtime();
});

// ============================================
// VINYL ANIMATION
// ============================================

function startVinyl() {

const vinyl =
document.querySelector(
'.vinyl'
);

if (!vinyl)
return;

vinyl.classList.add(
'spin'
);
}

function stopVinyl() {

const vinyl =
document.querySelector(
'.vinyl'
);

if (!vinyl)
return;

vinyl.classList.remove(
'spin'
);
}

// ============================================
// PLAY STATE UI
// ============================================

function updatePlayerState() {

if (
Player.playing
) {

```
startVinyl();
```

}

else {

```
stopVinyl();
```

}
}

// ============================================
// RANDOM TOASTS
// ============================================

const BlendTexts = [

'Sharing music together 🎵',

'Your tastes are blending',

'Listening in real time',

'Connected through music',

'Creating a shared vibe'
];

function randomBlendText() {

const text =

BlendTexts[
Math.floor(
Math.random() *
BlendTexts.length
)
];

toast(text);
}

// ============================================
// AUTO STATUS
// ============================================

setInterval(() => {

if (
document.hidden
) return;

if (
Player.playing
) {

```
randomBlendText();
```

}

}, 120000);

// ============================================
// CREATOR ONLY BUTTON
// ============================================

function updateCreatorControls() {

const btn =
document.getElementById(
'endBlendBtn'
);

if (!btn)
return;

if (
State.userRole !==
'creator'
) {

```
btn.style.display =
'none';
```

}
}

// ============================================
// PLAYER BOOT
// ============================================

async function bootPlayer() {

loadRoomCache();

updateCreatorControls();

await enterPlayer();

startRealtimeSystems();

updatePlayerState();
}

// ============================================
// AUTO START
// ============================================

window.addEventListener(
'load',
() => {

const params =
new URLSearchParams(
location.search
);

if (

```
params.get('room')

||

localStorage.getItem(
  'blend_room'
)
```

) {

```
setTimeout(() => {

  bootPlayer();

}, 300);
```

}
});
