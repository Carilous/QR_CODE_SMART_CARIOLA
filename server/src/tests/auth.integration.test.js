import assert from 'node:assert/strict';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { once } from 'node:events';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { after, before, test } from 'node:test';
import dotenv from 'dotenv';
import mongoose from 'mongoose';
import app from '../app.js';
import User from '../models/User.js';

const projectRoot = resolve(fileURLToPath(new URL('../../../', import.meta.url)));
dotenv.config({ path: resolve(projectRoot, '.env') });

const databaseUri = process.env.MONGODB_URI;
const testEmail = `auth-test-${randomUUID()}@example.invalid`;
const testPassword = 'temporary-test-passphrase-2026';
const updatedPassword = 'updated-test-passphrase-2026';
let server;
let baseUrl;

process.env.JWT_SECRET = randomBytes(48).toString('base64');

before(async () => {
  if (!databaseUri) return;
  await mongoose.connect(databaseUri);
  server = app.listen(0);
  await once(server, 'listening');
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
  if (databaseUri) {
    await User.deleteOne({ email: testEmail });
    await mongoose.disconnect();
  }
  if (server) server.close();
});

test('registration, login, current session, and logout work', { skip: !databaseUri }, async () => {
  const registerResponse = await fetch(`${baseUrl}/api/auth/register`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      name: 'Temporary Auth Test',
      email: testEmail,
      password: testPassword,
    }),
  });

  assert.equal(registerResponse.status, 201);
  const registration = await registerResponse.json();
  assert.equal(registration.user.role, 'user');
  assert.equal('passwordHash' in registration.user, false);

  const registrationCookie = registerResponse.headers.getSetCookie()[0].split(';', 1)[0];
  const currentResponse = await fetch(`${baseUrl}/api/auth/me`, {
    headers: { cookie: registrationCookie },
  });
  assert.equal(currentResponse.status, 200);
  assert.equal((await currentResponse.json()).user.email, testEmail);

  const profileResponse = await fetch(`${baseUrl}/api/auth/me`, {
    method: 'PATCH',
    headers: {
      'content-type': 'application/json',
      cookie: registrationCookie,
    },
    body: JSON.stringify({ name: 'Updated Auth Test' }),
  });
  assert.equal(profileResponse.status, 200);
  assert.equal((await profileResponse.json()).user.name, 'Updated Auth Test');
  //added my carilous
  async function checkAuth() {
  try {
    const res = await fetch('/api/auth/me', {
      credentials: 'include', // Sends session cookies
    });

    if (res.status === 401) {
      setUser(null); // Normal when not logged in
      return;
    }

    if (res.ok) {
      const data = await res.json();
      setUser(data);
    }
  } catch (error) {
    setUser(null);
  }
}
//end of my carilous

  const logoutResponse = await fetch(`${baseUrl}/api/auth/logout`, {
    method: 'POST',
    headers: { cookie: registrationCookie },
  });
  assert.equal(logoutResponse.status, 204);

  const loggedOutResponse = await fetch(`${baseUrl}/api/auth/me`);
  assert.equal(loggedOutResponse.status, 401);

  const loginResponse = await fetch(`${baseUrl}/api/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email: testEmail, password: testPassword }),
  });
  assert.equal(loginResponse.status, 200);

  const resetToken = randomBytes(32).toString('hex');
  const testUser = await User.findOne({ email: testEmail });
  testUser.passwordResetTokenHash = createHash('sha256').update(resetToken).digest('hex');
  testUser.passwordResetExpiresAt = new Date(Date.now() + 30 * 60 * 1000);
  await testUser.save();

  const resetResponse = await fetch(`${baseUrl}/api/auth/reset-password`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ token: resetToken, password: updatedPassword }),
  });
  assert.equal(resetResponse.status, 200);

  const staleSessionResponse = await fetch(`${baseUrl}/api/auth/me`, {
    headers: { cookie: registrationCookie },
  });
  assert.equal(staleSessionResponse.status, 401);

  const oldPasswordResponse = await fetch(`${baseUrl}/api/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email: testEmail, password: testPassword }),
  });
  assert.equal(oldPasswordResponse.status, 401);

  const newPasswordResponse = await fetch(`${baseUrl}/api/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email: testEmail, password: updatedPassword }),
  });
  assert.equal(newPasswordResponse.status, 200);
});