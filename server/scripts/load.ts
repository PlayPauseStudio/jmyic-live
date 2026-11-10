/**
 * Load test: N phones join, register, and all answer the same question at the
 * same moment, with the operator panel, the big screen and its leaderboard open.
 *
 *   npm run load                 # 1000 phones against http://127.0.0.1:8080
 *   PHONES=2000 npm run load
 *
 * Needs a LOCAL server started without FIREBASE_PROJECT_ID (phones then sign
 * in with a made-up uid). It RESETS EVERYTHING on that server.
 */
import { io, type Socket } from 'socket.io-client';

const URL = process.env.LOAD_URL ?? 'http://127.0.0.1:8080';
const PHONES = Number(process.env.PHONES ?? 1000);
const PASSWORD = process.env.OPERATOR_PASSWORD ?? 'letmein';
const ROUNDS = Number(process.env.ROUNDS ?? 3);

type Ack = { ok: boolean; error?: string };
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

interface Client {
  socket: Socket;
  view: Record<string, unknown>;
  bytes: number;
  messages: number;
  send: (event: string, payload?: unknown) => Promise<Ack>;
}

function connect(role: string, token?: string): Promise<Client> {
  return new Promise((resolve, reject) => {
    const socket = io(URL, { transports: ['websocket'], auth: { role, token }, reconnection: false, forceNew: true });
    const c: Client = {
      socket,
      view: {},
      bytes: 0,
      messages: 0,
      send: (event, payload) =>
        new Promise((r) => socket.timeout(30_000).emit(event, payload ?? {}, (err: unknown, a: Ack) => r(err ? { ok: false, error: 'timeout' } : a))),
    };
    socket.on('state:full', (m: { state: Record<string, unknown> }) => {
      c.view = m.state;
      c.bytes += JSON.stringify(m).length;
      c.messages++;
    });
    socket.on('state:patch', (m: { changed: Record<string, unknown> }) => {
      c.view = { ...c.view, ...m.changed };
      c.bytes += JSON.stringify(m).length;
      c.messages++;
    });
    socket.once('connect', () => resolve(c));
    socket.once('connect_error', (e) => reject(e));
  });
}

function pct(xs: number[], p: number): number {
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.floor((p / 100) * s.length))] ?? 0;
}

async function inBatches<T>(n: number, size: number, fn: (i: number) => Promise<T>): Promise<T[]> {
  const out: T[] = [];
  for (let i = 0; i < n; i += size) {
    out.push(...(await Promise.all(Array.from({ length: Math.min(size, n - i) }, (_, j) => fn(i + j)))));
  }
  return out;
}

async function main() {
  const login = await fetch(`${URL}/auth/operator/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ password: PASSWORD }),
  });
  const { token } = (await login.json()) as { token: string };
  const op = await connect('operator', token);
  const disp = await connect('display');
  await sleep(200);
  await op.send('op:resetEverything');
  const questions = Array.from({ length: ROUNDS + 1 }, (_, i) => ({
    question: `Load question ${i + 1}`,
    option_a: 'Alpha',
    option_b: 'Bravo',
    option_c: 'Charlie',
    option_d: 'Delta',
    guest_answer: 'ABCD'[i % 4],
  }));
  await op.send('op:replaceQuestions', { questions });
  await sleep(300);
  const pool = op.view.pool as { id: string }[];

  // Phones join in waves of 100, the way a hall full of people scanning a QR code would.
  let t = Date.now();
  const phones = await inBatches(PHONES, 100, (i) => connect('audience', `load-${i}`));
  console.log(`${PHONES} phones connected in ${Date.now() - t} ms`);

  t = Date.now();
  const regs = await inBatches(PHONES, 200, (i) =>
    phones[i].send('aud:register', { name: `Player ${i}`, phone: String(9000000000 + i) }),
  );
  console.log(`registered in ${Date.now() - t} ms, failures: ${regs.filter((r) => !r.ok).length}`);
  await op.send('op:setFlags', { showLeaderboard: true, leaderboardScope: 'all' });

  for (let round = 0; round < ROUNDS; round++) {
    await op.send('op:selectQuestion', { questionId: pool[round].id });
    await op.send('op:revealAllOptions');
    await sleep(500);
    const opBytes0 = op.bytes;
    const dispBytes0 = disp.bytes;
    const phoneBytes0 = phones[0].bytes;

    await fetch(`${URL}/healthz`); // starts a fresh busy-ness window
    // Everyone taps at once.
    const start = Date.now();
    const lat: number[] = [];
    const results = await Promise.all(
      phones.map(async (p, i) => {
        const s = Date.now();
        const a = await p.send('aud:answer', { answer: 'ABCD'[i % 4] });
        lat.push(Date.now() - s);
        return a;
      }),
    );
    const allAcked = Date.now() - start;
    // Wait for the operator table to show every answer.
    while ((op.view.responses as unknown[] | undefined)?.length !== PHONES && Date.now() - start < 30_000) await sleep(20);
    const opSees = Date.now() - start;
    const h = (await (await fetch(`${URL}/healthz`)).json()) as { eventLoopDelay: { p99Ms: number; maxMs: number }; memoryMb: number };
    await sleep(1500);

    console.log(
      `\nround ${round + 1}: ${results.filter((r) => r.ok).length}/${PHONES} answers accepted` +
        (results.some((r) => !r.ok) ? ` (errors: ${[...new Set(results.filter((r) => !r.ok).map((r) => r.error))].join(',')})` : ''),
    );
    console.log(`  phone tap → server confirm: p50 ${pct(lat, 50)} ms, p95 ${pct(lat, 95)} ms, p99 ${pct(lat, 99)} ms, max ${Math.max(...lat)} ms`);
    console.log(`  all ${PHONES} confirmed after ${allAcked} ms; operator table complete after ${opSees} ms`);
    console.log(
      `  data sent during the burst: operator ${((op.bytes - opBytes0) / 1024).toFixed(0)} KB, ` +
        `big screen ${((disp.bytes - dispBytes0) / 1024).toFixed(0)} KB, each phone ${((phones[0].bytes - phoneBytes0) / 1024).toFixed(1)} KB`,
    );
    console.log(`  server busy: longest stall ${h.eventLoopDelay.maxMs} ms (p99 ${h.eventLoopDelay.p99Ms} ms), memory ${h.memoryMb} MB`);
    await op.send('op:submitPanelGuess', { guess: 'A' });
    await op.send('op:checkPanelGuess');
    await op.send('op:revealGuestAnswer');
  }

  const health = (await (await fetch(`${URL}/healthz`)).json()) as Record<string, unknown>;
  console.log('\nserver health after test:', JSON.stringify(health));
  for (const p of phones) p.socket.close();
  op.socket.close();
  disp.socket.close();
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
