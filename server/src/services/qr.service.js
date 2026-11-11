import QRCode from 'qrcode';
import { PDFDocument, StandardFonts } from 'pdf-lib';

export function getRedirectUrl(uniqueCode) {
  const appUrl = process.env.PUBLIC_APP_URL || process.env.CLIENT_URL || 'http://localhost:5173';
  return new URL(`/r/${encodeURIComponent(uniqueCode)}`, appUrl).toString();
}

export function getViewerUrl(uniqueCode) {
  const appUrl = process.env.PUBLIC_APP_URL || process.env.CLIENT_URL || 'http://localhost:5173';
  return new URL(`/view/${encodeURIComponent(uniqueCode)}`, appUrl).toString();
}

export function getEncodedUrl(qr) {
  if (qr.encodedUrl) return qr.encodedUrl;
  if (qr.qrMode === 'direct' && qr.destinationType === 'external' && qr.destinationUrl) {
    return qr.destinationUrl;
  }
  return qr.qrMode === 'direct' ? getViewerUrl(qr.uniqueCode) : getRedirectUrl(qr.uniqueCode);
}

function qrOptions(qr) {
  return {
    width: qr.size,
    margin: 4,
    errorCorrectionLevel: qr.errorCorrectionLevel,
    color: {
      dark: qr.foregroundColor,
      light: qr.backgroundColor,
    },
  };
}

export function createQrPng(qr) {
  return QRCode.toBuffer(getEncodedUrl(qr), { ...qrOptions(qr), type: 'png' });
}

export function createQrSvg(qr) {
  return QRCode.toString(getEncodedUrl(qr), { ...qrOptions(qr), type: 'svg' });
}

export async function createQrPdf(qr, title) {
  const imageBytes = await createQrPng(qr);
  const pdf = await PDFDocument.create();
  const page = pdf.addPage([595.28, 841.89]);
  const image = await pdf.embedPng(imageBytes);
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const scale = Math.min(360 / image.width, 360 / image.height);
  const width = image.width * scale;
  const height = image.height * scale;
  const safeTitle = String(title || 'SmartQR code').slice(0, 100);
  const titleWidth = font.widthOfTextAtSize(safeTitle, 16);

  page.drawImage(image, { x: (595.28 - width) / 2, y: 390, width, height });
  page.drawText(safeTitle, {
    x: Math.max(40, (595.28 - titleWidth) / 2),
    y: 350,
    size: 16,
    font,
  });

  return Buffer.from(await pdf.save());
}