import rateLimit from 'express-rate-limit';

// Slows credential-stuffing on auth routes without affecting the rest of the API.
// 100 attempts per 15 minutes per IP is generous for a hackathon demo.
export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (_req, res) => {
    res.status(429).json({
      success: false,
      message: 'Too many requests, please try again in a few minutes',
    });
  },
});

// Phase 2 — generous global API limiter (1000 / 15 min per IP). The
// per-account DB lock in authController is the durable brute-force
// protection; this in-memory limiter is per-instance best effort on
// serverless (it resets per instance), so it is set high enough that
// legitimate use and the test suites (each well under 1000 requests
// per process) never hit it, while a runaway client is still capped.
export const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 1000,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (_req, res) => {
    res.status(429).json({
      success: false,
      message: 'Too many requests, please try again in a few minutes',
    });
  },
});
