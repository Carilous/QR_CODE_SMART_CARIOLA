import bcrypt from 'bcryptjs';
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import mongoose from 'mongoose';
import User from '../models/User.js';
import { isEmailConfigured, sendPasswordResetEmail } from '../services/email.service.js';
import {
  forgotPasswordSchema,
  loginSchema,
  registerSchema,
  resetPasswordSchema,
  updateProfileSchema,
} from '../utils/auth.validation.js';
import { createSessionToken, SESSION_COOKIE, sessionCookieOptions } from '../utils/auth.token.js';

const PASSWORD_COST = 12;

function databaseReady(response) {
  if (mongoose.connection.readyState === 1) return true;
  response.status(503).json({ error: 'Authentication is temporarily unavailable.' });
  return false;
}

function sessionSecretReady(response) {
  if (process.env.JWT_SECRET && process.env.JWT_SECRET.length >= 32) return true;
  response.status(503).json({ error: 'Authentication is not configured.' });
  return false;
}

function publicUser(user) {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    status: user.status,
    createdAt: user.createdAt,
  };
}

function beginSession(response, user) {
  response.cookie(SESSION_COOKIE, createSessionToken(user), sessionCookieOptions());
}

function tokenDigest(token) {
  return createHash('sha256').update(token).digest('hex');
}

function matchesBootstrapKey(providedKey, configuredKey) {
  if (!providedKey || !configuredKey) return false;
  const provided = Buffer.from(providedKey);
  const configured = Buffer.from(configuredKey);
  return provided.length === configured.length && timingSafeEqual(provided, configured);
}

export async function register(request, response) {
  if (!sessionSecretReady(response) || !databaseReady(response)) return;
  const input = registerSchema.parse(request.body);
  const existing = await User.exists({ email: input.email });
  if (existing) {
    return response.status(409).json({ error: 'An account with that email already exists.' });
  }

  const passwordHash = await bcrypt.hash(input.password, PASSWORD_COST);
  const user = await User.create({
    name: input.name,
    email: input.email,
    passwordHash,
    role: 'user',
  });

  beginSession(response, user);
  return response.status(201).json({ user: publicUser(user) });
}

export async function bootstrapSuperAdmin(request, response) {
  if (!sessionSecretReady(response) || !databaseReady(response)) return;
  const configuredKey = process.env.ADMIN_BOOTSTRAP_KEY;
  if (!configuredKey) {
    return response.status(404).json({ error: 'Route not found.' });
  }
  if (!matchesBootstrapKey(request.get('x-admin-bootstrap-key'), configuredKey)) {
    return response.status(403).json({ error: 'Invalid bootstrap key.' });
  }

  const input = registerSchema.parse(request.body);
  const existingAdmin = await User.exists({ role: 'super_admin' });
  if (existingAdmin) {
    return response.status(409).json({ error: 'The initial administrator has already been created.' });
  }

  const user = await User.create({
    name: input.name,
    email: input.email,
    passwordHash: await bcrypt.hash(input.password, PASSWORD_COST),
    role: 'super_admin',
  });

  beginSession(response, user);
  return response.status(201).json({ user: publicUser(user) });
}

export async function login(request, response) {
  if (!sessionSecretReady(response) || !databaseReady(response)) return;
  const input = loginSchema.parse(request.body);
  const user = await User.findOne({ email: input.email }).select('+passwordHash');
  const passwordMatches = user ? await user.verifyPassword(input.password) : false;

  if (!user || !passwordMatches || user.status !== 'active') {
    return response.status(401).json({ error: 'Email or password is incorrect.' });
  }

  beginSession(response, user);
  return response.json({ user: publicUser(user) });
}

export function logout(_request, response) {
  const { maxAge: _maxAge, ...cookieOptions } = sessionCookieOptions();
  response.clearCookie(SESSION_COOKIE, cookieOptions);
  return response.status(204).end();
}

export function currentUser(request, response) {
  return response.json({ user: publicUser(request.user) });
}

export async function updateCurrentUser(request, response) {
  const input = updateProfileSchema.parse(request.body);
  request.user.name = input.name;
  await request.user.save();
  return response.json({ user: publicUser(request.user) });
}

export async function forgotPassword(request, response) {
  if (!databaseReady(response)) return;
  if (!isEmailConfigured()) {
    return response.status(503).json({ error: 'Password reset email is not configured.' });
  }

  const input = forgotPasswordSchema.parse(request.body);
  const user = await User.findOne({ email: input.email });
  if (user) {
    const token = randomBytes(32).toString('hex');
    user.passwordResetTokenHash = tokenDigest(token);
    user.passwordResetExpiresAt = new Date(Date.now() + 30 * 60 * 1000);
    await user.save();

    const clientUrl = process.env.CLIENT_URL || 'http://localhost:5173';
    const resetUrl = new URL('/reset-password', clientUrl);
    resetUrl.searchParams.set('token', token);
    try {
      await sendPasswordResetEmail(user.email, resetUrl.toString());
    } catch (error) {
      user.passwordResetTokenHash = undefined;
      user.passwordResetExpiresAt = undefined;
      await user.save();
      throw error;
    }
  }

  return response.json({ message: 'If that account exists, a reset link has been sent.' });
}

export async function resetPassword(request, response) {
  if (!databaseReady(response)) return;
  const input = resetPasswordSchema.parse(request.body);
  const user = await User.findOne({
    passwordResetTokenHash: tokenDigest(input.token),
    passwordResetExpiresAt: { $gt: new Date() },
  }).select('+passwordResetTokenHash +passwordResetExpiresAt');

  if (!user) {
    return response.status(400).json({ error: 'This password reset link is invalid or expired.' });
  }

  user.passwordHash = await bcrypt.hash(input.password, PASSWORD_COST);
  user.passwordResetTokenHash = undefined;
  user.passwordResetExpiresAt = undefined;
  user.authVersion += 1;
  await user.save();

  return response.json({ message: 'Password updated. Sign in with your new password.' });
}