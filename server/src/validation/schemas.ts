import { z } from 'zod';

/**
 * Zod schemas for every inbound payload. Handlers reject anything that fails to
 * parse (ack `bad_payload`). Sizes are bounded so a hostile client can't push a
 * multi-megabyte question pool into the show.
 */

export const operatorLoginSchema = z.object({
  password: z.string().min(1).max(200),
});

const option = z.enum(['A', 'B', 'C', 'D']);
const text = z.string().max(500);
const shortText = z.string().max(120);

export const formatSchema = z.object({ format: z.enum(['classic', 'oneShot']) });
export const questionRefSchema = z.object({ questionId: z.string().min(1).max(120) });
export const optionSchema = z.object({ option });
export const guessSchema = z.object({ guess: option });
export const lockSchema = z.object({ level: z.number().int().min(1).max(7) });

export const flagsSchema = z
  .object({
    showLogo: z.boolean().optional(),
    show75_25Banner: z.boolean().optional(),
    softEliminated: z.boolean().optional(),
    showLeaderboard: z.boolean().optional(),
    leaderboardScope: z.union([z.literal('all'), z.number().int().min(1).max(1000)]).optional(),
    leaderboardCorrectFilter: z.enum(['all', 'correct', 'incorrect']).optional(),
    leaderboardOrder: z.enum(['fastest', 'slowest']).optional(),
  })
  .strict()
  .refine((d) => Object.keys(d).length > 0, { message: 'empty_patch' });

const questionFields = {
  question: text,
  option_a: text,
  option_b: text,
  option_c: text,
  option_d: text,
  // A letter normally; older CSVs put the option's text here, which still works.
  guest_answer: text,
  contestant_name: shortText.optional(),
  prize: shortText.optional(),
};

export const replaceQuestionsSchema = z.object({
  questions: z.array(z.object(questionFields)).max(500),
});

export const editQuestionSchema = z.object({
  question: z.object({
    id: z.string().min(1).max(120),
    ...questionFields,
    question: text.refine((s) => s.trim().length > 0, 'required'),
    option_a: text.refine((s) => s.trim().length > 0, 'required'),
    option_b: text.refine((s) => s.trim().length > 0, 'required'),
    option_c: text.refine((s) => s.trim().length > 0, 'required'),
    option_d: text.refine((s) => s.trim().length > 0, 'required'),
    guest_answer: option,
  }),
});

export const rehearsalAddSchema = z.object({ count: z.number().int().min(1).max(2000) });
export const rehearsalAutoSchema = z.object({ on: z.boolean() });

// ── Phones ───────────────────────────────────────────────────────────────────

export const registerSchema = z.object({
  name: z
    .string()
    .transform((s) => s.trim())
    .pipe(z.string().min(1).max(60)),
  // A 10-digit Indian mobile, with or without +91 / 0 in front.
  phone: z
    .string()
    .max(20)
    .transform((s) => s.replace(/\D/g, '').replace(/^(91|0)(?=\d{10}$)/, ''))
    .pipe(z.string().regex(/^[6-9]\d{9}$/)),
});

export const answerSchema = z.object({ answer: option });
