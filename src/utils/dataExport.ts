import * as XLSX from 'xlsx';
import { get } from 'firebase/database';
import { getDoc, getDocs } from 'firebase/firestore';
import {
  gameRtdbRef,
  playAlongAnswersRtdbRef,
  playAlongQuestionsMetaRtdbRef,
  questionsDocRef,
  playAlongUsersRef,
} from '../lib/firebase';
import type { GameState, Question, QuestionPool } from '../lib/types';

// ── Raw shapes pulled from the DB ──────────────────────────────────────────

// playAlong/answers/{questionNumber}/{uid}
interface RawAnswer {
  answer?: 'A' | 'B' | 'C' | 'D';
  name?: string;
  phone?: string;
  timestamp?: number;
  questionId?: string;
  questionNumber?: number;
}
type AnswersData = Record<string, Record<string, RawAnswer>>;

// playAlong/questions/{questionNumber}
interface RawQuestionMeta {
  questionText?: string;
  correctAnswer?: 'A' | 'B' | 'C' | 'D' | null;
  questionNumber?: number;
}
type QuestionsMetaData = Record<string, RawQuestionMeta>;

interface RawParticipant {
  uid?: string;
  name?: string;
  phone?: string;
  createdAt?: number | string;
}

export interface GatheredGameData {
  gameState: GameState | null;
  answers: AnswersData;
  questionsMeta: QuestionsMetaData;
  questionsPool: Question[];
  questionsPoolUpdated: string | null;
  participants: RawParticipant[];
}

// ── 1. Gather every data source in parallel ────────────────────────────────

export async function gatherAllGameData(): Promise<GatheredGameData> {
  const [
    gameSnap,
    answersSnap,
    questionsMetaSnap,
    questionsPoolSnap,
    participantsSnap,
  ] = await Promise.all([
    get(gameRtdbRef),
    get(playAlongAnswersRtdbRef),
    get(playAlongQuestionsMetaRtdbRef),
    getDoc(questionsDocRef),
    getDocs(playAlongUsersRef),
  ]);

  const pool = questionsPoolSnap.exists()
    ? (questionsPoolSnap.data() as QuestionPool & { lastUpdated?: string })
    : null;

  return {
    gameState: gameSnap.exists() ? (gameSnap.val() as GameState) : null,
    answers: (answersSnap.val() as AnswersData) ?? {},
    questionsMeta: (questionsMetaSnap.val() as QuestionsMetaData) ?? {},
    questionsPool: pool?.questions ?? [],
    questionsPoolUpdated: pool?.lastUpdated ?? null,
    participants: participantsSnap.docs.map((d) => d.data() as RawParticipant),
  };
}

// ── Helpers ─────────────────────────────────────────────────────────────────

function fmtTimestamp(ts: number | string | null | undefined): string {
  if (ts === null || ts === undefined || ts === '') return '';
  const d = typeof ts === 'number' ? new Date(ts) : new Date(ts);
  return isNaN(d.getTime()) ? String(ts) : d.toLocaleString();
}

function yesNo(v: boolean | undefined): string {
  return v ? 'Yes' : 'No';
}

// ── 2. Build the workbook (one file, multiple tabs) ────────────────────────

export function buildWorkbook(data: GatheredGameData): XLSX.WorkBook {
  const wb = XLSX.utils.book_new();
  const g = data.gameState;

  // -- Sheet 1: Game Summary (key / value) -----------------------------------
  const lockLevel = g?.lock?.level ?? '';
  const winner = (() => {
    if (!g) return '';
    if (g.allOrNothingComplete) return g.allOrNothingWon ? 'Guest won All-or-Nothing (₹50,000)' : 'Panel won All-or-Nothing (₹0)';
    if (g.guestVictoryModalVisible || g.guestVictoryPending) return 'Guest Victory';
    if (g.guestLostModalVisible || g.guestLostPending) return 'Guest Lost';
    if (g.panelCorrectAnswers >= 2) return 'Panel Victory';
    if (g.gameOver) return 'Game Over';
    return 'In progress / not finished';
  })();

  const summaryRows: [string, string | number][] = g
    ? [
        ['Exported At', new Date().toLocaleString()],
        ['Outcome', winner],
        ['Current Question Number', g.currentQuestionNumber],
        ['Questions Answered', g.questionsAnswered],
        ['Current Question Text', g.currentQuestion?.question ?? ''],
        ['Lives Remaining', g.lives],
        ['Current Prize (₹)', g.prize],
        ['Panel Guess', g.panelGuess || ''],
        ['Panel Guess Submitted', yesNo(g.panelGuessSubmitted)],
        ['Panel Guess Checked', yesNo(g.panelGuessChecked)],
        ['Panel Correct Answers', g.panelCorrectAnswers],
        ['Current Answer Revealed', yesNo(g.currentQuestionAnswerRevealed)],
        ['Soft Eliminated', yesNo(g.softEliminated)],
        ['Lock Placed', yesNo(g.lock?.placed)],
        ['Lock Level', lockLevel],
        ['Locked Money (₹)', g.lockedMoney],
        ['Hide Option Used', yesNo(g.hideOptionUsed)],
        ['Hidden Option', g.hiddenOption ?? ''],
        ['All-or-Nothing Active', yesNo(g.allOrNothingActive)],
        ['All-or-Nothing Attempt', g.allOrNothingAttempt],
        ['All-or-Nothing Complete', yesNo(g.allOrNothingComplete)],
        ['All-or-Nothing Won', yesNo(g.allOrNothingWon)],
        ['AoN Attempt 1 Guess', g.allOrNothingAttempt1Guess || ''],
        ['AoN Attempt 1 Correct', yesNo(g.allOrNothingAttempt1Correct)],
        ['AoN Attempt 2 Guess', g.allOrNothingAttempt2Guess || ''],
        ['AoN Attempt 2 Correct', yesNo(g.allOrNothingAttempt2Correct)],
        ['Game Over', yesNo(g.gameOver)],
        ['Last Activity', fmtTimestamp(g.lastActivity)],
        ['Document Version', g.documentVersion ?? ''],
      ]
    : [['Game State', 'No game state found']];

  const summarySheet = XLSX.utils.aoa_to_sheet([['Field', 'Value'], ...summaryRows]);
  summarySheet['!cols'] = [{ wch: 28 }, { wch: 45 }];
  XLSX.utils.book_append_sheet(wb, summarySheet, 'Game Summary');

  // -- Sheet 2: Participants -------------------------------------------------
  const participantRows = data.participants.map((p) => ({
    Name: p.name ?? '',
    Phone: p.phone ?? '',
    UID: p.uid ?? '',
    'Registered At': fmtTimestamp(p.createdAt),
  }));
  const participantsSheet = XLSX.utils.json_to_sheet(
    participantRows.length ? participantRows : [{ Name: '', Phone: '', UID: '', 'Registered At': '' }]
  );
  participantsSheet['!cols'] = [{ wch: 24 }, { wch: 18 }, { wch: 30 }, { wch: 22 }];
  XLSX.utils.book_append_sheet(wb, participantsSheet, 'Participants');

  // -- Sheet 3: Play-Along Answers (flattened) -------------------------------
  const answerRows: Record<string, string | number>[] = [];
  const sortedQNums = Object.keys(data.answers)
    .map(Number)
    .filter((n) => !isNaN(n))
    .sort((a, b) => a - b);

  for (const qNum of sortedQNums) {
    const correct = data.questionsMeta[String(qNum)]?.correctAnswer ?? null;
    const responses = data.answers[String(qNum)] ?? {};
    for (const [uid, r] of Object.entries(responses)) {
      answerRows.push({
        'Question #': qNum,
        Name: r.name ?? '',
        Phone: r.phone ?? '',
        Answer: r.answer ?? '',
        'Correct Answer': correct ?? '',
        'Correct?': correct ? (r.answer === correct ? 'Yes' : 'No') : 'Not revealed',
        'Answered At': fmtTimestamp(r.timestamp),
        UID: uid,
        'Question ID': r.questionId ?? '',
      });
    }
  }
  const answersSheet = XLSX.utils.json_to_sheet(
    answerRows.length
      ? answerRows
      : [{ 'Question #': '', Name: '', Phone: '', Answer: '', 'Correct Answer': '', 'Correct?': '', 'Answered At': '', UID: '', 'Question ID': '' }]
  );
  answersSheet['!cols'] = [
    { wch: 10 }, { wch: 24 }, { wch: 18 }, { wch: 8 }, { wch: 14 }, { wch: 12 }, { wch: 22 }, { wch: 30 }, { wch: 22 },
  ];
  XLSX.utils.book_append_sheet(wb, answersSheet, 'Play-Along Answers');

  // -- Sheet 4: Leaderboard --------------------------------------------------
  // Aggregate latest answer per (uid, question), then rank by total correct.
  interface LbUser {
    uid: string;
    name: string;
    phone: string;
    answers: Record<string, { answer: string; timestamp: number }>;
  }
  const userMap = new Map<string, LbUser>();
  for (const [qNumStr, responses] of Object.entries(data.answers)) {
    if (!responses || typeof responses !== 'object') continue;
    for (const [uid, r] of Object.entries(responses)) {
      if (!userMap.has(uid)) {
        userMap.set(uid, { uid, name: r.name ?? uid, phone: r.phone ?? '', answers: {} });
      }
      const user = userMap.get(uid)!;
      const existing = user.answers[qNumStr];
      if (!existing || (r.timestamp ?? 0) > existing.timestamp) {
        user.answers[qNumStr] = { answer: r.answer ?? '', timestamp: r.timestamp ?? 0 };
        if (r.name) user.name = r.name;
        if (r.phone) user.phone = r.phone;
      }
    }
  }
  const correctCount = (u: LbUser) =>
    sortedQNums.filter((q) => {
      const correct = data.questionsMeta[String(q)]?.correctAnswer ?? null;
      return correct && u.answers[String(q)]?.answer === correct;
    }).length;

  const ranked = Array.from(userMap.values()).sort((a, b) => correctCount(b) - correctCount(a));
  const leaderboardRows = ranked.map((u, i) => {
    const row: Record<string, string | number> = {
      Rank: i + 1,
      Name: u.name,
      Phone: u.phone,
      'Correct Total': correctCount(u),
    };
    for (const q of sortedQNums) {
      row[`Q${q}`] = u.answers[String(q)]?.answer ?? '';
    }
    return row;
  });
  const leaderboardSheet = XLSX.utils.json_to_sheet(
    leaderboardRows.length ? leaderboardRows : [{ Rank: '', Name: '', Phone: '', 'Correct Total': '' }]
  );
  leaderboardSheet['!cols'] = [{ wch: 6 }, { wch: 24 }, { wch: 18 }, { wch: 14 }];
  XLSX.utils.book_append_sheet(wb, leaderboardSheet, 'Leaderboard');

  // -- Sheet 5: Questions Pool -----------------------------------------------
  const poolRows = data.questionsPool.map((q) => ({
    ID: q.id,
    Question: q.question,
    'Option A': q.option_a,
    'Option B': q.option_b,
    'Option C': q.option_c,
    'Option D': q.option_d,
    'Guest Answer': q.guest_answer,
  }));
  const poolSheet = XLSX.utils.json_to_sheet(
    poolRows.length
      ? poolRows
      : [{ ID: '', Question: '', 'Option A': '', 'Option B': '', 'Option C': '', 'Option D': '', 'Guest Answer': '' }]
  );
  poolSheet['!cols'] = [{ wch: 22 }, { wch: 50 }, { wch: 20 }, { wch: 20 }, { wch: 20 }, { wch: 20 }, { wch: 12 }];
  XLSX.utils.book_append_sheet(wb, poolSheet, 'Questions Pool');

  // -- Sheet 6: Question Meta (what play-along was graded against) -----------
  const metaRows = Object.keys(data.questionsMeta)
    .map(Number)
    .filter((n) => !isNaN(n))
    .sort((a, b) => a - b)
    .map((num) => ({
      'Question #': num,
      'Question Text': data.questionsMeta[String(num)]?.questionText ?? '',
      'Correct Answer': data.questionsMeta[String(num)]?.correctAnswer ?? '',
    }));
  const metaSheet = XLSX.utils.json_to_sheet(
    metaRows.length ? metaRows : [{ 'Question #': '', 'Question Text': '', 'Correct Answer': '' }]
  );
  metaSheet['!cols'] = [{ wch: 10 }, { wch: 50 }, { wch: 14 }];
  XLSX.utils.book_append_sheet(wb, metaSheet, 'Question Meta');

  return wb;
}

// ── 3. Orchestrator: gather → build → download single .xlsx ────────────────

function timestampedFilename(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `JMYIC-data-${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}.xlsx`;
}

export async function downloadGameData(): Promise<void> {
  const data = await gatherAllGameData();
  const wb = buildWorkbook(data);
  XLSX.writeFile(wb, timestampedFilename());
}
