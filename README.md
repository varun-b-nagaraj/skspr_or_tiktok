# skspr or tiktok

A lightweight Kahoot-inspired quiz app built with Supabase and Vite.

## Features

- Party join code for players
- Questions loaded from `public/questions.json`
- Optional question image support
- Polling-based lobby, question flow, and score updates
- Supabase REST calls routed through the Vercel proxy at `/api/supabase`

## Setup

1. Create a Supabase project.
2. Create the database schema by running `sql/init_supabase.sql` in Supabase SQL editor.
3. Create a `.env` file in the project root based on `.env.example`.
4. Install dependencies:

```bash
npm install
```

5. Start the app:

```bash
npm run dev
```

6. Open the app in the browser.

## Vercel proxy

Set these environment variables in Vercel:

```bash
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-supabase-anon-key
VITE_SUPABASE_PROXY_URL=/api/supabase
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_ANON_KEY=your-supabase-anon-key
```

The browser sends Supabase REST requests to `/api/supabase/rest/v1/...`; the Vercel serverless function forwards them to Supabase. Supabase realtime websockets are not used.

For local development, `npm run dev` talks directly to Supabase by default. To test the proxy locally, set `VITE_SUPABASE_PROXY_URL=/api/supabase` and run the app with `vercel dev`.

## How it works

- The host creates a party and shares the join code.
- Players join with the party code and a display name.
- The moderator starts the game and advances through questions.
- Players answer questions and scores are updated live.

## Custom questions

Edit `public/questions.json` to change the quiz questions or add images.

## Supabase tables

- `parties`
- `players`
- `answers`

Use `sql/init_supabase.sql` to create the required tables.
