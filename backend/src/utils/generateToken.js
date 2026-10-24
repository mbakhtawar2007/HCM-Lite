import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';

export function generateToken(userId, tokenVersion = 0) {
  return jwt.sign({ id: userId, tv: tokenVersion || 0 }, env.jwtSecret, { expiresIn: env.jwtExpiresIn });
}
