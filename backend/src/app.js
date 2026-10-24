import cors from 'cors';
import express from 'express';
import helmet from 'helmet';
import morgan from 'morgan';
import { env } from './config/env.js';
import { errorHandler, notFound } from './middleware/errorHandler.js';
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

app.use(helmet());
app.use(cors({ origin: env.clientUrls }));
app.use(express.json({ limit: '100kb' }));
if (env.nodeEnv !== 'test') app.use(morgan('dev'));

// No database needed — use this to check the server is up.
app.get('/api/health', (_req, res) => {
  res.status(200).json({ success: true, message: 'API is running' });
});

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
