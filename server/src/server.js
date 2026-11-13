import dotenv from 'dotenv';
import mongoose from 'mongoose';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = resolve(fileURLToPath(new URL('../..', import.meta.url)));
dotenv.config({ path: resolve(projectRoot, '.env') });
dotenv.config({ path: resolve(projectRoot, 'server/.env') });

function validateProductionConfig() {
  if (process.env.NODE_ENV !== 'production') return;

  const required = [
    'MONGODB_URI',
    'CLIENT_URL',
    'PUBLIC_APP_URL',
    'SMTP_HOST',
    'SMTP_USER',
    'SMTP_PASSWORD',
    'SMTP_FROM',
    'AWS_REGION',
    'S3_BUCKET',
    'S3_ENDPOINT',
    'AWS_ACCESS_KEY_ID',
    'AWS_SECRET_ACCESS_KEY',
  ];
  const missing = required.filter((name) => !process.env[name]);

  if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32) {
    missing.push('JWT_SECRET (at least 32 characters)');
  }

  if (missing.length) {
    throw new Error(`Missing production environment settings: ${missing.join(', ')}`);
  }

  if (process.env.STORAGE_PROVIDER !== 's3') {
    throw new Error('STORAGE_PROVIDER must be set to s3 in production.');
  }

  if (new URL(process.env.CLIENT_URL).protocol !== 'https:') {
    throw new Error('CLIENT_URL must use HTTPS in production.');
  }
  if (new URL(process.env.PUBLIC_APP_URL).protocol !== 'https:') {
    throw new Error('PUBLIC_APP_URL must use HTTPS in production.');
  }
}

validateProductionConfig();

const [{ default: app }, { connectDatabase }] = await Promise.all([
  import('./app.js'),
  import('./config/database.js'),
]);

const port = Number(process.env.PORT) || 5000;

try {
  await connectDatabase();
} catch (error) {
  console.error(`MongoDB connection failed: ${error.message}`);
  if (process.env.NODE_ENV === 'production') process.exit(1);
  console.error('The API will start, but database-backed features will be unavailable.');
}

const server = app.listen(port, () => {
  console.info(`SmartQR API listening on http://localhost:${port}`);
});

function shutDown(signal) {
  console.info(`Received ${signal}; closing the API server.`);
  server.close(() => {
    mongoose.disconnect().finally(() => process.exit(0));
  });
}

process.once('SIGINT', () => shutDown('SIGINT'));
process.once('SIGTERM', () => shutDown('SIGTERM'));