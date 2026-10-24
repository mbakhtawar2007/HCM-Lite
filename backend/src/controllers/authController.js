import { User } from '../models/User.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { conflict, unauthorized } from '../utils/errors.js';
import { generateToken } from '../utils/generateToken.js';

const authResponse = (res, user, statusCode) => {
  res.status(statusCode).json({
    success: true,
    token: generateToken(user._id),
    user,
  });
};

// POST /api/auth/register
export const register = asyncHandler(async (req, res) => {
  const { name, email, password } = req.body;

  if (await User.findOne({ email })) {
    throw conflict('An account with this email already exists');
  }

  const user = await User.create({ name, email, password });
  authResponse(res, user, 201);
});

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

  authResponse(res, user, 200);
});

// POST /api/auth/logout — JWTs are stateless, so there is nothing to
// revoke server-side. The frontend logs out by deleting its stored token;
// this endpoint exists so the client has a symmetric logout call.
export const logout = asyncHandler(async (_req, res) => {
  res.status(200).json({ success: true, message: 'Logged out' });
});
