import express from 'express';
import { createUser, getMe, getUserById, getUsers, resetUserPassword, updateUser } from '../controllers/userController.js';
import { protect } from '../middleware/auth.js';
import { requireRole } from '../middleware/requireRole.js';
import { validate } from '../middleware/validate.js';
import { createUserSchema, resetPasswordSchema, updateUserSchema } from '../validation/p1Validation.js';

const router = express.Router();

// Everything under /api/users requires a valid token.
router.use(protect);

router.get('/me', getMe);
// Admin-only list (P0 behaviour preserved).
router.get('/', requireRole('ADMIN'), getUsers);
router.post('/', requireRole('ADMIN'), validate(createUserSchema), createUser);
router.get('/:id', requireRole('ADMIN'), getUserById);
router.patch('/:id', requireRole('ADMIN'), validate(updateUserSchema), updateUser);
router.post('/:id/reset-password', requireRole('ADMIN'), validate(resetPasswordSchema), resetUserPassword);

export default router;
