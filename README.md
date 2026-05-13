# Supabase Kahoot Party

A lightweight Kahoot-inspired quiz app built with Supabase and Vite.

## Features

- Moderator login via a secret host code
- Party join code for players
- Questions loaded from `public/questions.json`
- Optional question image support
- Real-time lobby, question flow, and score updates

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

## How it works

- The moderator enters the host code (`4321` by default).
- The moderator creates a party and shares the join code.
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
