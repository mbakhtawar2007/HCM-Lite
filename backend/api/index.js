import app from '../src/app.js';
import { connectDB } from '../src/config/db.js';

// Vercel serverless entry point: @vercel/node invokes the exported
// handler for every request routed here by backend/vercel.json.
// The Express app itself never calls listen() here, and the MongoDB
// connection is established once and reused across warm invocations.
let dbPromise = null;

export default async function handler(req, res) {
  if (!dbPromise) {
    dbPromise = connectDB().catch((error) => {
      dbPromise = null;
      throw error;
    });
  }
  try {
    await dbPromise;
  } catch {
    return res.status(500).json({ success: false, message: 'Database connection failed' });
  }
  return app(req, res);
}
