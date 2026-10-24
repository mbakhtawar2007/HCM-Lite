import mongoose from 'mongoose';

const lineSchema = new mongoose.Schema(
  {
    employee: { type: mongoose.Schema.Types.ObjectId, ref: 'Employee', required: true },
    basicSalary: { type: Number, required: true },
    grossSalary: { type: Number, required: true },
    hra: { type: Number, required: true },
    medical: { type: Number, required: true },
    workingDays: { type: Number, required: true },
    effectiveWorkingDays: { type: Number, required: true },
    presentDays: { type: Number, default: 0 },
    lateDays: { type: Number, default: 0 },
    halfDays: { type: Number, default: 0 },
    absentDays: { type: Number, default: 0 },
    unpaidLeaveDays: { type: Number, default: 0 },
    paidLeaveDays: { type: Number, default: 0 },
    deductionDays: { type: Number, default: 0 },
    grossPayable: { type: Number, required: true },
    tax: { type: Number, required: true },
    netPay: { type: Number, required: true },
  },
  { _id: false },
);

const payrollRunSchema = new mongoose.Schema(
  {
    month: { type: String, required: true, unique: true, match: /^\d{4}-\d{2}$/ }, // YYYY-MM
    status: { type: String, enum: ['DRAFT', 'FINALIZED'], default: 'DRAFT' },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    finalizedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    finalizedAt: { type: Date, default: null },
    lines: { type: [lineSchema], default: [] },
  },
  { timestamps: true },
);

export const PayrollRun = mongoose.model('PayrollRun', payrollRunSchema);
