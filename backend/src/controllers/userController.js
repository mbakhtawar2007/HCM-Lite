import { asyncHandler } from '../utils/asyncHandler.js';
import { User } from '../models/User.js';

// GET /api/users/me — the logged-in user's profile (protect middleware
// already loaded req.user, so this is just a read-back).
export const getMe = asyncHandler(async (req, res) => {
  res.status(200).json({ success: true, user: req.user });
});

// GET /api/users — ADMIN only (see userRoutes.js). P0 list endpoint:
// it proves requireRole() is enforced server-side, and gives the Admin
// shell a real (possibly empty) user list. P1 extends it with
// create/deactivate/reset; passwords are never included (User.toJSON
// strips the hash, and the query does not select it).
export const getUsers = asyncHandler(async (_req, res) => {
  const users = await User.find().sort({ createdAt: 1 });
  res.status(200).json({ success: true, count: users.length, users });
});
