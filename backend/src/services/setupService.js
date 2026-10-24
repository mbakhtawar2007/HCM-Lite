import { LeaveType, seedDefaultLeaveTypes } from '../models/LeaveType.js';
import { Setting } from '../models/Setting.js';
import { User } from '../models/User.js';

// Shared by POST /api/setup and env auto-seed. Returns null when setup
// already happened (a user exists) instead of creating a second admin.
// Callers must check the return value; this never logs any password.
export async function createFirstAdmin({ companyName, adminName, adminEmail, adminPassword }) {
  if (await User.countDocuments()) return null;

  let setting = await Setting.findOne();
  if (!setting) {
    setting = await Setting.create({ companyName });
  }
  await seedDefaultLeaveTypes();

  const user = await User.create({
    name: adminName,
    email: adminEmail,
    password: adminPassword,
    role: 'ADMIN',
    isActive: true,
    mustChangePassword: false,
  });
  return { user, setting };
}

export async function needsSetup() {
  return (await User.countDocuments()) === 0;
}

export async function getSetupState() {
  const setting = await Setting.findOne();
  const leaveTypes = await LeaveType.find().sort({ code: 1 });
  return { setting, leaveTypes };
}
