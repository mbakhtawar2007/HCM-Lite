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
