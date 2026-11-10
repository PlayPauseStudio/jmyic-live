import type { Server, Socket, DefaultEventsMap } from 'socket.io';
import type { SocketData } from '../auth/socketAuth';

// Payloads are validated with zod at runtime; the meaningful generic here is
// SocketData, which carries the trusted role + uid stamped by the handshake.
export type AppServer = Server<DefaultEventsMap, DefaultEventsMap, DefaultEventsMap, SocketData>;
export type AppSocket = Socket<DefaultEventsMap, DefaultEventsMap, DefaultEventsMap, SocketData>;

/** The operator drives the show and exports data. */
export const ROOM_OPERATOR = 'room:operator';
/** The big screen — no guest answer before the reveal, no phone numbers. */
export const ROOM_DISPLAY = 'room:display';
/** Play-along phones — the question on screen and their own answers. */
export const ROOM_AUDIENCE = 'room:audience';
