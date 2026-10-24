import app from './app.js';
import { connectDB } from './config/db.js';
import { env } from './config/env.js';
import { createFirstAdmin } from './services/setupService.js';

async function start() {
  // Fail fast with a clear message if MongoDB is unreachable, rather
  // than starting a server whose auth routes can never work.
  await connectDB();

  // Env auto-seed (brief: first run may read ADMIN_EMAIL / ADMIN_PASSWORD).
  // Only runs when no user exists; never logs the password.
  if (env.adminEmail && env.adminPassword) {
    try {
      const created = await createFirstAdmin({
        companyName: env.companyName,
        adminName: env.adminName,
        adminEmail: env.adminEmail,
        adminPassword: env.adminPassword,
      });
      if (created) console.log('Admin auto-seeded from environment (company setup complete)');
    } catch (error) {
      console.warn('[warn] Admin auto-seed failed:', error.message);
    }
  }

  app.listen(env.port, () => {
    console.log(`API running on http://localhost:${env.port} (${env.nodeEnv})`);
  });
}

start().catch((error) => {
  console.error(error);
  process.exit(1);
});
