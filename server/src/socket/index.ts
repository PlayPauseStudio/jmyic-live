import type { Server as HttpServer } from 'http';
import { Server } from 'socket.io';
import { env } from '../config/env';
import { logger } from '../util/logger';
import { TokenBucketLimiter } from '../util/rateLimit';
import { socketAuthMiddleware } from '../auth/socketAuth';
import type { RoomStore } from '../game/store';
import { Broadcaster } from './broadcast';
import { registerOperatorHandlers, type ServerInfo } from './handlers/operator';
import { FakePlayers } from '../game/rehearsal';
import { logSystem } from '../game/episodeLog';
import { registerAudienceHandlers } from './handlers/audience';
import { type AppServer, type AppSocket, ROOM_OPERATOR, ROOM_DISPLAY, ROOM_AUDIENCE } from './types';

export interface RealtimeServer {
  io: AppServer;
  broadcaster: Broadcaster;
  fakePlayers: FakePlayers;
}

/** What the server's boot code knows that the status strip shows. */
export interface ServerFacts {
  snapshots(): string;
  lastSavedAt(): number | null;
}

const ROLE_NAME = { operator: 'Operator panel', display: 'Big screen' } as const;

/** Socket.IO disconnect reasons in plain words, for the episode log. */
const REASON_TEXT: Record<string, string> = {
  'client namespace disconnect': 'tab closed or refreshed',
  'transport close': 'connection dropped',
  'transport error': 'network error',
  'ping timeout': 'stopped responding — network or sleeping device',
  'server namespace disconnect': 'disconnected by the server',
  'server shutting down': 'server restarting',
};

const ROOM_FOR = {
  operator: ROOM_OPERATOR,
  display: ROOM_DISPLAY,
  audience: ROOM_AUDIENCE,
} as const;

export function createIo(httpServer: HttpServer, store: RoomStore, facts: ServerFacts): RealtimeServer {
  const io: AppServer = new Server(httpServer, {
    cors: { origin: env.ALLOWED_ORIGINS, credentials: true },
    // Liveness: drop dead phones promptly on flaky venue Wi-Fi.
    pingInterval: 20_000,
    pingTimeout: 20_000,
    // Question-pool uploads ride inside op:replaceQuestions.
    maxHttpBufferSize: 2_000_000,
  });

  // Phone rate limiter: burst of 5, refilling ~2/sec per uid.
  const phoneLimiter = new TokenBucketLimiter(5, 2);
  const sweep = setInterval(() => phoneLimiter.sweep(), 60_000);
  sweep.unref?.();

  const broadcaster = new Broadcaster(io, store);
  broadcaster.start();
  const fakePlayers = new FakePlayers(store, broadcaster);
  fakePlayers.start();

  const roomSize = (room: string): number => io.sockets.adapter.rooms.get(room)?.size ?? 0;
  const info: ServerInfo = {
    online: () => ({ operators: roomSize(ROOM_OPERATOR), bigScreens: roomSize(ROOM_DISPLAY), phones: roomSize(ROOM_AUDIENCE) }),
    snapshots: facts.snapshots,
    lastSavedAt: facts.lastSavedAt,
  };

  // Operator panels and big screens joining and dropping go in the episode log
  // (phones don't — a thousand of them would bury everything else).
  const logPresence = (role: keyof typeof ROLE_NAME, joined: boolean, reason?: string): void => {
    const room = role === 'operator' ? ROOM_OPERATOR : ROOM_DISPLAY;
    const open = roomSize(room);
    const what = joined ? 'connected' : 'disconnected';
    logSystem(store.getState(), `${ROLE_NAME[role]} ${what}`, `${open} open now${reason ? ` (${reason})` : ''}`);
    store.markChanged();
  };

  io.use(socketAuthMiddleware);

  io.on('connection', (socket: AppSocket) => {
    const { role } = socket.data;
    logger.info({ role, uid: socket.data.uid, id: socket.id }, 'socket connected');

    socket.join(ROOM_FOR[role]);
    if (role !== 'audience') logPresence(role, true);

    // Register both handler sets on every socket. Each handler enforces its own
    // role guard and acks `forbidden` when the role is wrong — so a wrong-role
    // emit always gets a reply (never a silent hang) and never changes state.
    const ctx = { store, broadcaster, info };
    registerOperatorHandlers(socket, ctx);
    registerAudienceHandlers(socket, ctx, phoneLimiter);

    // Send current state immediately on join / reconnect.
    broadcaster.sendFullTo(socket);

    socket.on('disconnect', (reason) => {
      logger.debug({ role, id: socket.id, reason }, 'socket disconnected');
      if (role !== 'audience') logPresence(role, false, REASON_TEXT[reason] ?? reason);
    });
  });

  return { io, broadcaster, fakePlayers };
}
