import mongoose from 'mongoose';

const correctionSchema = new mongoose.Schema(
  {
    employee: { type: mongoose.Schema.Types.ObjectId, ref: 'Employee', required: true },
    attendance: { type: mongoose.Schema.Types.ObjectId, ref: 'Attendance', required: true },
    requestedCheckIn: { type: Date, default: null },
    requestedCheckOut: { type: Date, default: null },
    reason: { type: String, required: true, trim: true, maxlength: 500 },
    status: { type: String, enum: ['PENDING', 'APPROVED', 'REJECTED'], default: 'PENDING' },
    decidedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    decisionComment: { type: String, trim: true, maxlength: 500, default: '' },
  },
  { timestamps: true },
);

export const AttendanceCorrection = mongoose.model('AttendanceCorrection', correctionSchema);
