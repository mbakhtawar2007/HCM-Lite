import app from './app.js';
import { connectDB } from './config/db.js';
import { env } from './config/env.js';

async function start() {
  // Fail fast with a clear message if MongoDB is unreachable, rather
  // than starting a server whose auth routes can never work.
  await connectDB();

  app.listen(env.port, () => {
    console.log(`API running on http://localhost:${env.port} (${env.nodeEnv})`);
  });
}

start().catch((error) => {
  console.error(error);
  process.exit(1);
});
