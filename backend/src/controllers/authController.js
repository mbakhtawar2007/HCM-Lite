import { User } from '../models/User.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { unauthorized } from '../utils/errors.js';
import { generateToken } from '../utils/generateToken.js';

const authResponse = (res, user, statusCode) => {
  res.status(statusCode).json({
    success: true,
    token: generateToken(user._id),
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

  // Password is select: false, so ask for it explicitly here.
  const user = await User.findOne({ email }).select('+password');
  // Same message for "no such user" and "wrong password": don't let an
  // attacker probe which emails are registered.
  if (!user || !(await user.comparePassword(password))) {
    throw unauthorized('Invalid email or password');
  }
  if (!user.isActive) throw unauthorized('Account is deactivated');

  authResponse(res, user, 200);
});

// POST /api/auth/logout — JWTs are stateless, so there is nothing to
// revoke server-side. The frontend logs out by deleting its stored token;
// this endpoint exists so the client has a symmetric logout call.
export const logout = asyncHandler(async (_req, res) => {
  res.status(200).json({ success: true, message: 'Logged out' });
});
