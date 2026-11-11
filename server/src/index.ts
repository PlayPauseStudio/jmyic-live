import { createServer } from 'http';
import { env } from './config/env';
import { logger } from './util/logger';
import { initFirebaseAdmin } from './auth/firebaseAdmin';
import { RoomStore } from './game/store';
import { SnapshotStore } from './persistence/snapshot';
import { buildApp } from './app';
import { createIo } from './socket';
import { logSystem } from './game/episodeLog';

async function main(): Promise<void> {
  initFirebaseAdmin();

  const store = new RoomStore();

  // Restore prior game state (crash recovery) if a snapshot store is configured.
  const snapshots = new SnapshotStore();
  const restored = await snapshots.load();
  if (restored) store.restore(restored);
  logSystem(
    store.getState(),
    'Server started',
    restored ? 'Show restored from the Redis backup' : snapshots.enabled ? 'No saved show — started empty' : 'No Redis backup configured',
  );
  store.markChanged();

  let lastSavedAt: number | null = null;
  const onLogin = (ok: boolean): void => {
    logSystem(store.getState(), ok ? 'Operator signed in' : 'Wrong operator password');
    store.markChanged();
  };
  const app = buildApp(() => store.version, () => snapshots.status, onLogin);
  const httpServer = createServer(app);
  const { broadcaster } = createIo(httpServer, store, {
    snapshots: () => snapshots.status,
    lastSavedAt: () => lastSavedAt,
  });

  // Snapshot whenever the state has changed — skipped while nothing has. A
  // failed save is retried on the next tick rather than marked done.
  let savedVersion = store.version;
  let saving = false;
  const snapTimer = setInterval(() => {
    if (saving || store.version === savedVersion) return;
    const version = store.version;
    saving = true;
    void snapshots
      .save(store.snapshot())
      .then((ok) => {
        if (ok) {
          savedVersion = version;
          lastSavedAt = Date.now();
        }
      })
      .finally(() => {
        saving = false;
      });
  }, env.SNAPSHOT_INTERVAL_MS);
  snapTimer.unref?.();

  httpServer.listen(env.PORT, '0.0.0.0', () => {
    logger.info(
      {
        port: env.PORT,
        env: env.NODE_ENV,
        snapshots: snapshots.enabled ? 'redis' : 'disabled',
        displayKey: env.DISPLAY_KEY ? 'required' : 'open',
        origins: env.ALLOWED_ORIGINS,
      },
      'jmyic-server listening',
    );
  });

  // ── Graceful shutdown: snapshot once more, then close cleanly ──────────────
  let shuttingDown = false;
  const shutdown = async (signal: string): Promise<void> => {
    if (shuttingDown) return;
    shuttingDown = true;
    logger.info({ signal }, 'shutting down');
    clearInterval(snapTimer);
    broadcaster.stop();
    await snapshots.save(store.snapshot());
    await snapshots.close();
    httpServer.close(() => process.exit(0));
    setTimeout(() => process.exit(0), 5000).unref?.();
  };
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
  process.on('SIGINT', () => void shutdown('SIGINT'));
}

main().catch((e) => {
  logger.error({ err: e instanceof Error ? e.stack : e }, 'fatal boot error');
  process.exit(1);
});
