# 🎵 Blend — Setup Guide
Complete this in ~10 minutes. Everything is free.

---

## STEP 1 — Supabase (database + file storage)

### 1a. Create project
1. Go to **https://supabase.com** → Sign up (free)
2. Click **New project** → give it any name like `blend`
3. Choose a region close to you (e.g. South Asia)
4. Wait ~1 minute for it to start

### 1b. Create the database table
1. In your Supabase project → click **SQL Editor** (left sidebar)
2. Paste this SQL and click **Run**:

```sql
create table rooms (
  id              uuid primary key default gen_random_uuid(),
  code            text unique not null,
  user_a_name     text,
  user_a_songs    jsonb default '[]',
  user_a_avatar   text,
  user_b_name     text,
  user_b_songs    jsonb default '[]',
  user_b_avatar   text,
  status          text default 'waiting',
  playback_state  jsonb,
  created_at      timestamptz default now()
);

-- Allow anyone to read/write (open for the app, no login needed)
alter table rooms enable row level security;
create policy "public access" on rooms for all using (true) with check (true);

-- Auto-delete rooms older than 24 hours (keeps storage clean)
create or replace function delete_old_rooms() returns void as $$
  delete from rooms where created_at < now() - interval '24 hours';
$$ language sql;
```

### 1c. Create storage bucket
1. Left sidebar → **Storage** → **New bucket**
2. Name: `blend-songs`
3. Toggle **Public bucket** ON
4. Click **Save**
5. Click the bucket → **Policies** → **New policy** → **For full customization**
6. Policy name: `public` | Allowed operation: ALL | Target roles: leave blank → **Review** → **Save**

### 1d. Enable Realtime
1. Left sidebar → **Database** → **Replication**
2. Find the `rooms` table → toggle **Realtime** ON

### 1e. Get your API keys
1. Left sidebar → **Settings** → **API**
2. Copy:
   - **Project URL** (looks like `https://abcxyz.supabase.co`)
   - **anon public** key (long string starting with `eyJ...`)

### 1f. Put keys in the app
Open `config.js` and replace the placeholders:

```js
const SUPABASE_URL  = 'https://YOUR-PROJECT.supabase.co';
const SUPABASE_ANON = 'eyJ...your-anon-key...';
const STORAGE_BUCKET = 'blend-songs';
```

---

## STEP 2 — Netlify (free hosting)

1. Go to **https://netlify.com** → Sign up (free)
2. On the dashboard click **Add new site** → **Deploy manually**
3. Drag and drop the entire `musicblend` folder onto the page
4. Wait 10 seconds → Netlify gives you a URL like `https://amazing-blend-123.netlify.app`
5. That's your live app! Share the URL with friends.

**Optional:** Click **Site settings** → **Change site name** to get a cleaner URL.

---

## How it works

| Person | What they do |
|--------|-------------|
| User A | Opens the URL → Create room → Uploads their songs → Gets a 5-letter code |
| User B | Opens the URL → Enters the code → Uploads their songs → Both start playing |

Songs alternate: one from A, one from B, one from A… both users hear the same queue in sync.

---

## Troubleshooting

| Problem | Fix |
|---------|-----|
| "Room not found" | Make sure User B types the code exactly (case doesn't matter) |
| Songs don't play | Check storage bucket is public + policies allow SELECT |
| Real-time not working | Check Replication is ON for `rooms` table |
| Upload fails | Check storage policy allows INSERT |

---

## Upgrade ideas (all free tier friendly)
- Add a "shuffle blend" button
- Show waveform visualizer using Web Audio API
- Let users react with emojis in real time via Supabase Realtime broadcast
- Add a chat alongside the player
