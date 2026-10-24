import { asyncHandler } from '../utils/asyncHandler.js';
import { notFoundError } from '../utils/errors.js';
import { AuditLog } from '../models/AuditLog.js';
import { Notification } from '../models/Notification.js';

export const listAuditLogs = asyncHandler(async (req, res) => {
  const page = Math.max(1, parseInt(req.query.page, 10) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 50));
  const filter = {};
  if (req.query.entity) filter.entity = req.query.entity;
  if (req.query.action) filter.action = req.query.action;
  const total = await AuditLog.countDocuments(filter);
  const logs = await AuditLog.find(filter).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit).populate('actor', 'name email role');
  res.status(200).json({ success: true, count: logs.length, total, page, pages: Math.ceil(total / limit), logs });
});

export const listNotifications = asyncHandler(async (req, res) => {
  const filter = { user: req.user._id };
  if (req.query.unread === 'true') filter.isRead = false;
  const notifications = await Notification.find(filter).sort({ createdAt: -1 }).limit(100);
  const unreadCount = await Notification.countDocuments({ user: req.user._id, isRead: false });
  res.status(200).json({ success: true, count: notifications.length, unreadCount, notifications });
});

export const markNotificationRead = asyncHandler(async (req, res) => {
  const note = await Notification.findOne({ _id: req.params.id, user: req.user._id });
  if (!note) throw notFoundError('Notification not found');
  note.isRead = true;
  await note.save();
  res.status(200).json({ success: true, notification: note });
});
