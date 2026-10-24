import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';
import { User } from '../models/User.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { forbidden, unauthorized } from '../utils/errors.js';

// Routes a must-change-password user may still call: the change itself,
// logout (so they can abandon the session), and /users/me (so the UI
// can display the forced-change screen). Everything else is 403.
const MUST_CHANGE_EXEMPT = new Set([
  '/api/auth/change-password',
  '/api/auth/logout',
  '/api/users/me',
]);

// Protect a route: requires `Authorization: Bearer <token>`.
// On success, req.user is the logged-in user (password never included).
// Phase 2 checks, in order: token validity, token version (old tokens
// die on password change/reset), deactivation, then must-change-password.
export const protect = asyncHandler(async (req, _res, next) => {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;

  if (!token) throw unauthorized('Not authorized, no token provided');

  let decoded;
  try {
    decoded = jwt.verify(token, env.jwtSecret);
  } catch {
    throw unauthorized('Not authorized, token is invalid or expired');
  }

  const user = await User.findById(decoded.id);
  if (!user) throw unauthorized('Not authorized, user no longer exists');
  // Tokens issued before token versioning carry no tv (= 0); any bump
  // since then invalidates them. Tokens issued after a password change
  // carry the new version and pass.
  const tokenVersion = decoded.tv === undefined ? 0 : decoded.tv;
  if (tokenVersion !== (user.tokenVersion || 0)) {
    throw unauthorized('Not authorized, please sign in again');
  }
  if (!user.isActive) throw unauthorized('Not authorized, account is deactivated');

  const path = (req.originalUrl || '').split('?')[0];
  if (user.mustChangePassword && !MUST_CHANGE_EXEMPT.has(path)) {
    throw forbidden('Password change required. Please change your temporary password before continuing.');
  }

  req.user = user;
  next();
});
