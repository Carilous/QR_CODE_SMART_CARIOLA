import bcrypt from 'bcryptjs';
import { pipeline } from 'node:stream/promises';
import { createDocumentAccessToken, verifyDocumentAccessToken } from '../utils/auth.token.js';
import { z } from 'zod';
import { openDocument } from '../services/documentStorage.js';
import QRCode from '../models/QRCode.js';
import { slugSchema } from '../utils/url.validation.js';
import CustomUrl from '../models/CustomUrl.js';
import { recordVisit } from '../services/scanTracking.js';

const passwordGrantSchema = z.object({ password: z.string().min(1).max(128) });
const documentAccessCookie = (documentId) => `smartqr_access_${documentId}`;

function publicAppUrl(path) {
  const appUrl = process.env.PUBLIC_APP_URL || process.env.CLIENT_URL || 'http://localhost:5173';
  return new URL(path, appUrl).toString();
}

function unavailable(response) {
  return response.status(410).set('Cache-Control', 'no-store').json({ error: 'This link is unavailable.' });
}

async function findQr(uniqueCode) {
  return QRCode.findOne({ uniqueCode })
    .populate({ path: 'document', select: '+passwordHash +storageKey' });
}

async function findSlug(slug) {
  return CustomUrl.findOne({ slug, isActive: true })
    .populate({ path: 'document', select: '+passwordHash +storageKey' });
}

function isOwnerOrAdmin(request, document) {
  if (!request.user) return false;
  return request.user.role === 'super_admin'
    || request.user.role === 'admin'
    || document.owner?.equals(request.user._id);
}

function hasPasswordGrant(request, document) {
  const token = request.cookies?.[documentAccessCookie(document.id)];
  return Boolean(token && verifyDocumentAccessToken(token, document));
}

function hasAccess(request, document) {
  if (isOwnerOrAdmin(request, document)) return true;
  if (document.accessType === 'public') return true;
  if (document.accessType === 'password') return hasPasswordGrant(request, document);
  if (document.accessType === 'restricted') {
    return Boolean(request.user && document.allowedEmails.includes(request.user.email));
  }
  return false;
}

function accessDenied(response, document, request) {
  if (document.accessType === 'password') {
    return response.status(401).json({
      error: 'Password required.',
      requiresPassword: true,
      document: { title: document.title, accessType: document.accessType },
    });
  }
  if (!request.user) {
    return response.status(401).json({ error: 'Sign in with an authorized account to view this document.' });
  }
  return response.status(403).json({ error: 'This document is restricted to authorized users.' });
}

function viewerDocument(document) {
  return {
    id: document.id,
    title: document.title,
    description: document.description,
    originalFileName: document.originalFileName,
    mimeType: document.mimeType,
    fileSize: document.fileSize,
    version: document.version,
    accessType: document.accessType,
    expiresAt: document.expiresAt,
    allowDownload: document.allowDownload,
    allowPrint: document.allowPrint,
  };
}

function documentUnavailable(document) {
  return !document || !document.isActive || document.archivedAt;
}

async function streamDocument(request, response, next, document) {
  if (documentUnavailable(document)) return unavailable(response);
  if (!hasAccess(request, document)) return accessDenied(response, document, request);

  const download = request.query.download === '1';
  if (download && !document.allowDownload) {
    return response.status(403).json({ error: 'Downloads are not enabled for this document.' });
  }

  try {
    const stream = await openDocument(document.storageKey);
    const disposition = download ? 'attachment' : 'inline';
    const fileName = document.originalFileName.replace(/[\r\n"\\/]/g, '_').slice(0, 255);
    response.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': `${disposition}; filename="${fileName}"`,
      'Content-Length': String(document.fileSize),
      'Cache-Control': 'private, no-store',
      'X-Content-Type-Options': 'nosniff',
    });
    await pipeline(stream, response);
  } catch (error) {
    if (response.headersSent) return response.destroy(error);
    return next(error);
  }
}

async function findActiveQrDocument(uniqueCode, response) {
  let qr = await findQr(uniqueCode);
  if (!qr) {
    const link = await findSlug(String(uniqueCode).toLowerCase());
    if (link && link.document && link.isActive && !documentUnavailable(link.document)) {
      return link.document;
    }
  }
  if (!qr || !qr.isActive || documentUnavailable(qr.document)) {
    unavailable(response);
    return null;
  }
  return qr.document;
}

async function findActiveSlugDocument(slug, response) {
  let link = await findSlug(slug);
  if (!link) {
    const qr = await findQr(slug);
    if (qr && qr.document && qr.isActive && !documentUnavailable(qr.document)) {
      return qr.document;
    }
  }
  if (!link || !link.document || !link.isActive || documentUnavailable(link.document)) {
    unavailable(response);
    return null;
  }
  return link.document;
}

export async function redirectQr(request, response, next) {
  const code = request.params.uniqueCode;
  let qr = await QRCode.findOne({ uniqueCode: code })
    .populate({ path: 'document', select: '+passwordHash +storageKey' });

  if (!qr) {
    const slug = String(code).toLowerCase();
    const link = await CustomUrl.findOne({ slug, isActive: true })
      .populate({ path: 'document', select: '+passwordHash +storageKey' });
    if (link) {
      request.params.slug = slug;
      return redirectCustomUrl(request, response, next);
    }
    return unavailable(response);
  }

  if (!qr.isActive) {
    return unavailable(response);
  }

  if (qr.destinationType === 'external') {
    if (!qr.destinationUrl) return unavailable(response);
    let target = qr.destinationUrl.trim();
    if (!/^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//.test(target)) {
      target = `https://${target}`;
    }
    await recordVisit(request, response, {
      qrCode: qr._id,
      document: qr.document?._id,
      source: 'qr',
    });
    response.set('Cache-Control', 'no-store');
    return response.redirect(302, target);
  }

  if (qr.document && qr.document.destinationType === 'external' && qr.document.destinationUrl) {
    let target = qr.document.destinationUrl.trim();
    if (!/^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//.test(target)) {
      target = `https://${target}`;
    }
    await recordVisit(request, response, {
      qrCode: qr._id,
      document: qr.document._id,
      source: 'qr',
    });
    response.set('Cache-Control', 'no-store');
    return response.redirect(302, target);
  }

  if (!qr.document || !qr.document.isActive || qr.document.archivedAt) return unavailable(response);

  await recordVisit(request, response, {
    qrCode: qr._id,
    document: qr.document._id,
    source: 'qr',
  });

  if (!hasAccess(request, qr.document)) {
    response.set('Cache-Control', 'no-store');
    return response.redirect(302, publicAppUrl(`/view/${encodeURIComponent(qr.uniqueCode)}`));
  }

  if (request.query.viewer === '1') {
    response.set('Cache-Control', 'no-store');
    return response.redirect(302, publicAppUrl(`/view/${encodeURIComponent(qr.uniqueCode)}`));
  }

  return streamDocument(request, response, next, qr.document);
}

export async function redirectCustomUrl(request, response, next) {
  const rawParam = request.params.slug;
  let slug = rawParam;
  try {
    slug = slugSchema.parse(rawParam);
  } catch {
    slug = String(rawParam).toLowerCase().trim();
  }

  let link = await CustomUrl.findOne({ slug, isActive: true })
    .populate({ path: 'document', select: '+passwordHash +storageKey' });

  if (!link) {
    const qr = await QRCode.findOne({ uniqueCode: rawParam })
      .populate({ path: 'document', select: '+passwordHash +storageKey' });
    if (qr) {
      request.params.uniqueCode = rawParam;
      return redirectQr(request, response, next);
    }
    return unavailable(response);
  }

  if (link.destinationUrl) {
    let target = link.destinationUrl.trim();
    if (!/^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//.test(target)) {
      target = `https://${target}`;
    }
    await recordVisit(request, response, {
      customUrl: link._id,
      source: 'custom_url',
    });
    response.set('Cache-Control', 'no-store');
    return response.redirect(302, target);
  }

  if (link.document && link.document.destinationType === 'external' && link.document.destinationUrl) {
    let target = link.document.destinationUrl.trim();
    if (!/^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//.test(target)) {
      target = `https://${target}`;
    }
    await recordVisit(request, response, {
      customUrl: link._id,
      document: link.document._id,
      source: 'custom_url',
    });
    response.set('Cache-Control', 'no-store');
    return response.redirect(302, target);
  }

  if (!link.document || !link.document.isActive || link.document.archivedAt) {
    return unavailable(response);
  }

  await recordVisit(request, response, {
    customUrl: link._id,
    document: link.document._id,
    source: 'custom_url',
  });

  if (!hasAccess(request, link.document)) {
    response.set('Cache-Control', 'no-store');
    return response.redirect(302, publicAppUrl(`/view/slug/${encodeURIComponent(slug)}`));
  }

  if (request.query.viewer === '1') {
    response.set('Cache-Control', 'no-store');
    return response.redirect(302, publicAppUrl(`/view/slug/${encodeURIComponent(slug)}`));
  }

  return streamDocument(request, response, next, link.document);
}

export async function resolveQr(request, response) {
  const document = await findActiveQrDocument(request.params.uniqueCode, response);
  if (!document) return;
  if (!hasAccess(request, document)) return accessDenied(response, document, request);
  return response.json({ uniqueCode: request.params.uniqueCode, document: viewerDocument(document) });
}

export async function resolvePublicSlug(request, response) {
  const slug = slugSchema.parse(request.params.slug);
  const document = await findActiveSlugDocument(slug, response);
  if (!document) return;
  if (!hasAccess(request, document)) return accessDenied(response, document, request);
  return response.json({ slug, document: viewerDocument(document) });
}

export async function streamQrDocument(request, response, next) {
  const document = await findActiveQrDocument(request.params.uniqueCode, response);
  if (!document) return;
  return streamDocument(request, response, next, document);
}

export async function streamSlugDocument(request, response, next) {
  const slug = slugSchema.parse(request.params.slug);
  const document = await findActiveSlugDocument(slug, response);
  if (!document) return;
  return streamDocument(request, response, next, document);
}

export async function grantQrPassword(request, response) {
  const input = passwordGrantSchema.parse(request.body);
  const document = await findActiveQrDocument(request.params.uniqueCode, response);
  if (!document) return;
  if (document.accessType !== 'password' || !document.passwordHash) {
    return response.status(400).json({ error: 'This document does not accept password access.' });
  }
  if (!await bcrypt.compare(input.password, document.passwordHash)) {
    return response.status(401).json({ error: 'Password is incorrect.' });
  }

  response.cookie(documentAccessCookie(document.id), createDocumentAccessToken(document), {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax',
    path: '/api/public',
    maxAge: 15 * 60 * 1000,
  });
  return response.status(204).end();
}

export async function grantSlugPassword(request, response) {
  const slug = slugSchema.parse(request.params.slug);
  const input = passwordGrantSchema.parse(request.body);
  const document = await findActiveSlugDocument(slug, response);
  if (!document) return;
  if (document.accessType !== 'password' || !document.passwordHash) {
    return response.status(400).json({ error: 'This document does not accept password access.' });
  }
  if (!await bcrypt.compare(input.password, document.passwordHash)) {
    return response.status(401).json({ error: 'Password is incorrect.' });
  }

  response.cookie(documentAccessCookie(document.id), createDocumentAccessToken(document), {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax',
    path: '/api/public',
    maxAge: 15 * 60 * 1000,
  });
  return response.status(204).end();
}
