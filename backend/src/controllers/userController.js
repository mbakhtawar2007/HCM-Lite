import { asyncHandler } from '../utils/asyncHandler.js';
import { badRequest, conflict, forbidden, notFoundError } from '../utils/errors.js';
import { User } from '../models/User.js';
import { writeAudit } from '../services/attendanceService.js';

export const getMe = asyncHandler(async (req, res) => {
  res.status(200).json({ success: true, user: req.user });
});

export const getUsers = asyncHandler(async (_req, res) => {
  const users = await User.find().sort({ createdAt: 1 });
  res.status(200).json({ success: true, count: users.length, users });
});

// POST /api/users — ADMIN only. Creates a login with a temporary password;
// mustChangePassword forces a change on first sign-in. No public route
// exists for this (POST /api/auth/register stays 404).
export const createUser = asyncHandler(async (req, res) => {
  const { name, email, password, role } = req.body;
  if (await User.findOne({ email })) throw conflict('An account with this email already exists');
  const user = await User.create({ name, email, password, role, mustChangePassword: true });
  await writeAudit(req, 'CREATE', 'User', user._id, null, { name, email, role });
  res.status(201).json({ success: true, user });
});

export const updateUser = asyncHandler(async (req, res) => {
  const user = await User.findById(req.params.id);
  if (!user) throw notFoundError('User not found');
  if (String(user._id) === String(req.user._id) && req.body.isActive === false) {
    throw badRequest('You cannot deactivate your own account');
  }
  const before = user.toJSON();
  Object.assign(user, req.body);
  await user.save();
  await writeAudit(req, 'UPDATE', 'User', user._id, before, user.toJSON());
  res.status(200).json({ success: true, user });
});

export const resetUserPassword = asyncHandler(async (req, res) => {
  const user = await User.findById(req.params.id);
  if (!user) throw notFoundError('User not found');
  user.password = req.body.password;
  user.mustChangePassword = true;
  await user.save();
  await writeAudit(req, 'RESET_PASSWORD', 'User', user._id, null, { mustChangePassword: true });
  res.status(200).json({ success: true, message: 'Temporary password set; user must change it on next sign-in' });
});

export const getUserById = asyncHandler(async (req, res) => {
  const user = await User.findById(req.params.id);
  if (!user) throw notFoundError('User not found');
  res.status(200).json({ success: true, user });
});

// POST /api/auth/change-password — own account only.
export const changePassword = asyncHandler(async (req, res) => {
  const user = await User.findById(req.user._id).select('+password');
  if (!(await user.comparePassword(req.body.currentPassword))) {
    throw forbidden('Current password is incorrect');
  }
  user.password = req.body.newPassword;
  user.mustChangePassword = false;
  await user.save();
  // Never log password values: only the fact that the password changed.
  await writeAudit(req, 'UPDATE', 'User', user._id, { mustChangePassword: true }, { mustChangePassword: false });
  res.status(200).json({ success: true, message: 'Password changed' });
});
