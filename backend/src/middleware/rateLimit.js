import redis from '../config/redis.js';

// Guards the endpoints where guessing pays off: password login, and the ones
// that send email (so nobody can use us to spam an address). Counters live in
// Redis, which is already required to boot, so limits hold across restarts and
// across processes if the app is ever scaled out.
function getClientKey(req) {
  // Behind nginx the socket address is always the proxy, so prefer the
  // forwarded address; fall back to the socket for direct calls.
  const forwarded = req.get('x-forwarded-for');
  const ip = forwarded ? forwarded.split(',')[0].trim() : req.socket.remoteAddress;
  return ip || 'unknown';
}

export function rateLimit({ name, limit, windowSeconds, keyFromBody }) {
  return async (req, res, next) => {
    try {
      // Limiting per identifier as well as per IP: one address behind a shared
      // office IP should not be able to lock everyone out, and an attacker
      // rotating IPs should still be slowed on a single account.
      const identifier = keyFromBody ? String(keyFromBody(req) || '').toLowerCase().slice(0, 120) : '';
      const keys = [`rl:${name}:ip:${getClientKey(req)}`];
      if (identifier) {
        keys.push(`rl:${name}:id:${identifier}`);
      }

      for (const key of keys) {
        const hits = await redis.incr(key);
        if (hits === 1) {
          await redis.expire(key, windowSeconds);
        }

        if (hits > limit) {
          const retryAfter = await redis.ttl(key);
          res.set('Retry-After', String(Math.max(retryAfter, 1)));
          res.status(429).json({
            error: 'Bạn đã thử quá nhiều lần. Vui lòng đợi ít phút rồi thử lại.',
          });
          return;
        }
      }

      next();
    } catch (err) {
      // A rate limiter that fails closed would take the whole login flow down
      // with Redis. Log and let the request through — the endpoints behind it
      // are still authenticated and validated.
      console.warn('Rate limit check failed, allowing request:', err.message);
      next();
    }
  };
}
