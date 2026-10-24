import { z } from 'zod';

export const setupSchema = z.object({
  companyName: z.string().trim().min(2, 'Company name must be at least 2 characters').max(100),
  adminName: z.string().trim().min(2, 'Admin name must be at least 2 characters').max(50),
  adminEmail: z.string().trim().toLowerCase().email('Please provide a valid email address'),
  adminPassword: z.string().min(8, 'Admin password must be at least 8 characters').max(128),
});
