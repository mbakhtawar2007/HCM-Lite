import mongoose from 'mongoose';

const attendanceSchema = new mongoose.Schema(
  {
    employee: { type: mongoose.Schema.Types.ObjectId, ref: 'Employee', required: true },
    date: { type: Date, required: true }, // day start (UTC midnight) of the attendance day
    checkIn: { type: Date, required: true },
    checkOut: { type: Date, default: null },
    // Camera check-in source. 'web' is the default normal check-in;
    // 'camera' is only set by the camera check-in route after a face
    // was detected and the server geofence/accuracy checks passed.
    // No photo is stored — only the source and the result.
    source: { type: String, enum: ['web', 'camera'], default: 'web' },
  },
  { timestamps: true },
);

attendanceSchema.index({ employee: 1, date: 1 }, { unique: true });
export const Attendance = mongoose.model('Attendance', attendanceSchema);
