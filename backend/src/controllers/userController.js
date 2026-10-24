import { asyncHandler } from '../utils/asyncHandler.js';

// GET /api/users/me — the logged-in user's profile (protect middleware
// already loaded req.user, so this is just a read-back).
export const getMe = asyncHandler(async (req, res) => {
  res.status(200).json({ success: true, user: req.user });
});
