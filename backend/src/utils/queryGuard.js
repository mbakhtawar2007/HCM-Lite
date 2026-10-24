import mongoose from 'mongoose';
import { badRequest } from './errors.js';

// Phase 2 — query-string guards. Query params are never passed raw
// into Mongo filters: IDs must be valid ObjectIds and dates must be
// YYYY-MM-DD, otherwise 400. Combined with the 'simple' query parser
// in app.js, an operator-shaped query (employeeId[$ne]=x) can no
// longer reach Mongoose as an operator.
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export const assertObjectIdQuery = (value, name) => {
  if (value && !mongoose.Types.ObjectId.isValid(value)) throw badRequest(`${name} must be a valid id`);
};

export const assertDateQuery = (value, name) => {
  if (value && !DATE_RE.test(value)) throw badRequest(`${name} must be YYYY-MM-DD`);
};

export const assertEnumQuery = (value, allowed, name) => {
  if (value && !allowed.includes(value)) throw badRequest(`${name} must be one of: ${allowed.join(', ')}`);
};
