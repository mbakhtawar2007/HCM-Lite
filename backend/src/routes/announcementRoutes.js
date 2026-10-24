import express from 'express';
import { protect } from '../middleware/auth.js';
import { requireRole } from '../middleware/requireRole.js';
import { validate } from '../middleware/validate.js';
import { announcementSchema } from '../validation/p1Validation.js';
import { createAnnouncement, deleteAnnouncement, listAnnouncements } from '../controllers/announcementController.js';

const router = express.Router();
router.use(protect);

router.get('/', listAnnouncements);
router.post('/', requireRole('ADMIN', 'HR'), validate(announcementSchema), createAnnouncement);
router.delete('/:id', requireRole('ADMIN'), deleteAnnouncement);

export default router;
