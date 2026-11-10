import { z } from 'zod';
import { PLATFORMS } from './platforms.js';
import { RESERVED_SLUGS } from './util.js';
import { trackingIdsSchema } from './tracking.js';
import { passwordSchema } from './passwords.js';

const color = z.string().regex(/^#[0-9a-fA-F]{6}$/, 'Use a hex colour like #1a2b3c');

export const DEFAULT_THEME = {
  background: '#f4f1ea',
  background2: null, // set to a second colour for a gradient
  text: '#1c1c1c',
  button: '#1c1c1c',
  buttonText: '#ffffff',
  buttonStyle: 'rounded', // rounded | pill | square
  buttonVariant: 'solid', // solid | outline | soft
  font: 'sans', // sans | serif | rounded
};

export const themeSchema = z.object({
  background: color,
  background2: color.nullable(),
  text: color,
  button: color,
  buttonText: color,
  buttonStyle: z.enum(['rounded', 'pill', 'square']),
  buttonVariant: z.enum(['solid', 'outline', 'soft']),
  font: z.enum(['sans', 'serif', 'rounded']),
}).partial();

export function resolveTheme(stored) {
  const parsed = themeSchema.safeParse(stored);
  return { ...DEFAULT_THEME, ...(parsed.success ? parsed.data : {}) };
}

export const slugSchema = z
  .string()
  .trim()
  .toLowerCase()
  .min(2, 'URL must be at least 2 characters')
  .max(50, 'URL must be 50 characters or fewer')
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'Use lowercase letters, numbers and single dashes only')
  .refine((s) => !RESERVED_SLUGS.has(s), 'That URL is reserved');

const name = z.string().trim().min(1, 'Name is required').max(100);

export const businessCreateSchema = z.object({
  name,
  slug: slugSchema.optional(),
  tagline: z.string().trim().max(160).optional(),
  bio: z.string().trim().max(1000).optional(),
});

export const businessUpdateSchema = z.object({
  name,
  slug: slugSchema,
  tagline: z.string().trim().max(160),
  bio: z.string().trim().max(1000),
  theme: themeSchema,
  tracking: trackingIdsSchema,
  isActive: z.boolean(),
}).partial();

export const linkSchema = z.object({
  platform: z.enum(PLATFORMS),
  title: z.string().trim().min(1, 'Title is required').max(100),
  url: z.string(),
  display: z.enum(['button', 'icon']),
  isActive: z.boolean(),
});

export const linkCreateSchema = linkSchema.partial({ display: true, isActive: true });
export const linkUpdateSchema = linkSchema.partial();

// Length / size only. The "too easy to guess" checks need the account's name + email, so they run
// in the routes (assertStrongPassword).
export const password = passwordSchema;

const emailField = z.email('Enter a valid email address').max(200).transform((e) => e.trim().toLowerCase());

export const userCreateSchema = z.object({
  name,
  email: emailField,
  password,
  role: z.enum(['admin', 'member']).default('member'),
  businessIds: z.array(z.number().int().positive()).max(1000).optional(),
});

export const userUpdateSchema = z.object({
  name,
  email: emailField,
  password,
  role: z.enum(['admin', 'member']),
  isActive: z.boolean(),
  businessIds: z.array(z.number().int().positive()).max(1000),
  resetTwoFactor: z.boolean(), // lost phone: switch 2FA off so they can enrol again
}).partial();
