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
import Document from '../models/Document.js';
import User from '../models/User.js';
import { removeDocument } from '../services/documentStorage.js';

const projectRoot = resolve(fileURLToPath(new URL('../../../', import.meta.url)));
dotenv.config({ path: resolve(projectRoot, '.env') });

const databaseUri = process.env.MONGODB_URI;
const ownerEmail = `document-owner-${randomUUID()}@example.invalid`;
const otherEmail = `document-other-${randomUUID()}@example.invalid`;
const password = 'temporary-document-passphrase-2026';
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
    const owner = await User.findOne({ email: ownerEmail });
    if (owner) {
      const documents = await Document.find({ owner: owner._id }).select('+storageKey');
      await Promise.all(documents.map((document) => removeDocument(document.storageKey)));
      await Document.deleteMany({ owner: owner._id });
    }
    await User.deleteMany({ email: { $in: [ownerEmail, otherEmail] } });
    await mongoose.disconnect();
  }
  if (server) server.close();
});

async function registerTestUser(email, name) {
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

function uploadForm(buffer, title) {
  const form = new FormData();
  form.set('title', title);
  form.set('description', 'Integration test document');
  form.set('tags', 'test,private');
  form.set('file', new Blob([buffer], { type: 'application/pdf' }), `${title}.pdf`);
  return form;
}

test('PDF upload, ownership, preview, replacement, and deletion work', { skip: !databaseUri }, async () => {
  const ownerCookie = await registerTestUser(ownerEmail, 'Document Owner');
  const otherCookie = await registerTestUser(otherEmail, 'Other Owner');

  const invalidForm = new FormData();
  invalidForm.set('file', new Blob(['not a PDF'], { type: 'application/pdf' }), 'fake.pdf');
  const invalidResponse = await fetch(`${baseUrl}/api/documents`, {
    method: 'POST',
    headers: { cookie: ownerCookie },
    body: invalidForm,
  });
  assert.equal(invalidResponse.status, 400);

  const firstPdf = await createPdf();
  const createResponse = await fetch(`${baseUrl}/api/documents`, {
    method: 'POST',
    headers: { cookie: ownerCookie },
    body: uploadForm(firstPdf, 'First handbook'),
  });
  assert.equal(createResponse.status, 201);
  const created = (await createResponse.json()).document;
  assert.equal(created.version, 1);
  assert.equal(created.accessType, 'private');
  assert.equal('storageKey' in created, false);

  const listResponse = await fetch(`${baseUrl}/api/documents`, {
    headers: { cookie: ownerCookie },
  });
  assert.equal(listResponse.status, 200);
  assert.equal((await listResponse.json()).documents[0].id, created.id);

  const deniedResponse = await fetch(`${baseUrl}/api/documents/${created.id}`, {
    headers: { cookie: otherCookie },
  });
  assert.equal(deniedResponse.status, 404);

  const previewResponse = await fetch(`${baseUrl}/api/documents/${created.id}/preview`, {
    headers: { cookie: ownerCookie },
  });
  assert.equal(previewResponse.status, 200);
  assert.equal(previewResponse.headers.get('content-type'), 'application/pdf');

  const replacementPdf = await createPdf();
  const replaceResponse = await fetch(`${baseUrl}/api/documents/${created.id}/replace`, {
    method: 'POST',
    headers: { cookie: ownerCookie },
    body: uploadForm(replacementPdf, 'Updated handbook'),
  });
  assert.equal(replaceResponse.status, 200);
  const replaced = (await replaceResponse.json()).document;
  assert.equal(replaced.id, created.id);
  assert.equal(replaced.version, 2);

  const deleteResponse = await fetch(`${baseUrl}/api/documents/${created.id}`, {
    method: 'DELETE',
    headers: { cookie: ownerCookie },
  });
  assert.equal(deleteResponse.status, 204);

  const missingResponse = await fetch(`${baseUrl}/api/documents/${created.id}`, {
    headers: { cookie: ownerCookie },
  });
  assert.equal(missingResponse.status, 404);
});