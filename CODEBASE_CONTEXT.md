# Judge Me If You Can — Codebase Context

> This file exists so any AI session (or human) can regain full project context without re-exploring the code. Keep it up to date when major features change.

---

## 1. App Overview

**Judge Me If You Can (JMYIC)** is a live, in-person comedy game show application. A celebrity **Guest** answers 7 trivia questions. A comedy **Panel** tries to guess what the guest answered. The **Operator** runs the game from a tablet backstage. The **Audience** watches a large broadcast screen. Mobile audience members can **Play Along** from their phones.

### Roles

| Role | URL | Purpose |
|------|-----|---------|
| Home | `/` | Role selector — links to Operator or Audience |
| Operator | `/operator` | Controls all game flow: questions, guesses, reveals, lifelines. Password-gated. |
| Audience | `/audience` | Large-screen broadcast display — all visual feedback lives here |
| Play Along | `/play` | Mobile audience participation — pick A/B/C/D each round |
| Leaderboard | `/leaderboard` | Live leaderboard showing play-along results per question |

---

## 2. Game Rules

### Core Loop (7 questions)
1. Operator selects a question from the pool.
2. Operator reveals options one-by-one (A/B/C/D) on the audience screen.
3. Panel discusses and the Operator submits their guess.
4. Operator checks the guess — compares panel guess to guest's pre-recorded answer.
5. Result determines advancement or life loss.
6. Repeat for all 7 questions.

### Lives
- Guest starts with **2 lives**.
- Panel correct → guest loses 1 life.
- Panel wrong → guest **advances** one prize level.
- 2 panel correct answers → **panel wins**, game ends.

### Prize Ladder (hard-coded in `src/lib/firebase.ts`)

| Level | Prize |
|-------|-------|
| 1 | ₹2,000 |
| 2 | ₹4,000 |
| 3 | ₹8,000 |
| 4 | ₹12,000 |
| 5 | ₹20,000 |
| 6 | ₹30,000 |
| 7 | ₹50,000 |

### Win / Loss Conditions

| Outcome | Trigger | Prize |
|---------|---------|-------|
| Guest Victory | Completes all 7 questions | Current prize (or locked amount) |
| Panel Victory | 2 correct panel answers | Guest eliminated |
| Guest Lost | Loses all lives, no lock placed | ₹0 |
| Lock Victory | Loses all lives, lock placed | Locked prize amount |
| All or Nothing Win | Panel fails both AoN attempts | ₹50,000 |
| All or Nothing Loss | Panel succeeds in AoN | ₹0 (lock forfeited) |

---

## 3. Lifelines & Special Mechanics

### Lock
- Operator places lock at any prize level (dropdown 1-7).
- If guest loses all lives WITH lock → wins locked amount (not ₹0).
- Lock is forfeited if panel wins All or Nothing.
- State: `lock: { placed: bool, level: number | null }`, `lockedMoney: number`

### All or Nothing (AoN)
- Triggered when guest hits 0 lives WITHOUT a lock.
- Guest gets **2 attempts** on a new question.
- Panel correct on either attempt → guest wins ₹0.
- Panel wrong on both attempts → guest wins ₹50,000.
- State: `allOrNothingActive`, `allOrNothingAttempt` (0|1|2), `allOrNothingWon`

### Hide Option (Lifeline)
- One-time use per game.
- Operator selects which option (A/B/C/D) to hide.
- Audience sees it vanish with a whoosh animation.
- State: `hiddenOption: 'A'|'B'|'C'|'D'|null`, `hideOptionUsed: boolean`

### Reveal Options (Progressive)
- Operator reveals options one at a time.
- Audience sees them appear left-to-right in reveal order.
- State: `revealedOptions: ('A'|'B'|'C'|'D')[]`
- Reset button hides all options again.

### 75:25 Banner
- Operator-controlled informational banner that slides up from the bottom of the audience screen.
- State: `show75_25Banner: boolean`

### Logo Toggle
- Operator can show/hide a full-screen show logo overlay on the audience display.
- State: `showLogo: boolean`

---

## 4. Play Along System

Audience members join from `/play` on their phone and answer each question live. Results appear on `/leaderboard`.

### User Flow
1. `/play` → Firebase Auth (anonymous or phone) sign-in via `AuthScreen`
2. First-time users fill in name + phone via `ProfileSetup` (saved to Firestore `playAlongUsers`)
3. Returning users' profiles are auto-loaded
4. `AnswerScreen` shows the current question with A/B/C/D buttons
5. After submitting, the selected option is locked (can't change)
6. When operator reveals the guest answer, the play-along screen shows green (correct) or red (wrong) feedback

### Answer Storage (RTDB)
Answers are written to Firebase Realtime Database — not Firestore — for instant sync:
```
playAlong/
  answers/
    {questionNumber}/
      {uid}/
        answer: "B"
        name: "Rajat Bhandari"
        phone: "+91..."
        timestamp: 1234567890
        questionId: "q_abc123"   ← prevents cross-contamination when same Q# reused
        questionNumber: 1
  questions/
    {questionNumber}/
      questionText: "..."
      correctAnswer: "A"         ← letter only (normalized via GameLogic.normalizeGuestAnswer)
      questionNumber: 1
```

`playAlong/questions/{num}` is written by `PlayAlongPanel` when the operator selects a question. It is used by the leaderboard to display question text and evaluate correct/incorrect answers.

### User Registrations (Firestore)
Firestore `playAlongUsers` collection stores name, phone, uid. This is NOT real-time; used only for the participant count on the leaderboard.

### Leaderboard (`/leaderboard`)
- Two persistent RTDB `onValue` subscriptions: `playAlong/answers` and `playAlong/questions`
- Also subscribes to game state for auto-focus
- **Tab behaviour:**
  - No tabs shown when no question is selected (shows "Waiting for the first question…")
  - Auto-focuses to the current question tab when operator picks one (`followingLive` mode)
  - "Live ●" pill toggles auto-follow; clicking any tab manually turns it off
- **Gating rules (important — audience can see this screen):**
  - "All Questions" tab: current live question's column is **hidden** until `currentQuestionAnswerRevealed = true`
  - Q1/Q2/… tab: shows only response count before reveal; full ranked table after reveal
  - Past questions always show the full table
- `visibleQuestions` derived value controls what's shown in "All Questions" table

### Answer Evaluation
`GameLogic.normalizeGuestAnswer(guest_answer, question)` in `src/utils/gameLogic.ts` converts full-text answers (e.g. "Bikinis and Beaches") to letters (A/B/C/D). Always use this when comparing or storing `correctAnswer` — never use raw `guest_answer` string directly.

### Reset Behaviour
- **"Reset Game Only"**: resets game state to default + clears entire RTDB `playAlong/` root (answers + question metadata). Firestore `playAlongUsers` (registrations) are preserved — players don't need to re-register.
- **"Reset Everything"**: resets game state + deletes all questions from Firestore + clears all play-along data including Firestore `playAlongUsers`.

### Operator Security
`/operator` is protected by a SHA-256 password gate (`PasswordGate.tsx`). The hash is stored in env vars as `NEXT_PUBLIC_OPERATOR_PASSWORD_HASH`. The plain text password is **never** stored in code or committed to version control. Session is stored in `sessionStorage` (clears when tab closes).

---

## 5. Directory Structure

```
JMYIC/
├── src/
│   ├── app/
│   │   ├── page.tsx                  # Home — role selector
│   │   ├── layout.tsx                # Root layout, fonts, metadata
│   │   ├── globals.css               # Global styles + CSS animations
│   │   ├── operator/page.tsx         # Operator panel — 3-column layout, password-gated
│   │   ├── audience/page.tsx         # Audience display page
│   │   ├── play/page.tsx             # Play Along — mobile audience participation
│   │   ├── leaderboard/page.tsx      # Play Along leaderboard — RTDB real-time
│   │   └── api/
│   │       ├── upload-csv/route.ts   # POST: parse + save CSV questions
│   │       └── questions/route.ts    # GET: fetch question pool
│   │
│   ├── components/
│   │   ├── operator/
│   │   │   ├── GameControls.tsx      # Main operator workflow hub
│   │   │   ├── PlayAlongPanel.tsx    # Live answer counts + participant count (operator left col)
│   │   │   ├── PasswordGate.tsx      # SHA-256 password gate for /operator
│   │   │   ├── QuestionPool.tsx      # Question selection UI
│   │   │   ├── CSVUpload.tsx         # Drag-drop CSV upload
│   │   │   └── GameStatus.tsx        # Game state info dashboard
│   │   ├── audience/
│   │   │   ├── QuestionDisplay.tsx   # Question + options with animations
│   │   │   ├── PrizeLadder.tsx       # Horizontal prize tier display
│   │   │   ├── LivesDisplay.tsx      # Heart icons for lives
│   │   │   ├── PlayAlongDisplay.tsx  # Play-along entries shown on audience screen
│   │   │   ├── AllOrNothingDisplay.tsx    # Full-screen AoN phase UI
│   │   │   ├── GuestVictoryDisplay.tsx    # Win modal with confetti
│   │   │   ├── GuestLostDisplay.tsx       # Elimination modal
│   │   │   ├── GameOverDisplay.tsx        # Final game-over screen
│   │   │   ├── SoftEliminationBanner.tsx  # Banner shown when guest is soft-eliminated
│   │   │   └── SeventyFiveTwentyFiveBanner.tsx  # Slide-up info banner
│   │   └── playAlong/
│   │       ├── AnswerScreen.tsx      # A/B/C/D buttons + post-reveal colour feedback
│   │       ├── AuthScreen.tsx        # Firebase Auth sign-in
│   │       ├── ProfileSetup.tsx      # Name + phone registration (saved to Firestore)
│   │       └── WaitingScreen.tsx     # Shown when game not started / between questions
│   │
│   ├── lib/
│   │   ├── firebase.ts               # Firebase init, RTDB refs, Firestore refs, defaultGameState, PRIZE_TIERS
│   │   ├── firebaseAuth.ts           # Firebase Auth singleton (lazy init, SSR-safe)
│   │   ├── gameState.ts              # GameStateManager class (RTDB sync)
│   │   ├── types.ts                  # TypeScript interfaces
│   │   └── sounds.ts                 # SoundPlayer class
│   │
│   └── utils/
│       ├── gameLogic.ts              # GameLogic static methods
│       └── dataExport.ts            # Gathers all data → single .xlsx backup (SheetJS)
│
├── functions/
│   └── src/index.ts                  # Firebase Cloud Functions (health + backup)
│
├── public/
│   └── sounds/                       # Audio assets
│       ├── Correct.mp3
│       ├── Wrong.mp3
│       ├── buzzer.wav
│       ├── lock.mp3
│       ├── question-selection.mp3
│       ├── team-answer-reveal.mp3
│       └── whoosh.mp3
│
├── database.rules.json               # RTDB security rules (games/ and playAlong/ both public r/w)
├── .env.local / .env.staging / .env.production
├── firebase.json                     # Hosting + database rules config
├── next.config.ts                    # Static export config
├── tailwind.config.js
└── tsconfig.json
```

---

## 6. Critical Files

| File | Purpose |
|------|---------|
| `src/utils/gameLogic.ts` | All game logic — state transitions, win/loss, lock, AoN, answer normalization |
| `src/utils/dataExport.ts` | Gathers all 5 data sources → single multi-tab `.xlsx` backup (manual + auto-on-reset) |
| `src/components/operator/GameControls.tsx` | Main operator UI and workflow |
| `src/lib/gameState.ts` | `GameStateManager` — RTDB sync, reset methods |
| `src/lib/firebase.ts` | Firebase init, RTDB refs, Firestore refs, `PRIZE_TIERS`, `defaultGameState` |
| `src/lib/types.ts` | All TypeScript interfaces |
| `src/app/leaderboard/page.tsx` | Leaderboard — RTDB subscriptions, gating, auto-focus logic |
| `src/app/play/page.tsx` | Play Along — Firebase Auth, RTDB answer writes |
| `src/components/operator/PlayAlongPanel.tsx` | Writes question metadata to RTDB; shows live response count |
| `src/components/playAlong/AnswerScreen.tsx` | Answer selection + post-reveal correct/wrong feedback |
| `src/components/audience/AllOrNothingDisplay.tsx` | Full AoN phase display |
| `src/components/audience/QuestionDisplay.tsx` | Question + options + animations |
| `src/app/operator/page.tsx` | Operator page — 3-column layout, password gate, subscriptions |

---

## 7. Architecture

### State Sync Model
- **Game state** lives in Firebase **Realtime Database** at `games/game1` (moved from Firestore — RTDB gives ~50-80ms sync vs Firestore's ~200-500ms).
- **Questions pool** lives in Firestore `questions/pool`.
- **Play-along answers + question metadata** live in RTDB under `playAlong/`.
- **User registrations** live in Firestore `playAlongUsers`.
- `GameStateManager` singleton (`src/lib/gameState.ts`) handles all RTDB reads/writes for game state.
- Both Operator and Audience subscribe via `subscribeToGameState()` (`onValue` on RTDB).
- Background writes (`updateGameStateBackground`) are fire-and-forget for rapid-fire UI actions (option reveals, banner toggle, buzzer). Critical writes (`updateGameState`) are `await`ed.

### Firebase Resources
| Resource | Type | Path / Collection | Contents |
|----------|------|-------------------|----------|
| Game state | RTDB | `games/game1` | Full `GameState` object |
| Play-along answers | RTDB | `playAlong/answers/{qNum}/{uid}` | Answer, name, phone, timestamp, questionId |
| Play-along question meta | RTDB | `playAlong/questions/{qNum}` | questionText, correctAnswer (letter), questionNumber |
| Questions pool | Firestore | `questions/pool` | Array of `Question` objects |
| User registrations | Firestore | `playAlongUsers/{uid}` | name, phone, uid, createdAt |

### RTDB Security Rules (`database.rules.json`)
```json
{
  "rules": {
    "games": { ".read": true, ".write": true },
    "playAlong": { ".read": true, ".write": true }
  }
}
```
Deploy with: `firebase deploy --only database`

### State Flow Diagram
```
[Operator selects question]
        ↓
[PlayAlongPanel writes question metadata to RTDB playAlong/questions/{num}]
[Audience sees question; operator reveals options A/B/C/D one-by-one]
[Mobile users answer on /play — writes to RTDB playAlong/answers/{num}/{uid}]
        ↓
[Panel guesses → Operator submits guess]
        ↓
[Operator checks guess]
    ├─ PANEL CORRECT
    │   └─ Guest loses 1 life
    │       ├─ Lives > 0 → continue
    │       │   └─ 2 correct panel answers → Panel Wins
    │       └─ Lives = 0 → softEliminated
    │           ├─ Lock placed → Guest wins locked amount
    │           ├─ Start AoN → 2 attempts on new question
    │           │   ├─ AoN panel wrong × 2 → Guest wins ₹50K
    │           │   └─ AoN panel correct → Guest wins ₹0
    │           └─ No lock, skip AoN → Guest Lost (₹0)
    │
    └─ PANEL WRONG
        └─ Guest advances one prize level
            ├─ Level < 7 → next question
            └─ Level 7 complete → Guest Victory (wins current prize)

[Operator clicks Reveal Guest Answer]
        ↓
[Leaderboard reveals Q column in "All Questions" tab + shows full table on Q tab]
[/play screen shows green/red feedback on each user's answer]
```

---

## 8. GameState Interface — All Fields

```typescript
// Question & round
currentQuestion: Question | null
currentQuestionNumber: number          // 1–7 (default: 1)
questionsAnswered: number

// Panel guessing
panelGuess: 'A'|'B'|'C'|'D'|''
panelGuessSubmitted: boolean
panelGuessChecked: boolean
panelCorrectAnswers: number            // 0–2; at 2 = panel wins

// Guest progression
lives: number                          // default 2
lifeUsed: boolean
prize: number                          // current prize amount
pendingAdvancement: boolean            // guest won round, waiting for next Q to advance
softEliminated: boolean                // lives = 0, awaiting AoN or lost decision

// Answer reveal
currentQuestionAnswerRevealed: boolean
needsManualReveal: boolean

// Game status
gameOver: boolean
pendingGameOver: boolean

// Lifelines
hiddenOption: 'A'|'B'|'C'|'D'|null
hideOptionUsed: boolean
revealedOptions: ('A'|'B'|'C'|'D')[]  // ordered; audience shows in this order
aonRevealedOptions: ('A'|'B'|'C'|'D')[]  // separate list for All or Nothing phase

// All or Nothing
allOrNothingActive: boolean
allOrNothingAttempt: 0|1|2
allOrNothingComplete: boolean
allOrNothingWon: boolean
allOrNothingPendingPanelWin: boolean
allOrNothingPendingGuestWin: boolean
allOrNothingModalVisible: boolean
allOrNothingLastGuess: string
allOrNothingLastGuessCorrect: boolean
allOrNothingAttempt1Guess: string
allOrNothingAttempt1Correct: boolean
allOrNothingAttempt2Guess: string
allOrNothingAttempt2Correct: boolean

// Victory / loss pending (operator triggers modal manually)
guestVictoryPending: boolean
guestLostPending: boolean
guestVictoryModalVisible: boolean
guestLostModalVisible: boolean

// Lock system
lock: { placed: boolean, level: number | null }
lockedMoney: number

// Operator display controls
show75_25Banner: boolean
showLogo: boolean                      // full-screen logo overlay on audience screen
buzzerTrigger: number                  // timestamp; audience detects change to play buzzer

// Play Along
currentQuestionStartTime: number | null
playAlongAnswerWindowOpen: boolean
playAlongDisplayMode: 'none'|'quickest'|'slowest'|'correct'|'incorrect'
playAlongDisplayEntries: PlayAlongDisplayEntry[]

// Data management
usedQuestions: Record<string, boolean>
lastActivity: string                   // ISO timestamp
documentVersion: string                // '3.0'
```

---

## 9. Game Logic Methods (`src/utils/gameLogic.ts`)

All methods are **static** on the `GameLogic` class.

| Method | What it does |
|--------|-------------|
| `normalizeGuestAnswer(raw, question)` | Converts full-text or letter to A/B/C/D. Always use this — never compare raw `guest_answer` strings. |
| `isPanelGuessCorrectWithContext()` | Compare panel guess to guest answer using normalizeGuestAnswer |
| `needsManualReveal()` | Returns true if panel ≠ guest (operator must click Reveal) |
| `calculatePanelGuessResult()` | When operator checks guess: update lives, auto-reveal if match, set `softEliminated` |
| `calculateRevealResult()` | When operator reveals answer: handle advancement, set `pendingAdvancement`, `guestVictoryPending`, `guestLostPending` |
| `calculateQuestionSelection()` | When new question selected: apply `pendingAdvancement`, update level & prize, mark question used |
| `canPlaceLock()` | Returns true if lock not yet placed and game active |
| `calculateLockPlacement()` | Stores lock level + prize amount |
| `canStartAllOrNothing()` | Returns true if `softEliminated && !lock.placed && !allOrNothingActive` |
| `startAllOrNothing()` | Clears question, initializes attempt 1 |
| `handleAllOrNothingGuess()` | Processes attempt 1/2; sets `allOrNothingWon` and `prize` on completion |
| `canTriggerGameOver()` | Returns true when game over can be shown |
| `triggerGameOver()` | Sets `gameOver: true` |
| `toggleGuestVictoryModal()` | Flips `guestVictoryModalVisible` |
| `toggleGuestLostModal()` | Flips `guestLostModalVisible` |
| `toggleAllOrNothingModal()` | Flips `allOrNothingModalVisible` |

---

## 10. GameStateManager (`src/lib/gameState.ts`)

| Method | Purpose |
|--------|---------|
| `initializeGame()` | Creates RTDB node if it doesn't exist |
| `subscribeToGameState(cb)` | `onValue` subscription — returns unsubscribe fn |
| `updateGameState(updates)` | Awaited write to RTDB — for critical state transitions |
| `updateGameStateBackground(updates)` | Fire-and-forget write — for rapid-fire display updates (reveals, banner, buzzer) |
| `getCurrentGameState()` | One-time `get` from RTDB |
| `resetGame()` | Resets game state to `defaultGameState` + clears `playAlong/` RTDB root |
| `resetPlayAlongAnswers()` | Clears entire `playAlong/` RTDB root (answers + question metadata) |
| `resetPlayAlongData()` | Clears `playAlong/` RTDB root + legacy Firestore play-along collections |
| `resetEverything()` | Resets game state to default (operator also clears Firestore questions) |
| `startKeepAlive()` | Heartbeat every 10 min to prevent auto-reset |

---

## 11. Audio System (`src/lib/sounds.ts`)

`SoundPlayer` is a singleton. Preloads all sounds on page load via `preloadSounds()`. Plays via Web Audio API with HTML5 Audio fallback. Volume: 0.7.

| Sound Key | File | Trigger |
|-----------|------|---------|
| `questionSelection` | `question-selection.mp3` | New question selected, option revealed, panel selects option |
| `panelCorrect` | `Correct.mp3` | Panel guess correct, Guest Victory modal |
| `panelWrong` | `Wrong.mp3` | Panel guess wrong, Guest Lost modal |
| `revealAnswer` | `team-answer-reveal.mp3` | Guest answer revealed |
| `lockPlaced` | `lock.mp3` | Lock placement confirmed |
| `buzzer` | `buzzer.wav` | Operator triggers buzzer |
| `whoosh` | `whoosh.mp3` | Hide Option lifeline — option vanishes |

---

## 12. Operator Workflow (Per Round)

1. **Select question** from Question Pool (right column middle) → audience sees question text. PlayAlongPanel writes question metadata to RTDB.
2. **Reveal options** one at a time (A → B → C → D) using the reveal buttons.
3. **Submit panel guess** (A/B/C/D buttons — Step 1).
4. **Check guess** (Step 2) → auto-reveals if panel matched guest, otherwise shows "Reveal Answer" button.
5. *(If needed)* **Reveal guest answer** (Step 3) → handles advancement or life loss. **This is the gate for the leaderboard — nothing visible to audience until this is clicked.**
6. *(Optional)* Use **Hide Option** (one-time, select which letter to vanish).
7. *(Optional)* Place **Lock** at current level via dropdown.
8. If `softEliminated`: choose **Start All or Nothing** or **Game Over**.
9. If AoN: select a question, submit attempt 1 guess, then attempt 2 guess.
10. When complete: operator manually triggers **result modals** (Victory / Lost / AoN result).

### Reset Controls
| Button | Effect |
|--------|--------|
| Download Data | Manual, anytime. Downloads one `.xlsx` backup of all game data (see §17). |
| Reset Game Only | **Auto-downloads a full backup first**, then resets game state + clears `playAlong/` RTDB (answers + metadata). Firestore `playAlongUsers` preserved. |
| Reset EVERYTHING | **Auto-downloads a full backup first**, then resets game state + deletes all Firestore questions + clears all play-along data including registrations. |

> Both resets call `downloadGameData()` **before** wiping anything. If the backup throws, the reset is aborted so data is never lost. Handlers in `GameControls.tsx` (`handleResetGame`, `handleResetEverything`, `handleDownloadData`).

### Operator Panel Layout (3 columns)
- **Left**: CSV Upload → PlayAlongPanel → 75:25 Banner → Host Alert (Buzzer)
- **Middle**: Question Pool
- **Right**: Game Controls (question display, option reveal, panel guess, check guess, reveal answer, hide option, lock, AoN, modals, resets)

---

## 13. Audience Display Layout

```
┌─────────────────────────────────────┐  12vh
│  Lives (hearts) │  JMYIC  │  Lock  │
├─────────────────────────────────────┤  20vh
│       Prize Ladder (horizontal)     │
├─────────────────────────────────────┤  65vh
│     Question + Options (2×2 grid)   │
│   Options revealed left-to-right    │
└─────────────────────────────────────┘
          ↑ 75:25 Banner slides up from bottom
```

### Audience Page State Routing (priority order)
1. Loading spinner
2. `allOrNothingActive` → `<AllOrNothingDisplay />`
3. `guestVictoryModalVisible` → `<GuestVictoryDisplay />`
4. `guestLostModalVisible` → `<GuestLostDisplay />`
5. `gameOver` → `<GameOverDisplay />`
6. Default → Question + PrizeLadder + LivesDisplay + SeventyFiveTwentyFiveBanner

### Option Display Logic (`QuestionDisplay.tsx`)
- Options only visible if they appear in `revealedOptions`.
- Color coding:
  - Default: yellow/gold
  - Panel guessed: blue highlight
  - Correct after reveal: green
  - Wrong after reveal: red
  - Hidden: animated out with `.animate-whoosh-out` (scale + blur + fade, 0.4s)

---

## 14. CSV Question Format

```csv
question,option_a,option_b,option_c,option_d,guest_answer
"What is 2+2?","4","5","3","6","A"
```

- All 6 columns required.
- `guest_answer` must be exactly `A`, `B`, `C`, or `D`.
- Questions are **appended** to the existing pool on upload (not replaced).
- Each question gets ID: `q_${timestamp}_${index}`.
- Saved to Firestore `questions/pool`.

---

## 15. Technology Stack

| Layer | Technology |
|-------|-----------|
| Framework | Next.js 15.5.4 (App Router) |
| Language | TypeScript 4.9 |
| Styling | Tailwind CSS 4.1.13 + PostCSS |
| Game state DB | Firebase Realtime Database (RTDB) — ~50-80ms sync |
| Questions / registrations DB | Firebase Firestore |
| Auth | Firebase Auth (anonymous / phone) — play-along users only |
| Audio | Web Audio API + HTML5 Audio fallback |
| Animations | Tailwind + canvas-confetti 1.9.3 |
| CSV Parsing | PapaParse 5.5.3 |
| Data export (Excel) | SheetJS (`xlsx`) — single multi-tab `.xlsx` backup |
| Fonts | Bebas Neue (display), Inter (body) |
| Deployment | Firebase Hosting (static) + Cloud Functions |

---

## 16. Environment & Deployment

### Environment Variables (all `NEXT_PUBLIC_`)
```
NEXT_PUBLIC_FIREBASE_API_KEY
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN
NEXT_PUBLIC_FIREBASE_PROJECT_ID
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID
NEXT_PUBLIC_FIREBASE_APP_ID
NEXT_PUBLIC_FIREBASE_DATABASE_URL       ← RTDB URL (new)
NEXT_PUBLIC_ENVIRONMENT                 # "local" | "staging" | "production"
NEXT_PUBLIC_OPERATOR_PASSWORD_HASH      ← SHA-256 hash of operator password (new)
```

> **Security:** The operator password hash is public (in bundled JS) but SHA-256 is one-way — the plain text cannot be recovered from it. The plain text password must **never** appear in code or version control.

### Build & Deploy
- `next.config.ts`: `output: 'export'` → static files in `out/`
- `firebase.json`: Hosting serves `out/`; also points to `database.rules.json`
- RTDB rules: deploy with `firebase deploy --only database`
- Full deploy: `firebase deploy`
- Firebase Project ID: `jmyic-ffc7a`
- Game RTDB path: `games/game1`
- Questions document: Firestore `questions/pool`
- Document schema version: `'3.0'`

---

## 17. Data Export / Backup (`src/utils/dataExport.ts`)

Operator-facing feature to download all game data as a single Excel workbook. Used manually (⬇️ Download Data button) and automatically before either reset (see §12 Reset Controls).

### Library
- **SheetJS (`xlsx`)** — added to `dependencies`. Browser-side workbook generation; `XLSX.writeFile()` handles the blob + download (same end result as the Blob pattern in `CSVUpload.tsx`).

### Functions
| Function | Purpose |
|----------|---------|
| `gatherAllGameData()` | Reads all 5 sources in parallel (`Promise.all`): RTDB `games/game1`, `playAlong/answers`, `playAlong/questions`; Firestore `questions/pool` + `playAlongUsers`. Returns a plain object. |
| `buildWorkbook(data)` | Builds the multi-sheet `XLSX.WorkBook`. |
| `downloadGameData()` | Orchestrator: gather → build → `XLSX.writeFile`. Filename `JMYIC-data-YYYY-MM-DD-HHmm.xlsx`. Returns a promise so reset handlers can `await` it. |

### Workbook sheets (one file, six tabs)
1. **Game Summary** — key/value of every game aspect: outcome, current Q#, lives, prize, panel guess + submitted/checked, panelCorrectAnswers, lock (placed/level/lockedMoney), soft-eliminated, hide-option, All-or-Nothing (active/attempt/won + attempt1/2 guesses & correctness), gameOver, lastActivity, documentVersion.
2. **Participants** — `playAlongUsers`: name, phone, UID, registered-at.
3. **Play-Along Answers** — flattened one row per (questionNumber, uid): name, phone, answer, correct answer, Correct? (computed vs question meta), answered-at, UID, questionId.
4. **Leaderboard** — one row per participant ranked by total correct; columns per question. Aggregation ported from `leaderboard/page.tsx` (latest answer per uid/question wins).
5. **Questions Pool** — all `questions/pool` rows: id, question, options A–D, guest answer.
6. **Question Meta** — `playAlong/questions/{n}`: question text + normalized correct answer (what play-along was graded against).

### Notes
- Pure client-side (no API route / Cloud Function). Behind the operator password gate.
- Phone numbers (PII) included by design — operator's private backup.
