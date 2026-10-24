import { User } from '../models/User.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { ApiError, unauthorized } from '../utils/errors.js';
import { generateToken } from '../utils/generateToken.js';

// Phase 2 — per-account brute-force protection, read fresh on every
// request so tests can shorten the window without a restart:
//   LOGIN_MAX_FAILED_ATTEMPTS (default 5), LOGIN_LOCK_MS (default 15 min).
// The lock is time-based and self-clearing — no account (including
// Admin) is ever locked permanently. Unknown emails are throttled in
// memory with the same threshold, so a lock/429 response does not
// reveal whether an email is registered. The per-IP authLimiter (100
// requests / 15 min) remains as a second layer.
const lockConfig = () => ({
  max: Math.max(1, parseInt(process.env.LOGIN_MAX_FAILED_ATTEMPTS, 10) || 5),
  windowMs: Math.max(100, parseInt(process.env.LOGIN_LOCK_MS, 10) || 15 * 60 * 1000),
});
// email -> { count, lockUntil } for addresses with no User row.
const unknownAttempts = new Map();
const locked = () => {
  throw new ApiError(429, 'Too many failed login attempts. Please try again later.');
};

const authResponse = (res, user, statusCode) => {
  res.status(statusCode).json({
    success: true,
    token: generateToken(user._id, user.tokenVersion),
    user,
  });
};

// NOTE (P0): there is deliberately NO public self-registration endpoint.
// The first account is created only by POST /api/setup (or the optional
// ADMIN_EMAIL/ADMIN_PASSWORD env seed); later accounts are created by
// Admin/HR in P1. A public /register endpoint would let anyone create a
// user before first-run setup runs, which would permanently block setup
// (setup returns 403 once any user exists) and bypass role assignment.

// POST /api/auth/login
export const login = asyncHandler(async (req, res) => {
  const { email, password } = req.body;
  const { max, windowMs } = lockConfig();
  const now = Date.now();

  // Password is select: false, so ask for it explicitly here.
  const user = await User.findOne({ email }).select('+password +failedLoginAttempts +lockUntil +tokenVersion');

  // Locked accounts (and locked unknown emails) get the same 429.
  if (user && user.lockUntil && new Date(user.lockUntil).getTime() > now) locked();
  const unknown = unknownAttempts.get(email);
  if (!user && unknown && unknown.lockUntil > now) locked();

  const ok = user && (await user.comparePassword(password));
  if (!ok) {
    if (user) {
      user.failedLoginAttempts = (user.failedLoginAttempts || 0) + 1;
      if (user.failedLoginAttempts >= max) user.lockUntil = new Date(now + windowMs);
      await user.save();
      if (user.lockUntil && new Date(user.lockUntil).getTime() > now) locked();
    } else {
      const entry = unknown || { count: 0, lockUntil: 0 };
      entry.count += 1;
      if (entry.count >= max) entry.lockUntil = now + windowMs;
      unknownAttempts.set(email, entry);
      if (entry.lockUntil > now) locked();
    }
    // Same message for "no such user" and "wrong password": don't let an
    // attacker probe which emails are registered.
    throw unauthorized('Invalid email or password');
  }
  if (!user.isActive) throw unauthorized('Account is deactivated');

  // Success clears both trackers (and any expired lock).
  if (user.failedLoginAttempts || user.lockUntil) {
    user.failedLoginAttempts = 0;
    user.lockUntil = null;
    await user.save();
  }
  unknownAttempts.delete(email);

  authResponse(res, user, 200);
});

// POST /api/auth/logout — JWTs are stateless, so there is nothing to
// revoke server-side. The frontend logs out by deleting its stored token;
// this endpoint exists so the client has a symmetric logout call.
// Phase 2 note: logout does NOT invalidate a token on its own — a
// password change or reset does (tokenVersion bump, see User model).
// After a password change the frontend forces a fresh sign-in.
export const logout = asyncHandler(async (_req, res) => {
  res.status(200).json({ success: true, message: 'Logged out' });
});
