import mongoose from 'mongoose';

// Announcements are posted by Admin/HR and read by all roles. There is
// no update route: an announcement is either active (listed) or deleted.
const announcementSchema = new mongoose.Schema(
  {
    title: { type: String, required: true, trim: true, maxlength: 200 },
    body: { type: String, required: true, trim: true, maxlength: 5000 },
    postedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true },
);

export const Announcement = mongoose.model('Announcement', announcementSchema);
