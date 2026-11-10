# Judge Me If You Can (JMYIC) — live (server-backed) edition

A live, in-person comedy game show app. A Node server owns the game; the web
app only sends intent ("check the panel's guess") and renders what comes back.
Same architecture as `bachelor-gameshow-live`.

```
jmyic-live/
  server/   Express + Socket.IO — the authority for game state
  web/      Next.js static export on Firebase Hosting (jmyic-live.web.app) — /operator, /audience, /play
```

The game rules are the same ones the app always had. They moved from the
browser (`web/src/utils/gameLogic.ts`) to the server (`server/src/game/logic.ts`)
unchanged; only who is allowed to run them changed.

## Roles & URLs

| Role | Path | Device | Connects as |
|------|------|--------|-------------|
| Home / Role Selector | `/` | Any | — |
| Operator Panel | `/operator` | Tablet (backstage) | operator (password → server-issued token) |
| Audience Display | `/audience` | Large screen / TV | display (open, or `?key=` if `DISPLAY_KEY` is set) |
| Play Along | `/play` | Audience members' phones | audience (Firebase sign-in, verified by the server) |

The leaderboard is a full-screen view on `/audience`, switched on from the
operator panel's Play Along section.

---

## Why the server

The previous version had no backend: every screen read and wrote Firebase
directly, and the database rules were open (`read, write: true`).

| | before | now |
|---|---|---|
| Operator password | SHA-256 hash shipped in the page, compared in the browser | sent to the server, bcrypt-checked, exchanged for a 12h token; login attempts rate-limited |
| Who can change the game | anyone with the Firebase project id | only a socket that presented a valid operator token |
| Guest's answer | readable by every screen (and anyone) the moment a question was picked; the `/api/questions` file in the build even shipped the whole pool | stays on the server until it is revealed; display and phones get it blanked, unrevealed options too |
| Play-along phone numbers | world-readable in Firestore / RTDB | never leave the server except in the operator's Excel export |
| Play-along answers | phone wrote its own answer and timestamp | phone sends A/B/C/D; the server checks the answer window and option, and stamps the time itself (no faking "fastest finger") |
| One phone number per player | checked in the phone's browser | checked on the server |
| A phone acting as another player | possible (client chose the uid) | impossible — uid comes from the verified Firebase token |

Firebase is now used **only** for `/play` sign-in (Google / email). The app
no longer reads or writes Firestore or the Realtime Database.

---

## Show Formats

The operator picks a format once per show, top-left of the control panel.

### Classic

One guest, up to 7 questions, climbing the prize ladder. Lives, lock,
All or Nothing, hide-option and the 75:25 banner all apply. Unchanged.

### One Shot

Many contestants, **one question each**, sudden death:

- Judge guesses **right** → that contestant loses, round over immediately
- Judge guesses **wrong** → operator reveals, contestant **wins their prize**
- Every contestant plays for their own prize, so any number of them can win

No ladder, lives, lock, All or Nothing, hide-option or 75:25 — those controls
are hidden. Option reveals, the buzzer and play-along all still work.

The audience display swaps the prize ladder for a contestant/prize banner that
turns green on a win and red on a loss, and the show title reads
**Judge The Deal If You Can**. The banner carries the player number on its left
edge; the header's lives slot is empty in this format.

```
 10.                 Arjun playing for iPhone 16
```

**CSV template** — one row per contestant (download it from the operator panel):

```
contestant_name,prize,question,option_a,option_b,option_c,option_d,contestant_answer
"Shreya","iPhone 16","What is your favorite color?","Red","Blue","Green","Yellow","A"
```

The number of contestants is simply however many rows you upload. `guest_answer`
is still accepted in place of `contestant_answer`, and contestant/prize are
editable like any other question field.

Results are recorded per contestant and land in the Excel export on a
**Contestants** sheet, with a won/lost tally in the summary.

---

## Revealing Options

Options are revealed one at a time in any order, and each revealed option gets an
**↩ Hide** button to put it back — for undoing a single misclick without losing
the reveal order of the others. Re-revealing appends it at the end. Works in both
formats, and during All or Nothing.

---

## Reset Question

The orange **Reset Question (Back to Step 1)** button in Game Controls rewinds the
round on screen: revealed options, the panel guess, the check and the reveal all
go, *and* so does anything that round scored — a life spent, a ladder step taken,
or a One Shot contestant's win/lose result. Earlier questions are untouched.

It works by the server snapshotting the game state when a question is selected and
restoring it. The snapshot is server-only and never sent to any screen.

The question stays marked used, so it doesn't jump back into the available pool.
It asks for confirmation only once the round has actually scored something —
clearing a few revealed options isn't worth a dialog mid-show.

If no snapshot exists (e.g. the server restarted without Redis), it falls
back to clearing everything visible. That fallback cannot restore a spent life,
because the earlier value isn't recoverable from current state.

---

## Editing Questions

Two places, same editor:

- **Game Controls → Current Question** has an ✏️ Edit button for the question
  currently on screen — the quickest fix mid-show.
- **Question Pool** (**Contestants** in One Shot) has an ✏️ Edit button on every
  row, including rows already played, so a typo can still be corrected
  afterwards.

Both mount the same `QuestionEditor`, so they cannot drift apart. Saving always
updates the pool on the server; if the row being edited is the one currently on
the audience screen, the live game state (and the Reset Question snapshot) is
updated too and the display changes immediately.

**Correcting the answer on a round that already played:**

- **One Shot** recomputes the result. Correcting the answer so the judge turns
  out to have been right flips "Ananya wins iPhone 16" to "Ananya played for
  iPhone 16" on the spot.
- **Classic** does *not* re-score silently — flipping the result there means
  taking back or re-awarding a life and a ladder step. The save goes through and
  you get a message telling you to use **Reset Question** and play the round
  again, so the life and prize level end up right.

---

## Running it locally

```bash
# 1. server
cd server
cp .env.example .env         # OPERATOR_PASSWORD=letmein by default
npm install
npm run dev                  # http://localhost:8080

# 2. web (separate terminal)
cd web
npm install
npm run dev                  # http://localhost:3000
```

Open `/operator` (password from `server/.env`), `/audience` and `/play`.

Locally, with `FIREBASE_PROJECT_ID` unset, the server accepts any phone token
as its uid, so you can test play-along without Firebase. `/play` itself still
signs in with the real `jmyic-live` Firebase project.

Verify the server on its own:

```bash
cd server && npm run smoke   # 100 checks: login, role guards, hidden answers, both formats, play-along, export, resets
```

It needs the server running in another terminal and **resets everything** on
it. It talks to `127.0.0.1:8080`; point it elsewhere with `SMOKE_URL`.

### How updates travel

Each screen gets one full state when it connects, then only the fields that
changed. Play-along answers don't broadcast one by one: the operator's
response table and the big-screen leaderboard refresh a few times a second.
See `server/src/socket/broadcast.ts` and `server/src/game/redact.ts`.

---

## Deploying

- **Server → Railway** (one service, `server/`)
- **Website → Firebase Hosting** at **https://jmyic-live.web.app** (`web/`)

The website is plain static files; Railway only runs the game server.

### 1. Server on Railway

Railway → *New* → *GitHub repo* → `PlayPauseStudio/jmyic-live`, then
*Settings*: **Root Directory `server`**. `server/railway.json` sets the build,
start and health check. Generate a domain, then set these variables:

| variable | value |
|---|---|
| `NODE_ENV` | `production` |
| `JWT_SECRET` | a long random string (32+ characters) |
| `OPERATOR_PASSWORD_HASH` | output of `npm run hash -- 'the password'` (leave `OPERATOR_PASSWORD` unset) |
| `REDIS_URL` | recommended; without it a server restart mid-show loses the game and play-along answers |
| `DISPLAY_KEY` | optional — then open the big screen as `/audience?key=…` |
| `ALLOWED_ORIGINS` | optional — defaults to `https://jmyic-live.web.app,https://jmyic-live.firebaseapp.com` in production |
| `FIREBASE_PROJECT_ID` | optional — defaults to `jmyic-live` in production |

The server refuses to start in production without a proper `JWT_SECRET` and
`OPERATOR_PASSWORD_HASH`.

If the old Railway service that served the website still exists, delete it:
the website no longer runs on Railway.

### 2. Website on Firebase Hosting

Put the server's Railway domain in `web/.env.production` (no trailing slash):

```
NEXT_PUBLIC_WS_URL=https://<the server's railway domain>
```

It is baked into the files at build time, so the build refuses to run without
it, and changing it means deploying the website again. Then:

```bash
cd web
npx firebase login          # once per machine
npm run deploy              # builds and uploads to https://jmyic-live.web.app
```

`jmyic-live.web.app` is already an authorized sign-in domain for the
`jmyic-live` project, so Google sign-in on `/play` works there with no extra
setup.

### 3. After the switch-over: close the Firebase databases

`web/database.rules.json` and `web/firestore.rules` now deny everything — the
old game state and play-along data (with phone numbers) are still sitting in
the `jmyic-live` Firebase project, readable by anyone. Once the server version
is live, push the rules:

```bash
cd web && npm run deploy:rules
```

**Not before**: a site still running the old build reads and writes those
databases directly and would stop working.

---

## Operator password

Set on the server only:

```bash
cd server && npm run hash -- 'the password'   # paste into OPERATOR_PASSWORD_HASH on Railway
```

The browser never sees the password or its hash. A correct password gets a
12-hour token, kept in `sessionStorage` (survives a refresh, cleared when the
tab closes). After 12 hours the panel asks for the password again.

---

## Firebase Console Setup (one-time)

For `/play` sign-in, project `jmyic-live`:

1. Authentication → Sign-in method → enable **Google** and **Email/Password**
2. Authentication → Settings → **Authorized domains** → `jmyic-live.web.app` is there by default; add any other domain the site is served from

---

## Project Structure

```
jmyic-live/
├── server/
│   ├── railway.json
│   ├── scripts/smoke.ts          # end-to-end test against a running server
│   └── src/
│       ├── game/logic.ts         # the game rules (moved from the browser, unchanged)
│       ├── game/reducers.ts      # operator + phone actions, with their preconditions
│       ├── game/redact.ts        # what each screen is allowed to see
│       ├── game/state.ts         # GameState, defaults, prize tiers
│       ├── socket/               # handshake auth, handlers, broadcaster
│       ├── auth/                 # operator JWT, Firebase token check
│       └── persistence/          # optional Redis snapshots
└── web/
    ├── firebase.json             # hosting for jmyic-live.web.app + deny-all rules
    └── src/
        ├── app/operator|audience|play/
        ├── components/           # operator / audience / playAlong UI
        ├── lib/realtime.ts       # socket client + event names (mirror the server's)
        ├── lib/gameState.ts      # connect, subscribe, send intents
        ├── lib/firebase*.ts      # sign-in only
        └── utils/gameLogic.ts    # read-only helpers for rendering
```

---

## Quick Reference

| Task | Command |
|------|---------|
| Start server | `cd server && npm run dev` |
| Start web | `cd web && npm run dev` |
| Server smoke test | `cd server && npm run smoke` |
| Hash the operator password | `cd server && npm run hash -- 'pw'` |
| Build web | `cd web && npm run build` |
| Close the Firebase databases | `cd web && npm run deploy:rules` |
| Deploy server | `git push origin main` (Railway redeploys; resets the game unless `REDIS_URL` is set) |
| Deploy website | `cd web && npm run deploy` (→ https://jmyic-live.web.app) |
