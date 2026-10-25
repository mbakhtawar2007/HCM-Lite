import { asyncHandler } from '../utils/asyncHandler.js';
import { notFoundError } from '../utils/errors.js';
import { Announcement } from '../models/Announcement.js';
import { writeAudit } from '../services/attendanceService.js';

export const listAnnouncements = asyncHandler(async (_req, res) => {
  const announcements = await Announcement.find({ isActive: true })
    .sort({ createdAt: -1 })
    .limit(50)
    .populate('postedBy', 'name email role');
  res.status(200).json({ success: true, count: announcements.length, announcements });
});

export const createAnnouncement = asyncHandler(async (req, res) => {
  const announcement = await Announcement.create({
    title: req.body.title,
    body: req.body.body,
    postedBy: req.user._id,
    isActive: true,
  });
  await writeAudit(req, 'CREATE', 'Announcement', announcement._id, null, {
    title: announcement.title,
    body: announcement.body,
  });
  res.status(201).json({ success: true, announcement });
});

export const deleteAnnouncement = asyncHandler(async (req, res) => {
  const announcement = await Announcement.findById(req.params.id);
  if (!announcement) throw notFoundError('Announcement not found');
  const before = announcement.toJSON();
  await announcement.deleteOne();
  await writeAudit(req, 'DELETE', 'Announcement', announcement._id, before, null);
  res.status(200).json({ success: true, message: 'Announcement deleted' });
});
