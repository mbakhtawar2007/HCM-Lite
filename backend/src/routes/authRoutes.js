import express from 'express';
import { login, logout } from '../controllers/authController.js';
import { protect } from '../middleware/auth.js';
import { authLimiter } from '../middleware/rateLimit.js';
import { validate } from '../middleware/validate.js';
import { loginSchema } from '../validation/authValidation.js';

const router = express.Router();

// No /register route in P0 (see authController.js): accounts come from
// first-run setup, then from Admin/HR creation in P1.
router.post('/login', authLimiter, validate(loginSchema), login);
router.post('/logout', protect, logout);

export default router;
