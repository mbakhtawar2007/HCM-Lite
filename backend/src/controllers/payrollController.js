import PDFDocument from 'pdfkit';
import { asyncHandler } from '../utils/asyncHandler.js';
import { conflict, forbidden, notFoundError } from '../utils/errors.js';
import { PayrollRun } from '../models/PayrollRun.js';
import { Employee } from '../models/Employee.js';
import { Holiday } from '../models/Holiday.js';
import { getSetting } from '../services/settingsService.js';
import { buildPayrollLine } from '../services/payrollService.js';
import { notifyUser, writeAudit } from '../services/attendanceService.js';
import { ownEmployee } from '../utils/scope.js';

const lockCheck = (run) => {
  if (run.status === 'FINALIZED') throw conflict('Finalized payroll runs are locked and cannot be changed');
};

export const createRun = asyncHandler(async (req, res) => {
  const [year, month] = req.body.month.split('-').map(Number);
  if (await PayrollRun.findOne({ month: req.body.month })) throw conflict('A payroll run already exists for this month');
  const setting = await getSetting();
  const holidays = await Holiday.find();
  const employees = await Employee.find({ isActive: true }).sort({ employeeCode: 1 });
  const lines = [];
  for (const emp of employees) {
    const line = await buildPayrollLine(emp, year, month, setting, holidays);
    // Phase 1 fix: an employee not employed at all in this month
    // (joined later / left earlier) had effectiveWorkingDays 0, so
    // grossPayable 0 minus tax on the full gross gave a NEGATIVE net.
    // Such employees simply get no line in this month's run.
    if (line.effectiveWorkingDays > 0) lines.push(line);
  }
  const run = await PayrollRun.create({ month: req.body.month, createdBy: req.user._id, lines });
  await writeAudit(req, 'CREATE', 'PayrollRun', run._id, null, { month: run.month, lines: lines.length });
  res.status(201).json({ success: true, run });
});

export const listRuns = asyncHandler(async (_req, res) => {
  const runs = await PayrollRun.find().sort({ month: -1 });
  res.status(200).json({ success: true, count: runs.length, runs });
});

export const getRun = asyncHandler(async (req, res) => {
  const run = await PayrollRun.findById(req.params.id).populate('lines.employee');
  if (!run) throw notFoundError('Payroll run not found');
  res.status(200).json({ success: true, run });
});

export const recomputeRun = asyncHandler(async (req, res) => {
  const run = await PayrollRun.findById(req.params.id);
  if (!run) throw notFoundError('Payroll run not found');
  lockCheck(run);
  const [year, month] = run.month.split('-').map(Number);
  const setting = await getSetting();
  const holidays = await Holiday.find();
  const employees = await Employee.find({ isActive: true }).sort({ employeeCode: 1 });
  const lines = [];
  for (const emp of employees) {
    const line = await buildPayrollLine(emp, year, month, setting, holidays);
    if (line.effectiveWorkingDays > 0) lines.push(line);
  }
  const beforeRecompute = run.toJSON();
  run.lines = lines;
  await run.save();
  await writeAudit(req, 'UPDATE', 'PayrollRun', run._id, beforeRecompute, run.toJSON());
  res.status(200).json({ success: true, run });
});

export const finalizeRun = asyncHandler(async (req, res) => {
  const run = await PayrollRun.findById(req.params.id);
  if (!run) throw notFoundError('Payroll run not found');
  lockCheck(run);
  const before = run.toJSON();
  run.status = 'FINALIZED';
  run.finalizedBy = req.user._id;
  run.finalizedAt = new Date();
  await run.save();
  await writeAudit(req, 'FINALIZE', 'PayrollRun', run._id, before, run.toJSON());
  for (const line of run.lines) {
    const emp = await Employee.findById(line.employee);
    if (emp) await notifyUser(emp.user, 'PAYSLIP_AVAILABLE', 'Payslip available',
      `Your payslip for ${run.month} is available. Net pay: Rs ${line.netPay}.`, run._id);
  }
  res.status(200).json({ success: true, run });
});

export const deleteRun = asyncHandler(async (req, res) => {
  const run = await PayrollRun.findById(req.params.id);
  if (!run) throw notFoundError('Payroll run not found');
  lockCheck(run);
  const beforeDelete = run.toJSON();
  await run.deleteOne();
  await writeAudit(req, 'DELETE', 'PayrollRun', run._id, beforeDelete, null);
  res.status(200).json({ success: true, message: 'Draft payroll run deleted' });
});

async function scopedLine(req, runId, employeeId) {
  const run = await PayrollRun.findById(runId).populate('lines.employee');
  if (!run) throw notFoundError('Payroll run not found');
  if (req.user.role === 'EMPLOYEE') {
    if (run.status !== 'FINALIZED') throw forbidden('Payslips are only available after finalization');
    const own = await ownEmployee(req.user._id);
    if (String(own._id) !== String(employeeId)) throw forbidden('You can only view your own payslip');
  }
  const line = run.lines.find((l) => String(l.employee._id || l.employee) === String(employeeId));
  if (!line) throw notFoundError('Payslip not found for this employee');
  return { run, line, employee: line.employee };
}

export const getPayslip = asyncHandler(async (req, res) => {
  const { run, line, employee } = await scopedLine(req, req.params.id, req.params.employeeId);
  res.status(200).json({ success: true, month: run.month, status: run.status, employee, payslip: line });
});

export const getPayslipPdf = asyncHandler(async (req, res) => {
  const { run, line, employee } = await scopedLine(req, req.params.id, req.params.employeeId);
  const setting = await getSetting();
  const doc = new PDFDocument();
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="payslip-${run.month}-${employee.employeeCode}.pdf"`);
  doc.pipe(res);
  doc.fontSize(18).text(setting.companyName, { align: 'center' });
  doc.fontSize(14).text(`Payslip — ${run.month}`, { align: 'center' });
  doc.moveDown();
  doc.fontSize(12).text(`Employee: ${employee.user?.name || ''} (${employee.employeeCode})`);
  doc.text(`Basic salary: Rs ${line.basicSalary}`);
  doc.text(`Gross salary (1.5 x basic): Rs ${line.grossSalary}  (HRA 40%: Rs ${line.hra}, Medical 10%: Rs ${line.medical})`);
  doc.text(`Working days: ${line.workingDays} · Effective: ${line.effectiveWorkingDays} · Present: ${line.presentDays} · Late: ${line.lateDays} · Half days: ${line.halfDays} · Absent: ${line.absentDays} · Unpaid leave: ${line.unpaidLeaveDays} · Paid leave: ${line.paidLeaveDays}`);
  doc.text(`Gross payable: Rs ${line.grossPayable}`);
  doc.text(`Tax: Rs ${line.tax}`);
  doc.fontSize(14).text(`Net pay: Rs ${line.netPay}`);
  doc.end();
});

export const myPayslips = asyncHandler(async (req, res) => {
  const own = await ownEmployee(req.user._id);
  const runs = await PayrollRun.find({ status: 'FINALIZED', 'lines.employee': own._id }).sort({ month: -1 });
  const payslips = runs.flatMap((r) => r.lines.filter((l) => String(l.employee) === String(own._id)).map((l) => ({ month: r.month, status: r.status, runId: r._id, ...l.toObject() })));
  res.status(200).json({ success: true, count: payslips.length, payslips });
});
