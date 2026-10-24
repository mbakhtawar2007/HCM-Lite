import mongoose from 'mongoose';

const attendanceSchema = new mongoose.Schema(
  {
    employee: { type: mongoose.Schema.Types.ObjectId, ref: 'Employee', required: true },
    date: { type: Date, required: true }, // day start (UTC midnight) of the attendance day
    checkIn: { type: Date, required: true },
    checkOut: { type: Date, default: null },
  },
  { timestamps: true },
);

attendanceSchema.index({ employee: 1, date: 1 }, { unique: true });
export const Attendance = mongoose.model('Attendance', attendanceSchema);
