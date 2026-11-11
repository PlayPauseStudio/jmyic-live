# JMYIC test plan

Site: https://jmyic-live.web.app · Operator password: the one set on Railway

**You need:** one laptop/tablet for `/operator`, one screen for `/audience`,
and at least two phones on `/play` (ideally one on Jio mobile data, one on
Wi-Fi). Use an incognito window as a "stranger" for the security checks.

**Files in this folder:**

| File | Use |
|---|---|
| `classic-test.csv` | 10 questions for Classic. Includes a lowercase answer (Q3 `b`), an answer written as text (Q4 `Shah Rukh Khan` = A), commas and quotes (Q5), a very long question (Q6), Hindi + emoji (Q7) |
| `oneshot-test.csv` | 6 contestants for One Shot. Includes a lowercase answer (Aisha `c`) and a text answer (Kabir `Pilot` = B) |
| `edge-missing-answer.csv` | a row with no answer, a row with an empty option D, then a normal row |
| `edge-too-long.csv` | one question over the 500-character limit — the upload should be refused |

Answer key (Classic): Q1 C · Q2 A · Q3 B · Q4 A · Q5 D · Q6 A · Q7 B · Q8 C · Q9 D · Q10 A
Answer key (One Shot): Shreya D · Rohit B · Aisha C · Kabir B · Meera A · Arjun C

"Reset Game" and "Reset Everything" download an Excel backup first — that is
expected. Reset Game keeps the questions; Reset Everything also clears
questions and signs every phone out.

---

## 1. Basics

- [ ] Every page's browser tab says **Judge Me If You Can** (home, operator, audience, play)
- [ ] `/operator` asks for a password. Wrong password → error, no access
- [ ] Wrong password 6+ times quickly → "too many attempts"; one more try is allowed every ~6 seconds after that
- [ ] Right password → panel opens. Refresh the tab → still logged in
- [ ] Open `/operator` in a **new** tab or incognito → asks for the password again
- [ ] `/audience` opens without a password and shows the waiting screen

## 2. Uploading questions

- [ ] Upload `classic-test.csv` → 10 questions in the pool
- [ ] Q5 shows the commas and quotes correctly, Q7 shows Hindi and emoji, Q6 wraps without breaking the layout (operator **and** big screen)
- [ ] Upload `edge-too-long.csv` → refused with an error; the previous 10 questions are still there
- [ ] Upload `edge-missing-answer.csv`, pick the first row, reveal options, submit a panel guess, Check → an error message ("Server error — try again.") appears and nothing freezes; you can still pick another question
- [ ] Pick the "empty option D" row → D shows blank on the big screen, nothing crashes
- [ ] Re-upload `classic-test.csv` before continuing

## 3. Classic — main path (watch the big screen the whole time)

Keep a phone on `/play` registered (section 6) so you see play-along too.

**Q1 (answer C) — panel wrong, guest wins the round**
- [ ] Select Q1. Big screen shows the question, **no options yet**
- [ ] Reveal B, then A → big screen shows only those two. **The answer is not highlighted anywhere**
- [ ] Hide B again with ↩ Hide → it disappears from the big screen; reveal it again → back at the end
- [ ] Reveal C and D. Panel guesses A → Check → operator says a manual reveal is needed; big screen still does **not** show the answer
- [ ] Reveal Guest Answer → C turns green on the big screen
- [ ] Select Q2 → the ladder moves up to ₹2K → ₹4K level

**Q4 (answer written as "Shah Rukh Khan") — text answers work**
- [ ] Reveal all, panel guesses B → Check → needs reveal → Reveal → **A** is shown as the answer

**Q3 (answer "b") — lowercase works, panel right costs a life**
- [ ] Reveal all, panel guesses B → Check → panel is right: guest loses a life (2 → 1), answer shows straight away

**Reset Question**
- [ ] Press Reset Question (Back to Step 1) → asks to confirm → life goes back to 2, options and guess cleared, Q3 is still marked used
- [ ] Play Q3 again: panel guesses C → wrong → Reveal → guest wins the round

**Edit a question mid-show**
- [ ] Select Q8. Click ✏️ Edit, fix a typo in option A, save → big screen updates immediately
- [ ] Edit a question already played (pool list) → saves fine; for a played Classic round with a changed answer you get a message telling you to use Reset Question

**Losing**
- [ ] Q2 (A): panel guesses A → right → lives 2 → 1
- [ ] Q9 (D): panel guesses D → right → lives 0 → "guest lost" screen on the big screen

## 4. Classic — lock, lifelines, All or Nothing

Reset Game (questions stay).

- [ ] Place the lock at level 2 → big screen shows the lock; a second lock is refused
- [ ] Hide-option lifeline: hide one wrong option → gone from the big screen and the phones; trying a second hide → "already used"
- [ ] 75:25 banner and buzzer: each shows/plays on the big screen
- [ ] Win Q1, then lose both lives on two questions → with the lock placed this is a **win of the locked amount**, not a loss
- [ ] Turn on Soft Eliminate → Start All or Nothing becomes available
- [ ] All or Nothing, attempt 1 wrong → attempt 2 on the **same** question; trying the same option twice is refused
- [ ] Attempt 2 wrong → guest wins ₹50K screen. (Run it again after Reset Game with the panel right → guest gets ₹0)
- [ ] Trigger Game Over → game-over screen on the big screen

## 5. One Shot

Reset Everything, switch the format to **One Shot**, upload `oneshot-test.csv`.

- [ ] Big screen title reads **Judge The Deal If You Can**; no ladder, lives or lock; operator hides those controls
- [ ] Shreya (D): reveal all, panel guesses D → Check → Shreya loses **immediately**, banner turns red
- [ ] Rohit (B): panel guesses A → Check → Reveal → Rohit **wins Goa trip for two**, banner turns green
- [ ] Aisha (answer `c`) and Kabir (answer `Pilot`) are judged correctly
- [ ] Edit Rohit's answer to A after his round → his result flips to lost
- [ ] Reset Question on a contestant → their win/loss is undone
- [ ] Excel export has a **Contestants** sheet with won/lost per person

Known, unchanged from before: in One Shot every contestant's play-along
answers are stored as "question 1", so each contestant's answers replace the
previous one's.

## 6. Play-along phones

- [ ] `/play` → sign in with Google; register name + phone
- [ ] Phone `12345` → "Please enter a valid 10-digit Indian mobile number."
- [ ] Same phone number on a second Google account → "already registered with another account"
- [ ] Before any option is revealed, the phone can't answer; revealed options become tappable as you reveal them
- [ ] A hidden option (lifeline) can't be chosen
- [ ] Answer → the phone shows the answer it sent; operator Play Along table shows the name within a second
- [ ] As soon as the operator presses **Check** → phones show answers are closed; a late tap says "Answers are closed for this question" (phones can still answer between the panel's guess and Check)
- [ ] The phone **never** shows which answer is right before the operator reveals it
- [ ] Lock the phone screen for 1 minute, unlock → it reconnects by itself and shows the current question
- [ ] Turn on airplane mode for 20 seconds, turn it off → reconnects, can answer again
- [ ] Reset Everything → phones are signed out and see the sign-in screen

## 7. Leaderboard (big screen)

- [ ] Operator → Play Along → show leaderboard (overall) → big screen shows names and per-question ticks
- [ ] Before the reveal, the **live** question is not marked right/wrong on the leaderboard
- [ ] Per-question view: "correct / incorrect" filters are disabled until the answer is revealed, then work
- [ ] Fastest / slowest ordering flips the list
- [ ] Hide the leaderboard → big screen goes back to the game
- [ ] With lots of players, the big screen shows the top 50 and "+ N more"

## 8. Connection and recovery

- [ ] Refresh the big screen mid-question → comes back to the exact same state
- [ ] Two operator tabs open → a click in one shows up in the other instantly
- [ ] Turn the operator's Wi-Fi off and on → a reconnecting banner, then back in sync
- [ ] **Server restart:** in the middle of a question (some options revealed, phones answered), Railway → server → Redeploy. Within ~1 minute every screen reconnects and the game, lives, revealed options and play-along answers are all still there
- [ ] Phones on Jio mobile data connect and answer (Jio has blocked plain Railway links before)

## 9. Export and privacy

- [ ] Download Excel → sheets: Game Summary, **Episode Log**, Participants, Play-Along Answers, Leaderboard, Questions Pool (or Contestants), Question Meta
- [ ] Phone numbers appear **only** in this Excel — never on the big screen, leaderboard, or operator table
- [ ] In the incognito "stranger" window, open `/audience` before an answer is revealed → the answer is not shown anywhere

## 10. Status strip (top of the operator panel)

- [ ] Strip shows Server · Big screen · Phones · Answers · Server load · Backup · Log, and stays at the top while scrolling
- [ ] Close the big screen tab → "Big screen: Not connected" turns red within ~2 s; reopen → green again
- [ ] Phones: "online" counts open `/play` tabs; "registered" counts signed-up phones
- [ ] Answers counts play-along answers to the question on screen
- [ ] Backup says "Saved … ago" in green (Redis). Red means a restart now would lose recent changes
- [ ] Turn the laptop's Wi-Fi off → Server goes red ("Reconnecting…"); back on → green

## 11. Episode log (Excel → Episode Log sheet)

- [ ] Play a few rounds, then Download Excel → Episode Log lists every click in order with time and "Into Episode"
- [ ] Each round has: question selected, options revealed, panel guess, checked, "Answers closed" (count + A/B/C/D split), answer revealed, play-along result (how many got it right), and the result (life lost / round won / ladder moved)
- [ ] Lives After and Prize After columns track the game (blank in One Shot)
- [ ] Try something refused (second hide-option) → a "Refused: hideOption — hide_used" row
- [ ] Edit a question → a row showing old → new for each changed field
- [ ] Big screen refresh, operator sign-in and a wrong password each leave a "System" row
- [ ] Reset Game → log continues. Reset Everything → the backup Excel taken before it has the full log; the new log starts with "Reset Everything"
- [ ] Railway → Redeploy mid-show → the log survives, with a "Server started — Show restored from the Redis backup" row

## 12. Load (done on the server, for reference)

Simulated with 1000 and 2000 phones all answering in the same instant:
every answer accepted, all confirmed within ~0.2 s (1000) / ~0.3 s (2000).
Re-run any time against a local server: `cd server && npm run load`.

During a real show you can check how loaded the server is at
`https://jmyic-api.playpause.studio/healthz` — `eventLoopDelay.maxMs`
under ~100 is comfortable.
