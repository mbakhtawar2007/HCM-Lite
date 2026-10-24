import express from 'express';
import { getMe } from '../controllers/userController.js';
import { protect } from '../middleware/auth.js';

const router = express.Router();

// Everything under /api/users requires a valid token.
router.use(protect);

router.get('/me', getMe);

export default router;
