import assert from 'node:assert/strict';
import test from 'node:test';
import { registerSchema, resetPasswordSchema } from '../utils/auth.validation.js';

test('registration normalizes email and does not accept a client role', () => {
  const parsed = registerSchema.parse({
    name: ' Smart QR User ',
    email: '  USER@example.com ',
    password: 'a-long-passphrase-2026',
    role: 'super_admin',
  });

  assert.equal(parsed.name, 'Smart QR User');
  assert.equal(parsed.email, 'user@example.com');
  assert.equal('role' in parsed, false);
});

test('registration rejects passwords shorter than the minimum', () => {
  const result = registerSchema.safeParse({
    name: 'Smart QR User',
    email: 'user@example.com',
    password: 'short',
  });

  assert.equal(result.success, false);
});

test('password reset requires a 64-character hexadecimal token', () => {
  const result = resetPasswordSchema.safeParse({
    token: 'not-a-reset-token',
    password: 'a-long-passphrase-2026',
  });

  assert.equal(result.success, false);
});