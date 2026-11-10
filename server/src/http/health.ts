import { Router } from 'express';

/** Liveness endpoint for Railway health checks. */
export function healthRouter(getVersion: () => number, getSnapshots: () => string): Router {
  const router = Router();
  router.get('/healthz', (_req, res) => {
    // `snapshots` says whether a restart right now would come back with the show.
    res.json({ ok: true, version: getVersion(), uptime: process.uptime(), snapshots: getSnapshots() });
  });
  return router;
}
