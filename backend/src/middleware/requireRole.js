import { forbidden } from '../utils/errors.js';

// Server-side role guard — use after protect() on every role-restricted
// route. Example: router.get('/admin', protect, requireRole('ADMIN'), ...)
// The frontend menu is only a convenience; this is the actual enforcement.
export const requireRole =
  (...roles) =>
  (req, _res, next) => {
    if (!req.user) {
      return next(forbidden('Not authorized'));
    }
    if (!roles.includes(req.user.role)) {
      return next(forbidden(`Requires role: ${roles.join(' or ')}`));
    }
    return next();
  };
