import type { Server as HttpServer } from 'http';
import { Server } from 'socket.io';
import { env } from '../config/env';
import { logger } from '../util/logger';
import { TokenBucketLimiter } from '../util/rateLimit';
import { socketAuthMiddleware } from '../auth/socketAuth';
import type { RoomStore } from '../game/store';
import { Broadcaster } from './broadcast';
import { registerOperatorHandlers } from './handlers/operator';
import { registerAudienceHandlers } from './handlers/audience';
import { type AppServer, type AppSocket, ROOM_OPERATOR, ROOM_DISPLAY, ROOM_AUDIENCE } from './types';

export interface RealtimeServer {
  io: AppServer;
  broadcaster: Broadcaster;
}

const ROOM_FOR = {
  operator: ROOM_OPERATOR,
  display: ROOM_DISPLAY,
  audience: ROOM_AUDIENCE,
} as const;

export function createIo(httpServer: HttpServer, store: RoomStore): RealtimeServer {
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

  io.use(socketAuthMiddleware);

  io.on('connection', (socket: AppSocket) => {
    const { role } = socket.data;
    logger.info({ role, uid: socket.data.uid, id: socket.id }, 'socket connected');

    socket.join(ROOM_FOR[role]);

    // Register both handler sets on every socket. Each handler enforces its own
    // role guard and acks `forbidden` when the role is wrong — so a wrong-role
    // emit always gets a reply (never a silent hang) and never changes state.
    const ctx = { store, broadcaster };
    registerOperatorHandlers(socket, ctx);
    registerAudienceHandlers(socket, ctx, phoneLimiter);

    // Send current state immediately on join / reconnect.
    broadcaster.sendFullTo(socket);

    socket.on('disconnect', (reason) => {
      logger.debug({ role, id: socket.id, reason }, 'socket disconnected');
    });
  });

  return { io, broadcaster };
}
