import mongoose from 'mongoose';

const employeeSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, unique: true },
    employeeCode: { type: String, required: true, unique: true, trim: true, uppercase: true, maxlength: 30 },
    department: { type: mongoose.Schema.Types.ObjectId, ref: 'Department', required: true },
    designation: { type: mongoose.Schema.Types.ObjectId, ref: 'Designation', default: null },
    phone: { type: String, trim: true, maxlength: 30, default: '' },
    address: { type: String, trim: true, maxlength: 500, default: '' },
    joiningDate: { type: Date, required: true },
    leavingDate: { type: Date, default: null },
    // 100%-pass C: optional, never invented. Null = "Not specified".
    // Values are collected only when the employee (or HR) supplies them.
    gender: { type: String, enum: ['Male', 'Female', 'Other', 'Prefer not to say', null], default: null },
    // Explicit probation end date. Null = no probation period recorded.
    // An employee is "on probation" on a date iff probationEndDate >= that date.
    probationEndDate: { type: Date, default: null },
    basicSalary: { type: Number, required: true, min: 0 },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true },
);

export const Employee = mongoose.model('Employee', employeeSchema);
