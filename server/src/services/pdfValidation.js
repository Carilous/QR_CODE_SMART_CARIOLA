import { fileTypeFromBuffer } from 'file-type';
import { PDFDocument } from 'pdf-lib';

export class InvalidPdfError extends Error {
  constructor(message) {
    super(message);
    this.name = 'InvalidPdfError';
    this.statusCode = 400;
  }
}

export async function validatePdf(buffer) {
  const type = await fileTypeFromBuffer(buffer);
  if (type?.mime !== 'application/pdf') {
    throw new InvalidPdfError('Only valid PDF files are accepted.');
  }

  try {
    await PDFDocument.load(buffer, { ignoreEncryption: false });
  } catch {
    throw new InvalidPdfError('The PDF file is corrupted or encrypted.');
  }
}