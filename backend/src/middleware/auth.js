import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';
import { User } from '../models/User.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { unauthorized } from '../utils/errors.js';

// Protect a route: requires `Authorization: Bearer <token>`.
// On success, req.user is the logged-in user (password never included).
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
  if (!user.isActive) throw unauthorized('Not authorized, account is deactivated');

  req.user = user;
  next();
});
