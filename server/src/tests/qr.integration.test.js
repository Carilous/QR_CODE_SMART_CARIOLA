import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import { once } from 'node:events';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { after, before, test } from 'node:test';
import { PDFDocument } from 'pdf-lib';
import jsQR from 'jsqr';
import { PNG } from 'pngjs';
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
const testEmail = `qr-test-${randomUUID()}@example.invalid`;
const testPassword = 'temporary-qr-passphrase-2026';
const testSlug = `qr-test-${randomUUID().slice(0, 8)}`;
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
      await Promise.all([
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

async function uploadPdf(cookie, title) {
  const form = new FormData();
  form.set('title', title);
  form.set('file', new Blob([await createPdf()], { type: 'application/pdf' }), `${title}.pdf`);
  const response = await fetch(`${baseUrl}/api/documents`, {
    method: 'POST',
    headers: { cookie },
    body: form,
  });
  assert.equal(response.status, 201);
  return (await response.json()).document;
}

function decodeQrDataUrl(dataUrl) {
  const image = PNG.sync.read(Buffer.from(dataUrl.split(',')[1], 'base64'));
  const decoded = jsQR(new Uint8ClampedArray(image.data), image.width, image.height);
  assert.ok(decoded, 'Generated QR image should be scannable.');
  return decoded.data;
}

test('custom URL and QR destinations remain dynamic without changing the QR identifier', { skip: !databaseUri }, async () => {
  const registerResponse = await fetch(`${baseUrl}/api/auth/register`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ name: 'QR Test Owner', email: testEmail, password: testPassword }),
  });
  assert.equal(registerResponse.status, 201);
  const cookie = registerResponse.headers.getSetCookie()[0].split(';', 1)[0];

  const firstDocument = await uploadPdf(cookie, 'Original handbook');
  const secondDocument = await uploadPdf(cookie, 'Updated handbook');

  const createUrlResponse = await fetch(`${baseUrl}/api/urls`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', cookie },
    body: JSON.stringify({ documentId: firstDocument.id, slug: testSlug }),
  });
  assert.equal(createUrlResponse.status, 201);
  const customUrl = (await createUrlResponse.json()).url;

  const slugCheck = await fetch(`${baseUrl}/api/urls/check/${testSlug}`, { headers: { cookie } });
  assert.equal((await slugCheck.json()).available, false);

  const duplicateSlugResponse = await fetch(`${baseUrl}/api/urls`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', cookie },
    body: JSON.stringify({ documentId: secondDocument.id, slug: testSlug }),
  });
  assert.equal(duplicateSlugResponse.status, 409);

  const createQrResponse = await fetch(`${baseUrl}/api/qr`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', cookie },
    body: JSON.stringify({ documentId: firstDocument.id, name: 'Handbook entrance' }),
  });
  assert.equal(createQrResponse.status, 201);
  const createdQr = (await createQrResponse.json()).qr;
  assert.match(createdQr.previewDataUrl, /^data:image\/png;base64,/);

  const redirectResponse = await fetch(`${baseUrl}/r/${createdQr.uniqueCode}`, { redirect: 'manual' });
  assert.equal(redirectResponse.status, 302);
  const originalLocation = new URL(redirectResponse.headers.get('location'));
  assert.equal(originalLocation.pathname, `/view/${createdQr.uniqueCode}`);

  const pngResponse = await fetch(`${baseUrl}/api/qr/${createdQr.id}/download?format=png`, { headers: { cookie } });
  assert.equal(pngResponse.headers.get('content-type'), 'image/png');
  assert.equal(Buffer.from(await pngResponse.arrayBuffer()).subarray(0, 8).toString('hex'), '89504e470d0a1a0a');

  const svgResponse = await fetch(`${baseUrl}/api/qr/${createdQr.id}/download?format=svg`, { headers: { cookie } });
  assert.equal(svgResponse.headers.get('content-type'), 'image/svg+xml');
  assert.match(await svgResponse.text(), /<svg/);

  const pdfResponse = await fetch(`${baseUrl}/api/qr/${createdQr.id}/download?format=pdf`, { headers: { cookie } });
  assert.equal(pdfResponse.headers.get('content-type'), 'application/pdf');
  assert.equal(Buffer.from(await pdfResponse.arrayBuffer()).subarray(0, 4).toString(), '%PDF');

  const changeResponse = await fetch(`${baseUrl}/api/qr/${createdQr.id}/change-destination`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', cookie },
    body: JSON.stringify({ documentId: secondDocument.id }),
  });
  assert.equal(changeResponse.status, 200);
  const changedQr = (await changeResponse.json()).qr;
  assert.equal(changedQr.id, createdQr.id);
  assert.equal(changedQr.uniqueCode, createdQr.uniqueCode);
  assert.equal(changedQr.document.id, secondDocument.id);
  assert.equal(changedQr.redirectUrl, createdQr.redirectUrl);

  const qrRedirectAgain = await fetch(`${baseUrl}/r/${createdQr.uniqueCode}`, { redirect: 'manual' });
  assert.equal(qrRedirectAgain.headers.get('location'), redirectResponse.headers.get('location'));

  const customRedirect = await fetch(`${baseUrl}/d/${testSlug}`, { redirect: 'manual' });
  assert.equal(customRedirect.status, 302);
  assert.equal(new URL(customRedirect.headers.get('location')).pathname, `/view/slug/${testSlug}`);

  const externalSlug = `external-${testSlug}`;
  const destinationUrl = `https://outside.example/document?data=${'x'.repeat(1900)}`;
  const validationResponse = await fetch(`${baseUrl}/api/urls/validate`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', cookie },
    body: JSON.stringify({ destinationUrl }),
  });
  assert.equal(validationResponse.status, 200);
  assert.equal((await validationResponse.json()).status, 'valid');

  const blockedDestinationResponse = await fetch(`${baseUrl}/api/urls/reachability`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', cookie },
    body: JSON.stringify({ destinationUrl: 'http://127.0.0.1/' }),
  });
  assert.equal(blockedDestinationResponse.status, 200);
  assert.equal((await blockedDestinationResponse.json()).status, 'inaccessible');

  const externalUrlResponse = await fetch(`${baseUrl}/api/urls`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', cookie },
    body: JSON.stringify({ slug: externalSlug, destinationUrl }),
  });
  assert.equal(externalUrlResponse.status, 201);
  const externalUrl = (await externalUrlResponse.json()).url;
  assert.equal(externalUrl.document, null);
  assert.equal(externalUrl.destinationUrl, new URL(destinationUrl).toString());

  const externalRedirect = await fetch(`${baseUrl}/d/${externalSlug}`, { redirect: 'manual' });
  assert.equal(externalRedirect.status, 302);
  assert.equal(externalRedirect.headers.get('location'), externalUrl.destinationUrl);
  const externalScan = await Scan.findOne({ customUrl: externalUrl.id });
  assert.ok(externalScan);
  assert.equal(externalScan.document, null);

  const directDestination = 'https://outside.example/reports/final.pdf?source=direct';
  const directQrResponse = await fetch(`${baseUrl}/api/qr`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', cookie },
    body: JSON.stringify({
      documentId: firstDocument.id,
      name: 'Direct external report',
      qrMode: 'direct',
      destinationType: 'external',
      destinationUrl: directDestination,
    }),
  });
  assert.equal(directQrResponse.status, 201);
  const directQr = (await directQrResponse.json()).qr;
  assert.equal(directQr.qrMode, 'direct');
  assert.equal(directQr.encodedUrl, directDestination);
  assert.match(directQr.previewDataUrl, /^data:image\/png;base64,/);
  assert.equal(decodeQrDataUrl(directQr.previewDataUrl), directDestination);

  const invalidQrResponse = await fetch(`${baseUrl}/api/qr`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', cookie },
    body: JSON.stringify({
      documentId: firstDocument.id,
      name: 'Invalid external report',
      qrMode: 'direct',
      destinationType: 'external',
      destinationUrl: 'javascript:alert(1)',
    }),
  });
  assert.equal(invalidQrResponse.status, 400);

  const dynamicDestination = 'https://outside.example/reports/current.pdf';
  const dynamicQrResponse = await fetch(`${baseUrl}/api/qr`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', cookie },
    body: JSON.stringify({
      documentId: secondDocument.id,
      name: 'Dynamic external report',
      qrMode: 'dynamic',
      destinationType: 'external',
      destinationUrl: dynamicDestination,
    }),
  });
  assert.equal(dynamicQrResponse.status, 201);
  const dynamicQr = (await dynamicQrResponse.json()).qr;
  assert.equal(dynamicQr.qrMode, 'dynamic');
  assert.equal(dynamicQr.encodedUrl, dynamicQr.redirectUrl);
  assert.equal(decodeQrDataUrl(dynamicQr.previewDataUrl), dynamicQr.redirectUrl);

  const dynamicRedirect = await fetch(`${baseUrl}/r/${dynamicQr.uniqueCode}`, { redirect: 'manual' });
  assert.equal(dynamicRedirect.status, 302);
  assert.equal(dynamicRedirect.headers.get('location'), dynamicDestination);

  const nextDestination = 'https://another.example/new/location?rev=2';
  const dynamicChangeResponse = await fetch(`${baseUrl}/api/qr/${dynamicQr.id}/change-destination`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', cookie },
    body: JSON.stringify({ destinationUrl: nextDestination }),
  });
  assert.equal(dynamicChangeResponse.status, 200);
  const changedDynamicQr = (await dynamicChangeResponse.json()).qr;
  assert.equal(changedDynamicQr.id, dynamicQr.id);
  assert.equal(changedDynamicQr.uniqueCode, dynamicQr.uniqueCode);
  assert.equal(changedDynamicQr.encodedUrl, dynamicQr.encodedUrl);

  const dynamicRedirectAfterChange = await fetch(`${baseUrl}/r/${dynamicQr.uniqueCode}`, { redirect: 'manual' });
  assert.equal(dynamicRedirectAfterChange.status, 302);
  assert.equal(dynamicRedirectAfterChange.headers.get('location'), nextDestination);

  assert.ok(await ActivityLog.exists({ entityId: createdQr.id, action: 'qr.destination.changed' }));
  assert.equal(customUrl.slug, testSlug);
});