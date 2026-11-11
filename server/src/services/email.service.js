import nodemailer from 'nodemailer';

export function isEmailConfigured() {
  return Boolean(
    process.env.SMTP_HOST
    && process.env.SMTP_USER
    && process.env.SMTP_PASSWORD
    && process.env.SMTP_FROM,
  );
}

export async function sendPasswordResetEmail(email, resetUrl) {
  if (!isEmailConfigured()) {
    throw new Error('SMTP is not configured.');
  }

  const port = Number(process.env.SMTP_PORT) || 587;
  const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port,
    secure: port === 465,
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASSWORD,
    },
  });

  await transporter.sendMail({
    from: process.env.SMTP_FROM,
    to: email,
    subject: 'Reset your SmartQR password',
    text: `Use this link to reset your password. It expires in 30 minutes: ${resetUrl}`,
    html: `<p>Use this link to reset your SmartQR password. It expires in 30 minutes.</p><p><a href="${resetUrl}">Reset password</a></p>`,
  });
}