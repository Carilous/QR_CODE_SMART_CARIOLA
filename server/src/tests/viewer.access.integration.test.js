import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import { once } from 'node:events';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { after, before, test } from 'node:test';
import { PDFDocument } from 'pdf-lib';
import dotenv from 'dotenv';
import mongoose from 'mongoose';
import app from '../app.js';
import ActivityLog from '../models/ActivityLog.js';
import CustomUrl from '../models/CustomUrl.js';
import Document from '../models/Document.js';
import QRCode from '../models/QRCode.js';
import User from '../models/User.js';
import { removeDocument } from '../services/documentStorage.js';

const projectRoot = resolve(fileURLToPath(new URL('../../../', import.meta.url)));
dotenv.config({ path: resolve(projectRoot, '.env') });

const databaseUri = process.env.MONGODB_URI;
const ownerEmail = `viewer-owner-${randomUUID()}@example.invalid`;
const allowedEmail = `viewer-allowed-${randomUUID()}@example.invalid`;
const password = 'temporary-viewer-passphrase-2026';
const protectedPassword = 'protected-viewer-passphrase-2026';
let server;
let baseUrl;

process.env.JWT_SECRET = randomBytes(48).toString('base64');
process.env.STORAGE_PROVIDER = 'local';

before(async () => {
  if (!databaseUri) return;
  await mongoose.connect(databaseUri);
  server = app.listen(0);
  await once(server, 'listening');
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
  if (databaseUri) {
    const users = await User.find({ email: { $in: [ownerEmail, allowedEmail] } });
    const ownerIds = users.map((user) => user._id);
    const documents = await Document.find({ owner: { $in: ownerIds } }).select('+storageKey');
    await Promise.all(documents.map((document) => removeDocument(document.storageKey)));
    await Promise.all([
      Document.deleteMany({ owner: { $in: ownerIds } }),
      CustomUrl.deleteMany({ owner: { $in: ownerIds } }),
      QRCode.deleteMany({ owner: { $in: ownerIds } }),
      ActivityLog.deleteMany({ user: { $in: ownerIds } }),
      User.deleteMany({ _id: { $in: ownerIds } }),
    ]);
    await mongoose.disconnect();
  }
  if (server) server.close();
});

async function createUser(email, name) {
  const response = await fetch(`${baseUrl}/api/auth/register`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ name, email, password }),
  });
  assert.equal(response.status, 201);
  return response.headers.getSetCookie()[0].split(';', 1)[0];
}

async function createPdf() {
  const pdf = await PDFDocument.create();
  pdf.addPage();
  return Buffer.from(await pdf.save());
}

async function createDocument(cookie, title, policy = {}) {
  const form = new FormData();
  form.set('title', title);
  form.set('file', new Blob([await createPdf()], { type: 'application/pdf' }), `${title}.pdf`);
  for (const [key, value] of Object.entries(policy)) form.set(key, String(value));

  const response = await fetch(`${baseUrl}/api/documents`, {
    method: 'POST',
    headers: { cookie },
    body: form,
  });
  const responseBody = await response.text();
  assert.equal(response.status, 201, responseBody);
  return JSON.parse(responseBody).document;
}

async function createQr(cookie, documentId, name) {
  const response = await fetch(`${baseUrl}/api/qr`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', cookie },
    body: JSON.stringify({ documentId, name }),
  });
  assert.equal(response.status, 201);
  return (await response.json()).qr;
}

test('viewer enforces public, private, password, restricted, and expiration policies', { skip: !databaseUri }, async () => {
  const ownerCookie = await createUser(ownerEmail, 'Viewer Owner');
  const allowedCookie = await createUser(allowedEmail, 'Viewer Allowed');

  const publicDocument = await createDocument(ownerCookie, 'Public document', {
    accessType: 'public',
    allowDownload: 'false',
  });
  const publicQr = await createQr(ownerCookie, publicDocument.id, 'Public code');
  const publicResolution = await fetch(`${baseUrl}/api/public/qr/${publicQr.uniqueCode}`);
  assert.equal(publicResolution.status, 200);
  const publicFile = await fetch(`${baseUrl}/api/public/qr/${publicQr.uniqueCode}/file`);
  assert.equal(publicFile.status, 200);
  assert.equal(publicFile.headers.get('content-type'), 'application/pdf');
  const deniedDownload = await fetch(`${baseUrl}/api/public/qr/${publicQr.uniqueCode}/file?download=1`);
  assert.equal(deniedDownload.status, 403);

  const privateDocument = await createDocument(ownerCookie, 'Private document');
  const privateQr = await createQr(ownerCookie, privateDocument.id, 'Private code');
  const privateDenied = await fetch(`${baseUrl}/api/public/qr/${privateQr.uniqueCode}`);
  assert.equal(privateDenied.status, 401);
  const privateOwner = await fetch(`${baseUrl}/api/public/qr/${privateQr.uniqueCode}`, {
    headers: { cookie: ownerCookie },
  });
  assert.equal(privateOwner.status, 200);

  const passwordDocument = await createDocument(ownerCookie, 'Password document', {
    accessType: 'password',
    password: protectedPassword,
  });
  const passwordQr = await createQr(ownerCookie, passwordDocument.id, 'Password code');
  const passwordRequired = await fetch(`${baseUrl}/api/public/qr/${passwordQr.uniqueCode}`);
  assert.equal(passwordRequired.status, 401);
  assert.equal((await passwordRequired.json()).requiresPassword, true);

  const wrongPassword = await fetch(`${baseUrl}/api/public/qr/${passwordQr.uniqueCode}/access`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ password: 'wrong-password' }),
  });
  assert.equal(wrongPassword.status, 401);

  const grantResponse = await fetch(`${baseUrl}/api/public/qr/${passwordQr.uniqueCode}/access`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ password: protectedPassword }),
  });
  assert.equal(grantResponse.status, 204);
  const accessCookie = grantResponse.headers.getSetCookie()[0].split(';', 1)[0];
  const passwordFile = await fetch(`${baseUrl}/api/public/qr/${passwordQr.uniqueCode}/file`, {
    headers: { cookie: accessCookie },
  });
  assert.equal(passwordFile.status, 200);

  const restrictedDocument = await createDocument(ownerCookie, 'Restricted document', {
    accessType: 'restricted',
    allowedEmails: allowedEmail,
  });
  const restrictedQr = await createQr(ownerCookie, restrictedDocument.id, 'Restricted code');
  const restrictedDenied = await fetch(`${baseUrl}/api/public/qr/${restrictedQr.uniqueCode}`);
  assert.equal(restrictedDenied.status, 401);
  const restrictedAllowed = await fetch(`${baseUrl}/api/public/qr/${restrictedQr.uniqueCode}`, {
    headers: { cookie: allowedCookie },
  });
  assert.equal(restrictedAllowed.status, 200);

  await fetch(`${baseUrl}/api/documents/${publicDocument.id}`, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json', cookie: ownerCookie },
    body: JSON.stringify({ expiresAt: new Date(Date.now() - 60_000).toISOString() }),
  });
  const expiredResolution = await fetch(`${baseUrl}/api/public/qr/${publicQr.uniqueCode}`);
  assert.equal(expiredResolution.status, 410);
});