import { Router } from 'express';
import { monitorEventLoopDelay } from 'perf_hooks';

// How long work waited for the server's single thread. Under ~20 ms is idle;
// hundreds of ms means phones are queueing. Read it on /healthz during a show.
const loopDelay = monitorEventLoopDelay({ resolution: 10 });
loopDelay.enable();
let windowStart = Date.now();

/** Liveness endpoint for Railway health checks. */
export function healthRouter(getVersion: () => number, getSnapshots: () => string): Router {
  const router = Router();
  router.get('/healthz', (_req, res) => {
    const ms = (ns: number) => Math.round(ns / 1e6);
    const busy = {
      sinceSeconds: Math.round((Date.now() - windowStart) / 1000),
      p99Ms: ms(loopDelay.percentile(99)),
      maxMs: ms(loopDelay.max),
    };
    // Each read starts a fresh window, so the numbers cover "since the last check".
    loopDelay.reset();
    windowStart = Date.now();
    // `snapshots` says whether a restart right now would come back with the show.
    res.json({
      ok: true,
      version: getVersion(),
      uptime: process.uptime(),
      snapshots: getSnapshots(),
      memoryMb: Math.round(process.memoryUsage().rss / 1048576),
      eventLoopDelay: busy,
    });
  });
  return router;
}
