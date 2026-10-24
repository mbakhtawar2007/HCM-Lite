// Vercel serverless entry point (deployment setup only, not a P0 feature).
// Vercel invokes this file for every request routed here by backend/vercel.json.
// It imports only app.js — never server.js — so no listener is started here.
// The database connection is established lazily and cached across warm
// invocations; mongoose.connect on an already-connected client is a no-op
// via the readyState check, and a failed attempt is not cached.
import mongoose from 'mongoose';
import app from '../src/app.js';
import { connectDB } from '../src/config/db.js';

let dbPromise = null;

async function ensureDB() {
  if (mongoose.connection.readyState === 1) return;
  if (!dbPromise) {
    dbPromise = connectDB().catch((error) => {
      dbPromise = null;
      throw error;
    });
  }
  await dbPromise;
}

export default async function handler(req, res) {
  try {
    await ensureDB();
  } catch {
    // Match the live deployment's behaviour: report the DB failure as
    // JSON instead of letting the function invocation itself fail, so
    // /api/health (and any other route) returns a readable 500.
    return res.status(500).json({ success: false, message: 'Database connection failed' });
  }
  return app(req, res);
}
