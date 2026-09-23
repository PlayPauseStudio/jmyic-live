# Judge Me If You Can (JMYIC)

A live, in-person comedy game show application built with Next.js.

**Hosting:** Railway (static export, no backend server).
**Data & auth:** Firebase — Realtime Database for game state, Firestore for the question pool
and play-along records, and Firebase Auth (Google) for player sign-in.

> There is no game server yet. Every client talks to Firebase directly via the client SDK,
> exactly as it did on Firebase Hosting. Railway only serves the built static files.

## Roles & URLs

| Role | Path | Device |
|------|------|--------|
| Home / Role Selector | `/` | Any |
| Operator Panel | `/operator` | Tablet (backstage) |
| Audience Display | `/audience` | Large screen / TV |
| Play Along | `/play` | Audience members' phones |
| Leaderboard | `/leaderboard` | Host / brand segment screen |

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
turns green on a win and red on a loss, and the header shows a player counter
instead of lives.

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

## Local Development

```bash
# Install dependencies
npm install

# Run dev server (with Turbopack)
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

For staging environment:
```bash
npm run dev:staging
```

---

## Deploying to Railway

Railway builds from this repo and serves the static export with [`serve`](https://www.npmjs.com/package/serve).
There is no backend process — `npm start` is just a static file server bound to Railway's `$PORT`.

### One-time setup

1. **Create the service.** Railway dashboard → *New Project* → *Deploy from GitHub repo* →
   pick `PlayPauseStudio/jmyic-live`.
2. **Confirm the commands.** `railway.json` already pins them, so Railway should show:
   - Build: `npm run build`
   - Start: `npm start`
3. **Generate a domain.** Service → *Settings* → *Networking* → *Generate Domain*.
4. **Authorize that domain in Firebase** (required, or Google sign-in will fail — see below).

After that, every push to `main` redeploys automatically.

### Authorizing the Railway domain in Firebase

Google sign-in is rejected from any origin Firebase does not know about. This step is
mandatory for `/play` to work, and it is easy to forget when the domain changes.

1. [Firebase Console](https://console.firebase.google.com) → project `jmyic-live`
2. **Authentication → Settings → Authorized domains → Add domain**
3. Add the Railway domain (e.g. `jmyic-live-production.up.railway.app`), and any custom
   domain you later attach to the service.

`NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN` is `jmyic-live.firebaseapp.com` — the sign-in popup is
served by Firebase, so it does not change when hosting moves.

### Environment variables on Railway

`.env.production` is committed, so a default build already has the correct Firebase config
baked in and **Railway needs no variables set to work**.

`NEXT_PUBLIC_*` values are inlined at *build* time, not read at runtime. To override any of
them, set the variable in Railway → *Variables*; real environment variables take precedence
over the committed `.env` files. Changing one requires a rebuild, not just a restart.

One worth setting explicitly, because `.env.local` is committed and would otherwise win:

```
NEXT_PUBLIC_ENVIRONMENT=production
```

### Running the production build locally

```bash
npm run preview          # builds, then serves out/ on http://localhost:3000
PORT=4000 npm start      # serve an existing build on another port
```

---

## Firebase Hosting (legacy / fallback)

Hosting has moved to Railway, but the Firebase config is still present so you can fall back
to it, and so you can push database rules.

```bash
npm run deploy:firebase          # build + deploy hosting to jmyic-live
firebase deploy --only database,firestore  # push database.rules.json + firestore.rules
```

> **Important:** Do NOT run plain `firebase deploy` — it will try to deploy Cloud Functions and
> fail because `functions/lib/index.js` hasn't been compiled. Use `--only`.

The `functions/` directory is unused by the app (health check + a stub). Deploy it with
`npm run deploy:functions` only if you actually change it.

---

## Environment Files

| File | Used by |
|------|---------|
| `.env.local` | `npm run dev` |
| `.env.staging` | `npm run build:staging` — same project as prod, see note in the file |
| `.env.production` | `npm run build:production`, and `npm run build` on Railway |

Required variables (all `NEXT_PUBLIC_`):
```
NEXT_PUBLIC_FIREBASE_API_KEY
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN
NEXT_PUBLIC_FIREBASE_PROJECT_ID
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID
NEXT_PUBLIC_FIREBASE_APP_ID
NEXT_PUBLIC_ENVIRONMENT    # "local" | "staging" | "production"
```

---

## Editing Questions

Two places, same editor:

- **Game Controls → Current Question** has an ✏️ Edit button for the question
  currently on screen — the quickest fix mid-show.
- **Question Pool** (**Contestants** in One Shot) has an ✏️ Edit button on every
  row, including rows already played, so a typo can still be corrected
  afterwards.

Both mount the same `QuestionEditor`, so they cannot drift apart. Saving always
writes the stored pool; if the row being edited is the one currently on the
audience screen, the live game state is updated too and the display changes
immediately.

---

## Operator Panel Password Setup (one-time)

The operator panel is protected by a SHA-256 hashed password. The password itself is never stored anywhere — only its hash is embedded in the build.

### Step 1: Generate the hash

Replace `YOUR_PASSWORD_HERE` with the password you want operators to use:

```bash
node -e "const c=require('crypto'); console.log(c.createHash('sha256').update('YOUR_PASSWORD_HERE').digest('hex'));"
```

### Step 2: Add the hash to every env file

Paste the output into `.env.local`, `.env.staging`, and `.env.production`:

```
NEXT_PUBLIC_OPERATOR_PASSWORD_HASH=<hash from step 1>
```

### How it works

- The hash is bundled into the static JS (since it's `NEXT_PUBLIC_`) but SHA-256 is one-way — an attacker cannot reverse it to get the password.
- Correct password → session stored in `sessionStorage` (tab-scoped, clears when tab closes).
- 5 wrong attempts → 30-second lockout.

---

## Firebase Console Setup (one-time)

For the **Play Along** feature to work, enable authentication providers in the Firebase Console:

1. Go to [Firebase Console](https://console.firebase.google.com) → project `jmyic-live`
2. Authentication → Sign-in method
3. Enable **Google** and **Email/Password**
4. Authentication → Settings → **Authorized domains** → add the Railway domain
   (see [Deploying to Railway](#authorizing-the-railway-domain-in-firebase)). Without this,
   the Google sign-in popup closes with an `auth/unauthorized-domain` error.

---

## Project Structure

```
jmyic-live/
├── railway.json              # Railway build + start commands
├── serve.json                # Static server config (cache headers)
├── src/app/
│   ├── page.tsx              # Home — role selector
│   ├── operator/page.tsx     # Operator control panel
│   ├── audience/page.tsx     # Large-screen audience display
│   ├── play/page.tsx         # Play Along (audience phones)
│   └── leaderboard/page.tsx  # Leaderboard (brand segments)
├── src/components/
│   ├── operator/             # Operator UI components
│   ├── audience/             # Audience display components
│   └── playAlong/            # Play Along auth + answer UI
├── src/lib/
│   ├── firebase.ts           # Firestore init, defaults, prize tiers
│   ├── firebaseAuth.ts       # Firebase Auth (client-only, lazy-init)
│   ├── gameState.ts          # GameStateManager — Realtime Database sync
│   ├── types.ts              # TypeScript interfaces
│   └── sounds.ts             # SoundPlayer
├── src/utils/
│   └── gameLogic.ts          # All game logic (static methods)
├── functions/                # Unused by the app — legacy Cloud Functions
│   └── src/index.ts          # health check + stub
└── public/sounds/            # Audio assets
```

---

## Quick Reference

| Task | Command |
|------|---------|
| Start dev server | `npm run dev` |
| Build for production | `npm run build` |
| **Preview the Railway build locally** | `npm run preview` |
| **Deploy to Railway** | `git push origin main` (auto-deploys) |
| Deploy to Firebase Hosting (fallback) | `npm run deploy:firebase` |
| Push security rules | `firebase deploy --only database,firestore` |
| Deploy functions (rare) | `npm run deploy:functions` |
| View Firebase logs | `npm run logs:functions` |

---

## Deployment Files

| File | Purpose |
|------|---------|
| `railway.json` | Pins Railway's build and start commands |
| `serve.json` | Static server config — cache headers for assets vs. HTML |
| `.nvmrc` | Node version for the Railway build (22) |
| `next.config.ts` | `output: 'export'` — builds to `out/` |
