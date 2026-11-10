import { Router } from 'express';
import { operatorLoginSchema } from '../validation/schemas';
import { checkOperatorPassword, signOperatorToken } from '../auth/operatorJwt';
import { TokenBucketLimiter } from '../util/rateLimit';
import { logger } from '../util/logger';

/**
 * POST /auth/operator/login { password } -> { token }
 * The operator password is verified server-side (bcrypt) and never leaves the
 * server. On success we mint a short-lived JWT used in the socket handshake.
 *
 * Attempts are rate limited per IP (burst of 5, then one every 6 seconds), so
 * the password can't be guessed by hammering the endpoint.
 */
export function operatorLoginRouter(): Router {
  const router = Router();
  const limiter = new TokenBucketLimiter(5, 1 / 6);
  const sweep = setInterval(() => limiter.sweep(), 60_000);
  sweep.unref?.();

  router.post('/auth/operator/login', async (req, res) => {
    if (!limiter.take(req.ip ?? 'unknown')) {
      logger.warn({ ip: req.ip }, 'Operator login rate limited');
      return res.status(429).json({ error: 'too_many_attempts' });
    }
    const parsed = operatorLoginSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'bad_request' });
    }
    const ok = await checkOperatorPassword(parsed.data.password);
    if (!ok) {
      logger.warn({ ip: req.ip }, 'Operator login failed');
      return res.status(401).json({ error: 'invalid_password' });
    }
    const token = await signOperatorToken();
    return res.json({ token });
  });
  return router;
}
