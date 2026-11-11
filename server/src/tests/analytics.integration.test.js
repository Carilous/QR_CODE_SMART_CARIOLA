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
import Scan from '../models/Scan.js';
import User from '../models/User.js';
import { removeDocument } from '../services/documentStorage.js';

const projectRoot = resolve(fileURLToPath(new URL('../../../', import.meta.url)));
dotenv.config({ path: resolve(projectRoot, '.env') });

const databaseUri = process.env.MONGODB_URI;
const testEmail = `analytics-test-${randomUUID()}@example.invalid`;
const testPassword = 'temporary-analytics-passphrase-2026';
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
    const user = await User.findOne({ email: testEmail });
    if (user) {
      const documents = await Document.find({ owner: user._id }).select('+storageKey');
      await Promise.all(documents.map((document) => removeDocument(document.storageKey)));
      const documentIds = documents.map((document) => document._id);
      const qrIds = await QRCode.distinct('_id', { owner: user._id });
      await Promise.all([
        Scan.deleteMany({ $or: [{ document: { $in: documentIds } }, { qrCode: { $in: qrIds } }] }),
        Document.deleteMany({ owner: user._id }),
        CustomUrl.deleteMany({ owner: user._id }),
        QRCode.deleteMany({ owner: user._id }),
        ActivityLog.deleteMany({ user: user._id }),
      ]);
    }
    await User.deleteOne({ email: testEmail });
    await mongoose.disconnect();
  }
  if (server) server.close();
});

async function createPdf() {
  const pdf = await PDFDocument.create();
  pdf.addPage();
  return Buffer.from(await pdf.save());
}

test('scan analytics deduplicates sessions, filters bots, and scopes results to owner', { skip: !databaseUri }, async () => {
  const registerResponse = await fetch(`${baseUrl}/api/auth/register`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ name: 'Analytics Owner', email: testEmail, password: testPassword }),
  });
  assert.equal(registerResponse.status, 201);
  const ownerCookie = registerResponse.headers.getSetCookie()[0].split(';', 1)[0];

  const form = new FormData();
  form.set('title', 'Analytics Test Document');
  form.set('accessType', 'public');
  form.set('file', new Blob([await createPdf()], { type: 'application/pdf' }), 'analytics.pdf');
  const documentResponse = await fetch(`${baseUrl}/api/documents`, {
    method: 'POST',
    headers: { cookie: ownerCookie },
    body: form,
  });
  assert.equal(documentResponse.status, 201);
  const document = (await documentResponse.json()).document;

  const qrResponse = await fetch(`${baseUrl}/api/qr`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', cookie: ownerCookie },
    body: JSON.stringify({ documentId: document.id, name: 'Analytics code' }),
  });
  assert.equal(qrResponse.status, 201);
  const qr = (await qrResponse.json()).qr;

  const firstScan = await fetch(`${baseUrl}/r/${qr.uniqueCode}`, {
    redirect: 'manual',
    headers: { 'user-agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Version/17.0 Mobile/15E148 Safari/604.1' },
  });
  assert.equal(firstScan.status, 302);
  const anonymousCookie = firstScan.headers.getSetCookie().find((cookie) => cookie.startsWith('smartqr_anon=')).split(';', 1)[0];

  const duplicateScan = await fetch(`${baseUrl}/r/${qr.uniqueCode}`, {
    redirect: 'manual',
    headers: {
      cookie: anonymousCookie,
      'user-agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Version/17.0 Mobile/15E148 Safari/604.1',
    },
  });
  assert.equal(duplicateScan.status, 302);

  const secondSessionScan = await fetch(`${baseUrl}/r/${qr.uniqueCode}`, {
    redirect: 'manual',
    headers: { 'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/130.0.0.0 Safari/537.36' },
  });
  assert.equal(secondSessionScan.status, 302);

  await fetch(`${baseUrl}/r/${qr.uniqueCode}`, {
    redirect: 'manual',
    headers: { 'user-agent': 'Googlebot/2.1 (+http://www.google.com/bot.html)' },
  });

  const analyticsResponse = await fetch(`${baseUrl}/api/analytics/overview`, { headers: { cookie: ownerCookie } });
  assert.equal(analyticsResponse.status, 200);
  const analytics = (await analyticsResponse.json()).overview;
  assert.equal(analytics.totalScans, 2);
  assert.equal(analytics.uniqueVisitors, 2);

  const scansResponse = await fetch(`${baseUrl}/api/analytics/scans?days=30`, { headers: { cookie: ownerCookie } });
  assert.equal(scansResponse.status, 200);
  const scanData = await scansResponse.json();
  assert.equal(scanData.total, 2);
  assert.equal(scanData.devices.find((item) => item.device === 'mobile').scans, 1);
  assert.equal(scanData.devices.find((item) => item.device === 'desktop').scans, 1);

  const deniedResponse = await fetch(`${baseUrl}/api/analytics/overview`);
  assert.equal(deniedResponse.status, 401);
});