import cors from 'cors';
import cookieParser from 'cookie-parser';
import express from 'express';
import { rateLimit } from 'express-rate-limit';
import helmet from 'helmet';
import multer from 'multer';
import mongoose from 'mongoose';
import { ZodError } from 'zod';
import authRoutes from './routes/auth.routes.js';
import documentsRoutes from './routes/documents.routes.js';
import analyticsRoutes from './routes/analytics.routes.js';
import qrRoutes from './routes/qr.routes.js';
import urlRoutes from './routes/urls.routes.js';
import publicRoutes from './routes/public.routes.js';
import { InvalidPdfError } from './services/pdfValidation.js';





const app = express();
app.set('trust proxy', 1);

const isProduction = process.env.NODE_ENV === 'production';

app.disable('x-powered-by');
app.use(helmet({
  hsts: isProduction ? undefined : false,
  contentSecurityPolicy: isProduction ? undefined : false,
}));

if (!isProduction) {
  app.use((_request, response, next) => {
    // Overwrite any cached HSTS policy for localhost in the browser
    response.setHeader('Strict-Transport-Security', 'max-age=0');
    next();
  });
}
app.use(cors({
  origin: process.env.CLIENT_URL || 'http://localhost:5173',
  credentials: true,
}));
app.use(express.json({ limit: '1mb' }));
app.use(cookieParser());
app.use('/api', rateLimit({
  windowMs: Number(process.env.RATE_LIMIT_WINDOW_MS) || 15 * 60 * 1000,
  limit: Number(process.env.RATE_LIMIT_MAX) || 300,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
}));

app.use('/api/auth', authRoutes);
app.use('/api/documents', documentsRoutes);
app.use('/api/analytics', analyticsRoutes);
app.use('/api/qr', qrRoutes);
app.use('/api/urls', urlRoutes);
app.use('/', publicRoutes);

app.get('/api/health', (_request, response) => {
  const isDatabaseConnected = mongoose.connection.readyState === 1;
  const database = isDatabaseConnected ? 'connected' : 'disconnected';
  const status = isDatabaseConnected ? 'ok' : 'degraded';
  const httpStatus = !isDatabaseConnected && process.env.NODE_ENV === 'production' ? 503 : 200;

  response.status(httpStatus).json({
    status,
    service: 'smartqr-api',
    database,
    timestamp: new Date().toISOString(),
  });
});

app.use((_request, response) => {
  response.status(404).json({ error: 'Route not found' });
});

app.use((error, _request, response, _next) => {
  if (error instanceof ZodError) {
    return response.status(400).json({
      error: 'Invalid request',
      details: error.issues.map((issue) => ({
        field: issue.path.join('.'),
        message: issue.message,
      })),
    });
  }

  if (error instanceof InvalidPdfError) {
    return response.status(error.statusCode).json({ error: error.message });
  }

  if (error instanceof multer.MulterError) {
    const status = error.code === 'LIMIT_FILE_SIZE' ? 413 : 400;
    const message = error.code === 'LIMIT_FILE_SIZE'
      ? 'The PDF exceeds the configured upload limit.'
      : 'The upload request is invalid.';
    return response.status(status).json({ error: message });
  }

  if (Number.isInteger(error.statusCode) && error.statusCode >= 400 && error.statusCode < 500) {
    return response.status(error.statusCode).json({ error: error.message });
  }

  if (error.code === 11000) {
    return response.status(409).json({ error: 'A record with the same unique value already exists.' });
  }

  console.error(error);
  return response.status(500).json({ error: 'Internal server error' });
});

export default app;