/**
 * Wire protocol event names. The frontend mirrors these string constants in
 * web/src/lib/realtime.ts — change both together.
 */

// operator → server (require the operator role)
export const OP = {
  SET_FORMAT: 'op:setFormat',
  SELECT_QUESTION: 'op:selectQuestion',
  SUBMIT_PANEL_GUESS: 'op:submitPanelGuess',
  CHECK_PANEL_GUESS: 'op:checkPanelGuess',
  REVEAL_GUEST_ANSWER: 'op:revealGuestAnswer',
  PLACE_LOCK: 'op:placeLock',
  HIDE_OPTION: 'op:hideOption',
  REVEAL_OPTION: 'op:revealOption',
  UNREVEAL_OPTION: 'op:unrevealOption',
  REVEAL_ALL_OPTIONS: 'op:revealAllOptions',
  RESET_QUESTION: 'op:resetQuestion',
  START_ALL_OR_NOTHING: 'op:startAllOrNothing',
  REVEAL_AON_RESULT: 'op:revealAonResult',
  TOGGLE_AON_MODAL: 'op:toggleAonModal',
  TOGGLE_GUEST_VICTORY: 'op:toggleGuestVictory',
  TOGGLE_GUEST_LOST: 'op:toggleGuestLost',
  TRIGGER_GAME_OVER: 'op:triggerGameOver',
  SET_FLAGS: 'op:setFlags',
  TRIGGER_BUZZER: 'op:triggerBuzzer',
  REPLACE_QUESTIONS: 'op:replaceQuestions',
  EDIT_QUESTION: 'op:editQuestion',
  RESET_GAME: 'op:resetGame',
  RESET_EVERYTHING: 'op:resetEverything',
  /** Read-only: everything the Excel export needs, phone numbers included. */
  EXPORT_DATA: 'op:exportData',
  /** Read-only: live numbers for the operator's status strip. */
  STATUS: 'op:status',
} as const;

// audience (play-along phones) → server (require a verified Firebase uid)
export const AUD = {
  REGISTER: 'aud:register',
  ANSWER: 'aud:answer',
} as const;

// server → client
export const SRV = {
  STATE_FULL: 'state:full',
  STATE_PATCH: 'state:patch',
} as const;

export interface Ack {
  ok: boolean;
  error?: string;
  /** op:editQuestion — the edit flips a Classic round already scored. */
  classicNeedsReset?: boolean;
  /** op:exportData — the full data set. */
  data?: unknown;
  /** op:status — live server numbers. */
  status?: unknown;
}
