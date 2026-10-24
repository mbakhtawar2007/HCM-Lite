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
  },
  { timestamps: true },
);

// Hash only when the password itself changed (avoids double-hashing on updates).
userSchema.pre('save', async function hashPassword(next) {
  if (!this.isModified('password')) return next();
  this.password = await bcrypt.hash(this.password, 10);
  return next();
});

userSchema.methods.comparePassword = function comparePassword(candidate) {
  return bcrypt.compare(candidate, this.password);
};

// Never leak the hash in JSON responses, even if a query selects it.
userSchema.methods.toJSON = function toJSON() {
  const obj = this.toObject();
  delete obj.password;
  return obj;
};

export const User = mongoose.model('User', userSchema);
