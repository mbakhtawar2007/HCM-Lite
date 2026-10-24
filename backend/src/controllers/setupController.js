import { asyncHandler } from '../utils/asyncHandler.js';
import { forbidden } from '../utils/errors.js';
import { generateToken } from '../utils/generateToken.js';
import { createFirstAdmin, getSetupState, needsSetup } from '../services/setupService.js';

// GET /api/setup/status — public. Drives the frontend /setup page.
export const getSetupStatus = asyncHandler(async (_req, res) => {
  res.status(200).json({ success: true, needsSetup: await needsSetup() });
});

// POST /api/setup — public, but only until the first user exists.
// After that it is 403, so setup can never overwrite an existing company.
export const runSetup = asyncHandler(async (req, res) => {
  const { companyName, adminName, adminEmail, adminPassword } = req.body;
  const created = await createFirstAdmin({ companyName, adminName, adminEmail, adminPassword });
  if (!created) {
    throw forbidden('Setup has already been completed');
  }
  const { setting } = await getSetupState();
  res.status(201).json({
    success: true,
    token: generateToken(created.user._id),
    user: created.user,
    setting,
  });
});
