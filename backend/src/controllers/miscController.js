import mongoose from 'mongoose';
import { asyncHandler } from '../utils/asyncHandler.js';
import { forbidden, notFoundError } from '../utils/errors.js';
import { AuditLog } from '../models/AuditLog.js';
import { Notification } from '../models/Notification.js';
import { User } from '../models/User.js';
import { dayStart } from '../services/settingsService.js';

export const listAuditLogs = asyncHandler(async (req, res) => {
  const page = Math.max(1, parseInt(req.query.page, 10) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 50));
  const filter = {};
  if (req.query.entity) filter.entity = req.query.entity;
  if (req.query.action) filter.action = req.query.action;
  // actor: a user id, or an email (resolved to that user, if any).
  if (req.query.actor) {
    if (mongoose.Types.ObjectId.isValid(req.query.actor)) {
      filter.actor = req.query.actor;
    } else {
      const actorUser = await User.findOne({ email: String(req.query.actor).toLowerCase() });
      filter.actor = actorUser ? actorUser._id : new mongoose.Types.ObjectId('000000000000000000000000');
    }
  }
  // Date range on createdAt (YYYY-MM-DD, inclusive on both ends).
  if (req.query.from || req.query.to) {
    filter.createdAt = {};
    if (req.query.from && /^\d{4}-\d{2}-\d{2}$/.test(req.query.from)) filter.createdAt.$gte = dayStart(req.query.from);
    if (req.query.to && /^\d{4}-\d{2}-\d{2}$/.test(req.query.to)) {
      const end = dayStart(req.query.to);
      end.setUTCDate(end.getUTCDate() + 1);
      filter.createdAt.$lt = end;
    }
  }
  const total = await AuditLog.countDocuments(filter);
  const logs = await AuditLog.find(filter)
    .sort({ createdAt: -1 })
    .skip((page - 1) * limit)
    .limit(limit)
    .populate('actor', 'name email role');
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
  const note = await Notification.findById(req.params.id);
  if (!note) throw notFoundError('Notification not found');
  // Own only: another user's notification is a scope denial, not a 404.
  if (String(note.user) !== String(req.user._id)) throw forbidden('You can only mark your own notifications as read');
  note.isRead = true;
  await note.save();
  res.status(200).json({ success: true, notification: note });
});
