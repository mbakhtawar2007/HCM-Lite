import express from 'express';
import { getMe, getUsers } from '../controllers/userController.js';
import { protect } from '../middleware/auth.js';
import { requireRole } from '../middleware/requireRole.js';

const router = express.Router();

// Everything under /api/users requires a valid token.
router.use(protect);

router.get('/me', getMe);
// Admin-only: a non-admin token gets 403 here (verified in P0 checks).
router.get('/', requireRole('ADMIN'), getUsers);

export default router;
