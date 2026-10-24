import cors from 'cors';
import express from 'express';
import helmet from 'helmet';
import morgan from 'morgan';
import { env } from './config/env.js';
import { errorHandler, notFound } from './middleware/errorHandler.js';
import { apiLimiter } from './middleware/rateLimit.js';
import aiRoutes from './routes/aiRoutes.js';
import announcementRoutes from './routes/announcementRoutes.js';
import authRoutes from './routes/authRoutes.js';
import attendanceRoutes from './routes/attendanceRoutes.js';
import dashboardRoutes from './routes/dashboardRoutes.js';
import employeeRoutes from './routes/employeeRoutes.js';
import leaveRoutes from './routes/leaveRoutes.js';
import miscRoutes from './routes/miscRoutes.js';
import orgRoutes from './routes/orgRoutes.js';
import payrollRoutes from './routes/payrollRoutes.js';
import setupRoutes from './routes/setupRoutes.js';
import userRoutes from './routes/userRoutes.js';

const app = express();

// Phase 2 — 'simple' query parser: Express's default 'extended' (qs)
// parser turns ?a[$gt]=b into a nested object, which a controller
// could then pass straight into a Mongo filter. With 'simple', such
// keys stay literal strings and are rejected by ID/date validation.
app.set('query parser', 'simple');

// Phase 2 — explicit CSP. Script/img/font stay 'self'-only; style
// allows 'unsafe-inline' because React sets some inline styles and
// the app's CSS is otherwise a single external file. connectSrc is
// deliberately relaxed to https:/ws:/wss: because the frontend and
// the API live on different free-host origins (Netlify vs Vercel) and
// the API origin is deployment-dependent — locking it to one origin
// here would break the deployed app. No inline scripts are used, so
// scriptSrc needs no 'unsafe-inline'.
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", 'data:'],
        fontSrc: ["'self'"],
        connectSrc: ["'self'", 'https:', 'ws:', 'wss:'],
        objectSrc: ["'none'"],
        frameAncestors: ["'none'"],
        baseUri: ["'self'"],
      },
    },
  }),
);
app.use(cors({ origin: env.clientUrls }));
app.use(express.json({ limit: '100kb' }));
app.use('/api', apiLimiter);
if (env.nodeEnv !== 'test') app.use(morgan('dev'));

// No database needed — use this to check the server is up.
app.get('/api/health', (_req, res) => {
  res.status(200).json({ success: true, message: 'API is running' });
});

app.use('/api/ai', aiRoutes);
app.use('/api/announcements', announcementRoutes);
app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/setup', setupRoutes);
app.use('/api/org', orgRoutes);
app.use('/api/employees', employeeRoutes);
app.use('/api/attendance', attendanceRoutes);
app.use('/api/leaves', leaveRoutes);
app.use('/api/payroll', payrollRoutes);
app.use('/api/dashboards', dashboardRoutes);
app.use('/api', miscRoutes);

// 404s, then the central error handler (order matters).
app.use(notFound);
app.use(errorHandler);

export default app;
