/**
 * End-to-end smoke test against a running dev server (`npm run dev`, no
 * Firebase configured, so phone tokens are taken as raw uids).
 *
 *   SMOKE_URL=http://127.0.0.1:8080 SMOKE_PASSWORD=letmein npm run smoke
 *
 * It RESETS EVERYTHING on the target server. Never point it at a live show.
 */
import { io, type Socket } from 'socket.io-client';

const URL = process.env.SMOKE_URL ?? 'http://127.0.0.1:8080';
const PASSWORD = process.env.SMOKE_PASSWORD ?? 'letmein';

type View = Record<string, any>;
interface Ack {
  ok: boolean;
  error?: string;
  classicNeedsReset?: boolean;
  data?: any;
}

let passed = 0;
let failed = 0;
function check(name: string, cond: unknown, detail?: unknown): void {
  if (cond) {
    passed++;
    console.log(`  ✓ ${name}`);
  } else {
    failed++;
    console.log(`  ✗ ${name}`, detail === undefined ? '' : JSON.stringify(detail).slice(0, 300));
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** A connected client that keeps its view up to date from full + patch messages. */
interface Client {
  socket: Socket;
  view: View;
  /** Every message received, as JSON — for "this never left the server" checks. */
  wire: string[];
  send: (event: string, payload?: unknown) => Promise<Ack>;
  close: () => void;
}

function connect(role: string, token?: string): Promise<Client> {
  return new Promise((resolve, reject) => {
    const socket = io(URL, { transports: ['websocket'], auth: { role, token }, reconnection: false });
    const client: Client = {
      socket,
      view: {},
      wire: [],
      send: (event, payload) =>
        new Promise((res) => {
          socket.timeout(5000).emit(event, payload ?? {}, (err: unknown, ack: Ack) => res(err ? { ok: false, error: 'timeout' } : ack));
        }),
      close: () => socket.close(),
    };
    socket.on('state:full', (m: { state: View }) => {
      client.wire.push(JSON.stringify(m));
      client.view = m.state;
      resolve(client);
    });
    socket.on('state:patch', (m: { changed: View }) => {
      client.wire.push(JSON.stringify(m));
      client.view = { ...client.view, ...m.changed };
    });
    socket.on('connect_error', (e) => reject(e));
    setTimeout(() => reject(new Error('connect timeout')), 5000);
  });
}

async function login(password: string): Promise<{ status: number; token?: string }> {
  const res = await fetch(`${URL}/auth/operator/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ password }),
  });
  const body = (await res.json().catch(() => ({}))) as { token?: string };
  return { status: res.status, token: body.token };
}

const CLASSIC = [
  { question: 'Favourite colour?', option_a: 'Red', option_b: 'Blue', option_c: 'Green', option_d: 'Yellow', guest_answer: 'A' },
  { question: 'Favourite hobby?', option_a: 'Reading', option_b: 'Gaming', option_c: 'Sports', option_d: 'Music', guest_answer: 'B' },
  { question: 'Where do you live?', option_a: 'City', option_b: 'Suburbs', option_c: 'Village', option_d: 'Mountains', guest_answer: 'Mountains' },
  { question: 'Q4', option_a: 'a', option_b: 'b', option_c: 'c', option_d: 'd', guest_answer: 'D' },
];

async function main(): Promise<void> {
  console.log(`Smoke test against ${URL}`);

  // ── HTTP ───────────────────────────────────────────────────────────────────
  console.log('\nHTTP');
  const health = (await (await fetch(`${URL}/healthz`)).json()) as { ok: boolean };
  check('/healthz ok', health.ok);
  check('wrong password → 401', (await login('nope')).status === 401);
  const good = await login(PASSWORD);
  check('right password → token', good.status === 200 && !!good.token);
  const token = good.token!;

  // ── Handshake ──────────────────────────────────────────────────────────────
  console.log('\nHandshake');
  await connect('operator').then(
    (c) => (c.close(), check('operator without token rejected', false)),
    () => check('operator without token rejected', true),
  );
  await connect('operator', 'forged.jwt.value').then(
    (c) => (c.close(), check('operator with forged token rejected', false)),
    () => check('operator with forged token rejected', true),
  );
  await connect('wizard').then(
    (c) => (c.close(), check('unknown role rejected', false)),
    () => check('unknown role rejected', true),
  );

  const op = await connect('operator', token);
  const disp = await connect('display');
  check('operator connected with full state', 'pool' in op.view && 'responses' in op.view);
  check('display gets no pool', !('pool' in disp.view));

  // Fresh show
  check('reset everything', (await op.send('op:resetEverything')).ok);
  await op.send('op:setFormat', { format: 'classic' });

  const phone1 = await connect('audience', 'uid-phone-1');
  const phone2 = await connect('audience', 'uid-phone-2');
  check('phone connected, not registered yet', phone1.view.you === null);
  check('phone view has no pool / lives / lock', !('pool' in phone1.view) && !('lives' in phone1.view) && !('lock' in phone1.view));

  // ── Role guards ────────────────────────────────────────────────────────────
  console.log('\nRole guards');
  check('display cannot run operator actions', (await disp.send('op:setFormat', { format: 'oneShot' })).error === 'forbidden');
  check('phone cannot run operator actions', (await phone1.send('op:triggerBuzzer')).error === 'forbidden');
  check('phone cannot export data', (await phone1.send('op:exportData')).error === 'forbidden');
  check('display cannot answer', (await disp.send('aud:answer', { answer: 'A' })).error === 'forbidden');
  check('bad payload rejected', (await op.send('op:placeLock', { level: 99 })).error === 'bad_payload');
  check('unknown flag rejected', (await op.send('op:setFlags', { gameOver: true })).error === 'bad_payload');

  // ── Question pool ──────────────────────────────────────────────────────────
  console.log('\nQuestion pool');
  check('upload questions', (await op.send('op:replaceQuestions', { questions: CLASSIC })).ok);
  await sleep(100);
  const pool = op.view.pool as { id: string; guest_answer: string }[];
  check('operator sees the pool with answers', pool.length === 4 && pool[0].guest_answer === 'A');
  check('display never received the pool', !disp.wire.some((m) => m.includes('Favourite hobby')));

  // ── Classic round 1: panel wrong → guest wins ──────────────────────────────
  console.log('\nClassic round 1');
  check('cannot check before a question', (await op.send('op:checkPanelGuess')).error === 'no_question');
  check('select Q1', (await op.send('op:selectQuestion', { questionId: pool[0].id })).ok);
  await sleep(100);
  check('cannot re-select a used question', (await op.send('op:selectQuestion', { questionId: pool[0].id })).error === 'question_used');
  check('operator sees guest answer', op.view.currentQuestion?.guest_answer === 'A');
  check('display: guest answer blank before reveal', disp.view.currentQuestion?.guest_answer === '');
  check('display: unrevealed options blank', disp.view.currentQuestion?.option_a === '' && disp.view.currentQuestion?.question === 'Favourite colour?');
  check('phone: guest answer blank', phone1.view.currentQuestion?.guest_answer === '');

  await op.send('op:revealOption', { option: 'A' });
  await op.send('op:revealOption', { option: 'B' });
  await sleep(100);
  check('display: revealed options shown', disp.view.currentQuestion?.option_a === 'Red' && disp.view.currentQuestion?.option_b === 'Blue');
  check('display: still-hidden options blank', disp.view.currentQuestion?.option_c === '');
  check('display: revealed order', JSON.stringify(disp.view.revealedOptions) === '["A","B"]');

  // Phones
  check('answer before registering → not_registered', (await phone1.send('aud:answer', { answer: 'A' })).error === 'not_registered');
  check('bad phone number rejected', (await phone1.send('aud:register', { name: 'Asha', phone: '12345' })).error === 'bad_phone');
  check('register phone 1', (await phone1.send('aud:register', { name: 'Asha', phone: '+91 98765 43210' })).ok);
  await sleep(100);
  check('phone 1 gets its own profile', phone1.view.you?.profile?.phone === '+919876543210');
  check('same number on another account → duplicate_phone', (await phone2.send('aud:register', { name: 'Bo', phone: '9876543210' })).error === 'duplicate_phone');
  check('register phone 2', (await phone2.send('aud:register', { name: 'Bo', phone: '9123456780' })).ok);
  check('cannot answer an unrevealed option', (await phone1.send('aud:answer', { answer: 'C' })).error === 'option_not_visible');
  check('phone 1 answers A', (await phone1.send('aud:answer', { answer: 'A' })).ok);
  check('phone 2 answers B', (await phone2.send('aud:answer', { answer: 'B' })).ok);
  await sleep(600);
  check('phone 1 sees its own answer', phone1.view.you?.answers?.['1']?.answer === 'A');
  check('phone 2 never received phone 1 details', !phone2.wire.some((m) => m.includes('9876543210') || m.includes('Asha')));
  const rows = op.view.responses as { name: string; answer: string }[];
  check('operator sees live responses', rows.length === 2 && rows.some((r) => r.name === 'Asha' && r.answer === 'A'));
  check('operator responses carry no phone numbers', !JSON.stringify(op.view.responses).includes('9876543210'));
  check('participant count', op.view.participantCount === 2 && disp.view.participantCount === 2);

  check('panel guesses B', (await op.send('op:submitPanelGuess', { guess: 'B' })).ok);
  check('check panel guess', (await op.send('op:checkPanelGuess')).ok);
  await sleep(100);
  check('needs manual reveal (panel wrong)', op.view.needsManualReveal === true);
  check('display: answer STILL blank between check and reveal', disp.view.currentQuestion?.guest_answer === '');
  check('play-along window closed', (await phone1.send('aud:answer', { answer: 'B' })).error === 'window_closed');
  check('cannot check twice', (await op.send('op:checkPanelGuess')).error === 'already_checked');

  check('reveal guest answer', (await op.send('op:revealGuestAnswer')).ok);
  await sleep(100);
  check('display: answer shown after reveal', disp.view.currentQuestion?.guest_answer === 'A');
  check('display: all options shown after reveal', disp.view.currentQuestion?.option_d === 'Yellow');
  check('guest won the round', op.view.questionsAnswered === 1 && op.view.pendingAdvancement === true);
  check('cannot reveal twice', (await op.send('op:revealGuestAnswer')).error === 'nothing_to_reveal');

  // ── Classic round 2: panel right → life lost; Reset Question restores it ──
  console.log('\nClassic round 2 + Reset Question');
  check('select Q2', (await op.send('op:selectQuestion', { questionId: pool[1].id })).ok);
  await sleep(100);
  check('advanced to level 2 / ₹4,000', op.view.currentQuestionNumber === 2 && op.view.prize === 4000);
  await op.send('op:revealAllOptions');
  await op.send('op:submitPanelGuess', { guess: 'B' });
  check('check (panel right)', (await op.send('op:checkPanelGuess')).ok);
  await sleep(100);
  check('guest lost a life', op.view.lives === 1 && op.view.currentQuestionAnswerRevealed === true);
  check('display: answer shown when panel was right', disp.view.currentQuestion?.guest_answer === 'B');

  // Leaderboard on the big screen
  await op.send('op:setFlags', { showLeaderboard: true, leaderboardScope: 'all' });
  await sleep(100);
  const lb = disp.view.leaderboard;
  check('display gets leaderboard while shown', !!lb && lb.answers?.['1'] && Object.keys(lb.answers['1']).length === 2);
  check('leaderboard carries names, not phones', JSON.stringify(lb).includes('Asha') && !JSON.stringify(lb).includes('9876543210'));
  check('Q1 graded A', lb.meta?.['1']?.correctAnswer === 'A');
  await op.send('op:setFlags', { showLeaderboard: false });
  await sleep(100);
  check('leaderboard data dropped when hidden', disp.view.leaderboard === null);

  check('reset question', (await op.send('op:resetQuestion')).ok);
  await sleep(100);
  check('life restored by Reset Question', op.view.lives === 1 + 1 && op.view.currentQuestionAnswerRevealed === false);
  check('question stays used', op.view.usedQuestions[pool[1].id] === true);
  check('display: answer hidden again after reset', disp.view.currentQuestion?.guest_answer === '');

  // ── Live edit ──────────────────────────────────────────────────────────────
  console.log('\nEditing');
  const edit = await op.send('op:editQuestion', {
    question: { ...CLASSIC[1], id: pool[1].id, question: 'Favourite hobby (fixed)?', guest_answer: 'C' },
  });
  await sleep(100);
  check('edit saved', edit.ok && edit.classicNeedsReset === false);
  check('live question updated on display', disp.view.currentQuestion?.question === 'Favourite hobby (fixed)?');
  check('edit rejects blank option', (await op.send('op:editQuestion', { question: { ...CLASSIC[1], id: pool[1].id, option_a: '  ', guest_answer: 'A' } })).error === 'bad_payload');

  // Lock + hide option
  check('place lock at level 2', (await op.send('op:placeLock', { level: 2 })).ok);
  await sleep(100);
  check('locked ₹4,000', op.view.lockedMoney === 4000 && disp.view.lock?.placed === true);
  check('cannot lock twice', (await op.send('op:placeLock', { level: 3 })).error === 'lock_unavailable');
  check('hide option D', (await op.send('op:hideOption', { option: 'D' })).ok);
  check('hide option is one-time', (await op.send('op:hideOption', { option: 'C' })).error === 'hide_used');

  // Buzzer
  const before = disp.view.buzzerTrigger;
  await op.send('op:triggerBuzzer');
  await sleep(100);
  check('buzzer reaches display', disp.view.buzzerTrigger > before);

  // ── All or Nothing ─────────────────────────────────────────────────────────
  console.log('\nAll or Nothing');
  check('AoN unavailable before soft elimination', (await op.send('op:startAllOrNothing')).error === 'aon_unavailable');
  await op.send('op:setFlags', { softEliminated: true });
  check('start AoN', (await op.send('op:startAllOrNothing')).ok);
  check('select AoN question (Q3, text answer)', (await op.send('op:selectQuestion', { questionId: pool[2].id })).ok);
  await op.send('op:submitPanelGuess', { guess: 'A' });
  check('reveal AoN attempt 1 (wrong)', (await op.send('op:revealAonResult')).ok);
  await sleep(100);
  check('moved to attempt 2', op.view.allOrNothingAttempt === 2);
  check('display: answer blank again for attempt 2', disp.view.currentQuestion?.guest_answer === '');
  check('display: attempt-1 guess still visible', disp.view.currentQuestion?.option_a === 'City');
  check('cannot repeat attempt-1 guess', (await op.send('op:submitPanelGuess', { guess: 'A' })).error === 'already_guessed');
  await op.send('op:submitPanelGuess', { guess: 'D' });
  check('reveal AoN attempt 2', (await op.send('op:revealAonResult')).ok);
  await sleep(100);
  check('panel right on attempt 2 (text answer "Mountains" = D)', op.view.allOrNothingPendingPanelWin === true && op.view.prize === 0);
  check('toggle AoN result modal', (await op.send('op:toggleAonModal')).ok);
  await sleep(100);
  check('game over on display', disp.view.gameOver === true && disp.view.allOrNothingModalVisible === true);

  // ── Export ─────────────────────────────────────────────────────────────────
  console.log('\nExport');
  const exp = await op.send('op:exportData');
  check('operator export has participants with phones', exp.ok && exp.data.participants.some((p: any) => p.phone === '+919876543210'));
  check('export has answers + meta + pool', !!exp.data.answers['1'] && !!exp.data.questionsMeta['1'] && exp.data.questionsPool.length === 4);
  check('display never received a phone number', !disp.wire.some((m) => m.includes('9876543210') || m.includes('9123456780')));

  // ── Reset Game ─────────────────────────────────────────────────────────────
  console.log('\nReset Game');
  const resetBefore = phone1.view.playersResetAt;
  check('reset game', (await op.send('op:resetGame')).ok);
  await sleep(150);
  check('phones signed out (you: null, reset bumped)', phone1.view.you === null && phone1.view.playersResetAt > resetBefore);
  check('questions kept, players cleared', op.view.pool.length === 4 && op.view.participantCount === 0);
  check('format kept', op.view.gameFormat === 'classic');

  // ── One Shot ───────────────────────────────────────────────────────────────
  console.log('\nOne Shot');
  await op.send('op:setFormat', { format: 'oneShot' });
  await op.send('op:replaceQuestions', {
    questions: [
      { contestant_name: 'Shreya', prize: 'iPhone 16', question: 'Colour?', option_a: 'Red', option_b: 'Blue', option_c: 'Green', option_d: 'Yellow', guest_answer: 'A' },
      { contestant_name: 'Rohit', prize: 'iPhone 16', question: 'Hobby?', option_a: 'R', option_b: 'G', option_c: 'S', option_d: 'M', guest_answer: 'B' },
    ],
  });
  await sleep(100);
  const os = op.view.pool as { id: string }[];
  await op.send('op:selectQuestion', { questionId: os[0].id });
  await op.send('op:submitPanelGuess', { guess: 'C' });
  await op.send('op:checkPanelGuess');
  check('One Shot: lock not available', (await op.send('op:placeLock', { level: 1 })).error === 'lock_unavailable');
  await op.send('op:revealGuestAnswer');
  await sleep(100);
  check('judge wrong → contestant wins', op.view.oneShotOutcome === 'won' && disp.view.oneShotOutcome === 'won');
  const fix = await op.send('op:editQuestion', {
    question: { id: os[0].id, contestant_name: 'Shreya', prize: 'iPhone 16', question: 'Colour?', option_a: 'Red', option_b: 'Blue', option_c: 'Green', option_d: 'Yellow', guest_answer: 'C' },
  });
  await sleep(100);
  check('correcting the answer flips the result to lost', fix.ok && op.view.oneShotOutcome === 'lost' && op.view.oneShotResults[os[0].id] === 'lost');

  await op.send('op:selectQuestion', { questionId: os[1].id });
  await op.send('op:submitPanelGuess', { guess: 'B' });
  await op.send('op:checkPanelGuess');
  await sleep(100);
  check('judge right → contestant loses at once', op.view.oneShotOutcome === 'lost' && disp.view.currentQuestion?.guest_answer === 'B');

  [op, disp, phone1, phone2].forEach((c) => c.close());
  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
}

main().catch((e) => {
  console.error('Smoke test crashed:', e);
  process.exit(1);
});
