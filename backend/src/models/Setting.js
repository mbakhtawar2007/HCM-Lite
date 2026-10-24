import mongoose from 'mongoose';

// Company-level settings (brief M2). There is exactly one Setting row,
// created by first-run setup. Rules stored here — not hard-coded in
// controllers — decide attendance/leave behaviour for new records.
const settingSchema = new mongoose.Schema(
  {
    companyName: { type: String, required: true, trim: true, maxlength: 100 },
    // Office start as minutes after midnight: 540 = 09:00.
    officeStartMinutes: { type: Number, default: 540, min: 0, max: 1439 },
    graceMinutes: { type: Number, default: 15, min: 0 },
    // Weekend day codes, e.g. ['Sat', 'Sun'] per the brief.
    weekendDays: { type: [String], default: ['Sat', 'Sun'] },
    // Office geofence for camera attendance (P6 bonus). Null until Admin sets it.
    officeLat: { type: Number, default: null, min: -90, max: 90 },
    officeLng: { type: Number, default: null, min: -180, max: 180 },
    officeRadiusMeters: { type: Number, default: 150, min: 0 },
  },
  { timestamps: true },
);

export const Setting = mongoose.model('Setting', settingSchema);
