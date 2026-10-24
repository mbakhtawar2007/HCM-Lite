import mongoose from 'mongoose';

const designationSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 100 },
    department: { type: mongoose.Schema.Types.ObjectId, ref: 'Department', default: null },
  },
  { timestamps: true },
);

designationSchema.index({ name: 1, department: 1 });

export const Designation = mongoose.model('Designation', designationSchema);
