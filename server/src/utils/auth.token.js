import jwt from 'jsonwebtoken';

export const SESSION_COOKIE = 'smartqr_session';

const tokenOptions = {
  issuer: 'smartqr-api',
  audience: 'smartqr-client',
};

export function getJwtSecret() {
  const secret = process.env.JWT_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error('JWT_SECRET must contain at least 32 characters.');
  }
  return secret;
}

export function createSessionToken(user) {
  return jwt.sign(
    { sub: user.id, version: user.authVersion },
    getJwtSecret(),
    { ...tokenOptions, expiresIn: '8h' },
  );
}

export function verifySessionToken(token) {
  return jwt.verify(token, getJwtSecret(), tokenOptions);
}

export function createDocumentAccessToken(document) {
  return jwt.sign(
    { documentId: document.id, version: document.accessVersion },
    getJwtSecret(),
    { issuer: 'smartqr-api', audience: 'smartqr-document-access', expiresIn: '15m' },
  );
}

export function verifyDocumentAccessToken(token, document) {
  try {
    const payload = jwt.verify(token, getJwtSecret(), {
      issuer: 'smartqr-api',
      audience: 'smartqr-document-access',
    });
    return payload.documentId === document.id && payload.version === document.accessVersion;
  } catch {
    return false;
  }
}

export function sessionCookieOptions() {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax',
    path: '/api',
    maxAge: 8 * 60 * 60 * 1000,
  };
}