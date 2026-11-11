import { z } from 'zod';
import { destinationUrlSchema, httpDestinationAllowed } from './url.validation.js';

const tagsSchema = z.preprocess((value) => {
  if (typeof value === 'string') {
    return value.split(',').map((tag) => tag.trim()).filter(Boolean);
  }
  return value;
}, z.array(z.string().trim().min(1).max(32)).max(20));

const allowedEmailsSchema = z.preprocess((value) => {
  if (typeof value === 'string') {
    return value.split(',').map((email) => email.trim().toLowerCase()).filter(Boolean);
  }
  return value;
}, z.array(z.string().trim().toLowerCase().email().max(254)).max(100));

const booleanSchema = z.preprocess((value) => {
  if (value === 'true') return true;
  if (value === 'false') return false;
  return value;
}, z.boolean());

export const documentMetadataSchema = z.object({
  title: z.string().trim().min(1).max(160).optional(),
  description: z.string().trim().max(2000).optional(),
  category: z.string().trim().max(80).optional(),
  tags: tagsSchema.optional(),
  destinationType: z.enum(['document', 'external']).optional(),
  destinationUrl: z.preprocess((value) => value === '' || value === null ? undefined : value, destinationUrlSchema.optional()),
  allowHttp: booleanSchema.optional(),
  accessType: z.enum(['public', 'password', 'private', 'restricted']).optional(),
  password: z.string().min(12).max(128).optional(),
  allowedEmails: allowedEmailsSchema.optional(),
  allowDownload: booleanSchema.optional(),
  allowPrint: booleanSchema.optional(),
  expiresAt: z.preprocess((value) => value === '' ? undefined : value, z.coerce.date().nullable().optional()),
});

export const documentUploadSchema = documentMetadataSchema.refine(
  (metadata) => {
    if (metadata.destinationType !== 'external') return true;
    if (!metadata.destinationUrl) return false;
    return httpDestinationAllowed(metadata.destinationUrl, metadata.allowHttp);
  },
  { message: 'Enter an external destination URL and explicitly allow HTTP when used.', path: ['destinationUrl'] },
);

export const listDocumentsSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(25),
  search: z.string().trim().max(120).optional(),
  sort: z.enum(['newest', 'oldest', 'title']).default('newest'),
  destinationType: z.enum(['document', 'external']).optional(),
  qrMode: z.enum(['direct', 'dynamic']).optional(),
  validationStatus: z.enum(['not_checked', 'valid', 'reachable', 'inaccessible', 'timeout', 'inconclusive', 'invalid']).optional(),
});