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