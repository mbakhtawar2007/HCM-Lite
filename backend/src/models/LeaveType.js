import mongoose from 'mongoose';

// Leave types and yearly quotas (brief M2/M5). Defaults are seeded on
// first-run setup; UNPAID is unlimited, so its quota is 0 + isUnlimited.
const leaveTypeSchema = new mongoose.Schema(
  {
    code: {
      type: String,
      required: true,
      unique: true,
      uppercase: true,
      trim: true,
      maxlength: 20,
    },
    name: { type: String, required: true, trim: true, maxlength: 100 },
    yearlyQuota: { type: Number, default: 0, min: 0 },
    isUnlimited: { type: Boolean, default: false },
  },
  { timestamps: true },
);

export const LeaveType = mongoose.model('LeaveType', leaveTypeSchema);

export const DEFAULT_LEAVE_TYPES = [
  { code: 'ANNUAL', name: 'Annual Leave', yearlyQuota: 14, isUnlimited: false },
  { code: 'SICK', name: 'Sick Leave', yearlyQuota: 8, isUnlimited: false },
  { code: 'CASUAL', name: 'Casual Leave', yearlyQuota: 10, isUnlimited: false },
  { code: 'UNPAID', name: 'Unpaid Leave', yearlyQuota: 0, isUnlimited: true },
];

// Idempotent: only inserts codes that are not already present.
export async function seedDefaultLeaveTypes() {
  for (const lt of DEFAULT_LEAVE_TYPES) {
    await LeaveType.updateOne({ code: lt.code }, { $setOnInsert: lt }, { upsert: true });
  }
}
