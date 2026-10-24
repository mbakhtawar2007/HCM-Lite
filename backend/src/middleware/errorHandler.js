import { ApiError } from '../utils/errors.js';

// Any /api/* path with no matching route lands here as a 404.
export const notFound = (req, _res, next) => {
  next(new ApiError(404, `Route not found: ${req.method} ${req.originalUrl}`));
};

// Central error handler — must be the last middleware in app.js.
export const errorHandler = (err, _req, res, _next) => {
  let statusCode = err.statusCode || 500;
  let message = err.message || 'Server error';

  // Turn common Mongoose errors into clean client errors.
  if (err.name === 'CastError') {
    statusCode = 400;
    message = 'Invalid id format';
  }
  if (err.code === 11000) {
    statusCode = 409;
    const field = Object.keys(err.keyValue || {})[0] || 'field';
    message = `An account with this ${field} already exists`;
  }
  if (err.name === 'ValidationError') {
    statusCode = 400;
    message = Object.values(err.errors)
      .map((e) => e.message)
      .join(', ');
  }

  res.status(statusCode).json({
    success: false,
    message,
    // Stack traces only outside production — never leak internals live.
    ...(process.env.NODE_ENV !== 'production' && { stack: err.stack }),
  });
};
