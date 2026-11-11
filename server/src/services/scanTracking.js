import { createHash, randomBytes } from 'node:crypto';
import Scan from '../models/Scan.js';

const SESSION_COOKIE = 'smartqr_anon';
const DUPLICATE_WINDOW_MS = 15 * 60 * 1000;

function parseDevice(userAgent) {
  if (/ipad|tablet/i.test(userAgent)) return 'tablet';
  if (/mobile|iphone|ipod|android/i.test(userAgent)) return 'mobile';
  return userAgent ? 'desktop' : 'unknown';
}

function parseBrowser(userAgent) {
  if (/edg\//i.test(userAgent)) return 'Edge';
  if (/opr\//i.test(userAgent)) return 'Opera';
  if (/firefox\//i.test(userAgent)) return 'Firefox';
  if (/chrome\//i.test(userAgent)) return 'Chrome';
  if (/safari\//i.test(userAgent)) return 'Safari';
  return 'Other';
}

function parseOperatingSystem(userAgent) {
  if (/iphone|ipad|ipod/i.test(userAgent)) return 'iOS';
  if (/android/i.test(userAgent)) return 'Android';
  if (/windows/i.test(userAgent)) return 'Windows';
  if (/macintosh|mac os/i.test(userAgent)) return 'macOS';
  if (/linux/i.test(userAgent)) return 'Linux';
  return 'Other';
}

function safeReferrer(value) {
  if (!value) return '';
  try {
    const referrer = new URL(value);
    return `${referrer.origin}${referrer.pathname}`.slice(0, 500);
  } catch {
    return '';
  }
}

function getSessionId(request, response) {
  const existing = request.cookies?.[SESSION_COOKIE];
  if (existing && /^[a-f0-9]{32}$/.test(existing)) return existing;

  const generated = randomBytes(16).toString('hex');
  response.cookie(SESSION_COOKIE, generated, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax',
    path: '/',
    maxAge: 365 * 24 * 60 * 60 * 1000,
  });
  return generated;
}

export async function recordVisit(request, response, { qrCode, customUrl, document, source }) {
  const userAgent = String(request.get('user-agent') || '').slice(0, 512);
  if (!userAgent || /bot|crawler|spider|preview|headless|curl|wget/i.test(userAgent)) return;

  const anonymousSessionId = getSessionId(request, response);
  const bucket = Math.floor(Date.now() / DUPLICATE_WINDOW_MS);
  const dedupeKey = createHash('sha256')
    .update(`${source}:${qrCode || customUrl}:${anonymousSessionId}:${bucket}`)
    .digest('hex');

  try {
    await Scan.create({
      qrCode: qrCode || null,
      customUrl: customUrl || null,
      document,
      source,
      anonymousSessionId,
      dedupeKey,
      deviceType: parseDevice(userAgent),
      browser: parseBrowser(userAgent),
      operatingSystem: parseOperatingSystem(userAgent),
      referrer: safeReferrer(request.get('referer')),
    });
  } catch (error) {
    if (error.code !== 11000) console.error(`Scan tracking failed: ${error.message}`);
  }
}