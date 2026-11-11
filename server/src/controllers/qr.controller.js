import { randomBytes } from 'node:crypto';
import mongoose from 'mongoose';
import ActivityLog from '../models/ActivityLog.js';
import Document from '../models/Document.js';
import QRCode from '../models/QRCode.js';
import {
  createQrPdf,
  createQrPng,
  createQrSvg,
  getEncodedUrl,
  getRedirectUrl,
  getViewerUrl,
} from '../services/qr.service.js';
import {
  changeDestinationSchema,
  createQrSchema,
  qrDownloadSchema,
  updateQrSchema,
} from '../utils/qr.validation.js';

function publicQr(qr) {
  const document = qr.document && typeof qr.document === 'object'
    ? { id: qr.document.id, title: qr.document.title }
    : { id: String(qr.document) };
  return {
    id: qr.id,
    document,
    name: qr.name,
    uniqueCode: qr.uniqueCode,
    qrMode: qr.qrMode || 'dynamic',
    destinationType: qr.destinationType || 'document',
    destinationUrl: qr.destinationUrl || (qr.destinationType === 'external' ? null : getViewerUrl(qr.uniqueCode)),
    encodedUrl: getEncodedUrl(qr),
    qrUrl: getEncodedUrl(qr),
    redirectUrl: getRedirectUrl(qr.uniqueCode),
    foregroundColor: qr.foregroundColor,
    backgroundColor: qr.backgroundColor,
    errorCorrectionLevel: qr.errorCorrectionLevel,
    size: qr.size,
    isActive: qr.isActive,
    createdAt: qr.createdAt,
    updatedAt: qr.updatedAt,
  };
}

async function findOwnedQr(id, ownerId) {
  if (!mongoose.isValidObjectId(id)) return null;
  return QRCode.findOne({ _id: id, owner: ownerId }).populate('document', 'title');
}

export async function listQrs(request, response) {
  const filter = { owner: request.user._id };
  if (typeof request.query.documentId === 'string' && mongoose.isValidObjectId(request.query.documentId)) {
    filter.document = request.query.documentId;
  }
  const qrs = await QRCode.find(filter).populate('document', 'title').sort({ createdAt: -1 });
  return response.json({ qrs: qrs.map(publicQr) });
}

export async function createQr(request, response) {
  const input = createQrSchema.parse(request.body);
  const document = await Document.findOne({
    _id: input.documentId,
    owner: request.user._id,
    archivedAt: null,
  });
  if (!document) return response.status(404).json({ error: 'Document not found.' });

  const uniqueCode = randomBytes(9).toString('base64url');
  const qrMode = input.qrMode || 'dynamic';
  const destinationType = input.destinationType || document.destinationType || 'document';
  const destinationUrl = destinationType === 'external'
    ? input.destinationUrl || document.destinationUrl
    : getViewerUrl(uniqueCode);
  if (destinationType === 'external' && !destinationUrl) {
    return response.status(400).json({ error: 'Choose a valid external destination URL.' });
  }

  const qr = await QRCode.create({
    owner: request.user._id,
    document: document._id,
    name: input.name,
    uniqueCode,
    qrMode,
    destinationType,
    destinationUrl,
    encodedUrl: qrMode === 'direct' ? destinationUrl : getRedirectUrl(uniqueCode),
    expiresAt: null,
    foregroundColor: input.foregroundColor,
    backgroundColor: input.backgroundColor,
    errorCorrectionLevel: input.errorCorrectionLevel,
    size: input.size,
  });
  await qr.populate('document', 'title');
  return response.status(201).json({ qr: { ...publicQr(qr), previewDataUrl: await createQrPngDataUrl(qr) } });
}

async function createQrPngDataUrl(qr) {
  const png = await createQrPng(qr);
  return `data:image/png;base64,${png.toString('base64')}`;
}

export async function getQr(request, response) {
  const qr = await findOwnedQr(request.params.id, request.user._id);
  if (!qr) return response.status(404).json({ error: 'QR code not found.' });
  return response.json({ qr: { ...publicQr(qr), previewDataUrl: await createQrPngDataUrl(qr) } });
}

export async function updateQr(request, response) {
  if (!mongoose.isValidObjectId(request.params.id)) {
    return response.status(404).json({ error: 'QR code not found.' });
  }
  const qr = await findOwnedQr(request.params.id, request.user._id);
  if (!qr) return response.status(404).json({ error: 'QR code not found.' });
  const input = updateQrSchema.parse(request.body);
  Object.assign(qr, input);
  if (input.destinationUrl !== undefined && input.destinationType === undefined) {
    qr.destinationType = 'external';
  }
  if (qr.destinationType === 'document') qr.destinationUrl = getViewerUrl(qr.uniqueCode);
  if (qr.destinationType === 'external' && !qr.destinationUrl) {
    return response.status(400).json({ error: 'Choose a valid external destination URL.' });
  }
  qr.encodedUrl = qr.qrMode === 'direct'
    ? qr.destinationUrl
    : getRedirectUrl(qr.uniqueCode);
  await qr.save();
  return response.json({ qr: { ...publicQr(qr), previewDataUrl: await createQrPngDataUrl(qr) } });
}

export async function deleteQr(request, response) {
  if (!mongoose.isValidObjectId(request.params.id)) {
    return response.status(404).json({ error: 'QR code not found.' });
  }
  const qr = await QRCode.findOne({ _id: request.params.id, owner: request.user._id });
  if (!qr) return response.status(404).json({ error: 'QR code not found.' });
  qr.isActive = false;
  await qr.save();
  return response.status(204).end();
}

export async function downloadQr(request, response) {
  const qr = await findOwnedQr(request.params.id, request.user._id);
  if (!qr) return response.status(404).json({ error: 'QR code not found.' });
  const format = qrDownloadSchema.parse(request.query.format || 'png');
  const fileName = `smartqr-${qr.uniqueCode}`;
  let bytes;
  let contentType;

  if (format === 'svg') {
    bytes = Buffer.from(await createQrSvg(qr));
    contentType = 'image/svg+xml';
  } else if (format === 'pdf') {
    bytes = await createQrPdf(qr, qr.name);
    contentType = 'application/pdf';
  } else {
    bytes = await createQrPng(qr);
    contentType = 'image/png';
  }

  response.set({
    'Content-Type': contentType,
    'Content-Length': String(bytes.length),
    'Content-Disposition': `attachment; filename="${fileName}.${format}"`,
    'Cache-Control': 'private, no-store',
  });
  return response.send(bytes);
}

export async function changeDestination(request, response) {
  const input = changeDestinationSchema.parse(request.body);
  if (!mongoose.isValidObjectId(request.params.id)) {
    return response.status(404).json({ error: 'QR code not found.' });
  }
  const qr = await QRCode.findOne({ _id: request.params.id, owner: request.user._id });
  if (!qr) return response.status(404).json({ error: 'QR code not found.' });
  const previousDestination = {
    document: qr.document,
    destinationType: qr.destinationType,
    destinationUrl: qr.destinationUrl,
    encodedUrl: qr.encodedUrl,
    qrMode: qr.qrMode,
    expiresAt: qr.expiresAt,
  };
  let document = null;
  if (input.documentId) {
    document = await Document.findOne({
      _id: input.documentId,
      owner: request.user._id,
      archivedAt: null,
    });
    if (!document) return response.status(404).json({ error: 'Document not found.' });
    qr.document = document._id;
    qr.destinationType = 'document';
    qr.destinationUrl = getViewerUrl(qr.uniqueCode);
  } else {
    qr.destinationType = 'external';
    qr.destinationUrl = input.destinationUrl;
  }
  if (input.qrMode) qr.qrMode = input.qrMode;
  if (input.expiresAt !== undefined) qr.expiresAt = input.expiresAt;
  qr.encodedUrl = qr.qrMode === 'direct'
    ? qr.destinationUrl
    : getRedirectUrl(qr.uniqueCode);
  await qr.save();

  try {
    await ActivityLog.create({
      user: request.user._id,
      action: 'qr.destination.changed',
      entityType: 'qr',
      entityId: qr._id,
      description: `Changed destination for QR code “${qr.name}”.`,
      changes: {
        fromDocumentId: String(previousDestination.document),
        toDocumentId: document ? String(document._id) : null,
        toDestinationType: qr.destinationType,
        toDestinationUrl: qr.destinationUrl,
        qrMode: qr.qrMode,
      },
    });
  } catch (error) {
    Object.assign(qr, previousDestination);
    await qr.save();
    throw error;
  }

  await qr.populate('document', 'title');
  return response.json({ qr: { ...publicQr(qr), previewDataUrl: await createQrPngDataUrl(qr) } });
}