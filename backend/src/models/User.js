import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';

export const ROLES = ['ADMIN', 'HR', 'EMPLOYEE'];

const userSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 50 },
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
      match: [/^\S+@\S+\.\S+$/, 'Please provide a valid email address'],
    },
    // select: false keeps the hash out of query results by default.
    password: { type: String, required: true, minlength: 8, select: false },
    // HCM Lite role. Server-side requireRole() enforces this on every
    // route; hiding a menu item in the frontend is never a substitute.
    role: { type: String, enum: ROLES, default: 'EMPLOYEE', required: true },
    // Admin can deactivate a login (brief #05). Deactivated users cannot
    // log in and their existing tokens are rejected by protect().
    isActive: { type: Boolean, default: true },
    // True for logins created by HR/Admin with a temporary password.
    // P1 will force a password change on first sign-in when this is true.
    mustChangePassword: { type: Boolean, default: false },
    // Phase 2 — token versioning. Every JWT carries the version it was
    // issued at (generateToken); protect() rejects tokens whose version
    // no longer matches. A password change bumps this (see pre-save),
    // so old tokens stop working after a change or an admin reset —
    // logout alone cannot revoke a stateless JWT, but a password
    // change/reset can, and deactivation already blocks old tokens.
    tokenVersion: { type: Number, default: 0 },
    // Phase 2 — per-account brute-force state (see authController).
    // lockUntil is a self-clearing time lock, never permanent.
    failedLoginAttempts: { type: Number, default: 0 },
    lockUntil: { type: Date, default: null },
  },
  { timestamps: true },
);

// Hash only when the password itself changed (avoids double-hashing on updates).
userSchema.pre('save', async function hashPassword(next) {
  if (!this.isModified('password')) return next();
  // Phase 2: changing the password of an existing account invalidates
  // every token issued before the change (tokenVersion bump). New
  // accounts start at version 0, so their first token still matches.
  if (!this.isNew) this.tokenVersion = (this.tokenVersion || 0) + 1;
  this.password = await bcrypt.hash(this.password, 10);
  return next();
});

userSchema.methods.comparePassword = function comparePassword(candidate) {
  return bcrypt.compare(candidate, this.password);
};

// Never leak the hash in JSON responses, even if a query selects it.
// Internal security fields are stripped for the same reason.
userSchema.methods.toJSON = function toJSON() {
  const obj = this.toObject();
  delete obj.password;
  delete obj.tokenVersion;
  delete obj.failedLoginAttempts;
  delete obj.lockUntil;
  return obj;
};

export const User = mongoose.model('User', userSchema);
