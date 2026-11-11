import { z } from 'zod';
import { destinationUrlSchema, httpDestinationAllowed } from './url.validation.js';

const hexColorSchema = z.string().regex(/^#[a-fA-F0-9]{6}$/);

function colorContrast(foreground, background) {
  function luminance(color) {
    const channels = color.slice(1).match(/.{2}/g).map((channel) => parseInt(channel, 16) / 255);
    const linear = channels.map((channel) => channel <= 0.04045
      ? channel / 12.92
      : ((channel + 0.055) / 1.055) ** 2.4);
    return 0.2126 * linear[0] + 0.7152 * linear[1] + 0.0722 * linear[2];
  }

  const values = [luminance(foreground), luminance(background)].sort((left, right) => right - left);
  return (values[0] + 0.05) / (values[1] + 0.05);
}

const qrFieldsSchema = z.object({
  documentId: z.string().regex(/^[a-f0-9]{24}$/i),
  name: z.string().trim().min(1).max(80),
  qrMode: z.enum(['direct', 'dynamic']).default('dynamic'),
  destinationType: z.enum(['document', 'external']).optional(),
  destinationUrl: destinationUrlSchema.optional(),
  allowHttp: z.boolean().default(false),
  expiresAt: z.preprocess((value) => value === '' ? undefined : value, z.coerce.date().nullable().optional()),
  foregroundColor: hexColorSchema.default('#163E2A'),
  backgroundColor: hexColorSchema.default('#FFFFFF'),
  errorCorrectionLevel: z.enum(['L', 'M', 'Q', 'H']).default('H'),
  size: z.coerce.number().int().min(128).max(1024).default(512),
});

function validateContrast(value, context) {
  const foreground = value.foregroundColor || '#163E2A';
  const background = value.backgroundColor || '#FFFFFF';
  if (colorContrast(foreground, background) < 4.5) {
    context.addIssue({
      code: 'custom',
      path: ['foregroundColor'],
      message: 'Choose colors with at least 4.5:1 contrast for reliable scanning.',
    });
  }
}

export const createQrSchema = qrFieldsSchema.superRefine((value, context) => {
  validateContrast(value, context);
  if (value.destinationType === 'external' && !value.destinationUrl) {
    context.addIssue({ code: 'custom', path: ['destinationUrl'], message: 'Enter an external destination URL.' });
  }
  if (value.destinationUrl && !httpDestinationAllowed(value.destinationUrl, value.allowHttp)) {
    context.addIssue({ code: 'custom', path: ['allowHttp'], message: 'Enable HTTP explicitly to use a non-encrypted destination.' });
  }
});

export const updateQrSchema = qrFieldsSchema
  .omit({ documentId: true })
  .partial()
  .superRefine((value, context) => {
    validateContrast(value, context);
    if (value.destinationType === 'external' && !value.destinationUrl) {
      context.addIssue({ code: 'custom', path: ['destinationUrl'], message: 'Enter an external destination URL.' });
    }
    if (value.destinationUrl && !httpDestinationAllowed(value.destinationUrl, value.allowHttp)) {
      context.addIssue({ code: 'custom', path: ['allowHttp'], message: 'Enable HTTP explicitly to use a non-encrypted destination.' });
    }
  });

export const changeDestinationSchema = z.object({
  documentId: z.string().regex(/^[a-f0-9]{24}$/i).optional(),
  destinationType: z.enum(['document', 'external']).optional(),
  destinationUrl: destinationUrlSchema.optional(),
  allowHttp: z.boolean().optional(),
  qrMode: z.enum(['direct', 'dynamic']).optional(),
  expiresAt: z.preprocess((value) => value === '' ? undefined : value, z.coerce.date().nullable().optional()),
}).refine((value) => Boolean(value.documentId) !== Boolean(value.destinationUrl), {
  message: 'Choose either a SmartQR document or an external destination URL.',
  path: ['destinationUrl'],
}).refine((value) => !value.destinationUrl || httpDestinationAllowed(value.destinationUrl, value.allowHttp), {
  message: 'Enable HTTP explicitly to use a non-encrypted destination.',
  path: ['allowHttp'],
});

export const qrDownloadSchema = z.enum(['png', 'svg', 'pdf']);