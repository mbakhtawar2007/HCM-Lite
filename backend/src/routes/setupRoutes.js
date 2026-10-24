import express from 'express';
import { getSetupStatus, runSetup } from '../controllers/setupController.js';
import { authLimiter } from '../middleware/rateLimit.js';
import { validate } from '../middleware/validate.js';
import { setupSchema } from '../validation/setupValidation.js';

const router = express.Router();

router.get('/status', getSetupStatus);
router.post('/', authLimiter, validate(setupSchema), runSetup);

export default router;
