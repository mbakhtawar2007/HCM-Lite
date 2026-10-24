import express from 'express';
import { login, logout } from '../controllers/authController.js';
import { changePassword } from '../controllers/userController.js';
import { protect } from '../middleware/auth.js';
import { authLimiter } from '../middleware/rateLimit.js';
import { validate } from '../middleware/validate.js';
import { loginSchema } from '../validation/authValidation.js';
import { changePasswordSchema } from '../validation/p1Validation.js';

const router = express.Router();

// No /register route in P0/P1: accounts come from first-run setup,
// then from Admin/HR creation. Reintroducing it would break setup.
router.post('/login', authLimiter, validate(loginSchema), login);
router.post('/logout', protect, logout);
router.post('/change-password', protect, validate(changePasswordSchema), changePassword);

export default router;
