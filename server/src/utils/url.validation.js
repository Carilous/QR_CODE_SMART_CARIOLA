import { z } from 'zod';

const reservedSlugs = new Set([
  'admin', 'api', 'd', 'dashboard', 'documents', 'login', 'qr', 'r', 'register', 'view',
]);

export const slugSchema = z.string()
  .trim()
  .toLowerCase()
  .min(3)
  .max(64)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'Use lowercase letters, numbers, and single hyphens.')
  .refine((slug) => !reservedSlugs.has(slug), 'This slug is reserved.');

export const destinationUrlSchema = z.string()
  .trim()
  .max(2048, 'Destination URLs can be up to 2,048 characters.')
  .transform((value) => {
    let target = value.trim();
    if (target && !/^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//.test(target)) {
      target = `https://${target}`;
    }
    return target;
  })
  .refine((value) => {
    try {
      const url = new URL(value);
      return ['http:', 'https:'].includes(url.protocol) && !url.username && !url.password && Boolean(url.hostname);
    } catch {
      return false;
    }
  }, 'Enter a valid HTTPS or HTTP destination URL.')
  .transform((value) => new URL(value).toString());

const expiresAtSchema = z.preprocess(
  (value) => value === '' ? undefined : value,
  z.coerce.date().nullable().optional(),
);

export function httpDestinationAllowed(destinationUrl, allowHttp) {
  try {
    return new URL(destinationUrl).protocol !== 'http:' || allowHttp === true;
  } catch {
    return true;
  }
}

export const createUrlSchema = z.object({
  documentId: z.string().regex(/^[a-f0-9]{24}$/i).optional(),
  destinationUrl: destinationUrlSchema.optional(),
  allowHttp: z.boolean().default(false),
  slug: slugSchema,
  expiresAt: expiresAtSchema,
}).refine((input) => Boolean(input.documentId) !== Boolean(input.destinationUrl), {
  message: 'Choose either a document or an external destination URL.',
  path: ['destinationUrl'],
}).refine((input) => !input.destinationUrl || httpDestinationAllowed(input.destinationUrl, input.allowHttp), {
  message: 'Enable HTTP explicitly to use a non-encrypted destination.',
  path: ['allowHttp'],
});

export const updateUrlSchema = z.object({
  slug: slugSchema.optional(),
  documentId: z.string().regex(/^[a-f0-9]{24}$/i).optional(),
  destinationUrl: destinationUrlSchema.optional(),
  allowHttp: z.boolean().optional(),
  expiresAt: expiresAtSchema,
  isActive: z.boolean().optional(),
}).refine((input) => !(input.documentId && input.destinationUrl), {
  message: 'Choose either a document or an external destination URL.',
  path: ['destinationUrl'],
}).refine((input) => !input.destinationUrl || httpDestinationAllowed(input.destinationUrl, input.allowHttp), {
  message: 'Enable HTTP explicitly to use a non-encrypted destination.',
  path: ['allowHttp'],
});