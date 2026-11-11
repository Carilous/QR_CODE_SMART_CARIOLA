import bcrypt from 'bcryptjs';
import { createHash, randomUUID } from 'node:crypto';
import { pipeline } from 'node:stream/promises';
import mongoose from 'mongoose';
import CustomUrl from '../models/CustomUrl.js';
import Document from '../models/Document.js';
import QRCode from '../models/QRCode.js';
import Scan from '../models/Scan.js';
import { openDocument, removeDocument, storeDocument } from '../services/documentStorage.js';
import { validatePdf } from '../services/pdfValidation.js';
import { getEncodedUrl, getRedirectUrl, getViewerUrl } from '../services/qr.service.js';
import { checkDestinationReachability, validateDestinationUrl } from '../services/urlValidation.js';
import { documentMetadataSchema, documentUploadSchema, listDocumentsSchema } from '../utils/document.validation.js';

function publicDocument(document) {
  return {
    id: document.id,
    title: document.title,
    description: document.description,
    category: document.category,
    tags: document.tags,
    destinationType: document.destinationType,
    destinationUrl: document.destinationUrl || null,
    allowHttp: document.allowHttp,
    validationStatus: document.validationStatus,
    lastValidatedAt: document.lastValidatedAt,
    originalFileName: document.originalFileName,
    mimeType: document.mimeType,
    fileSize: document.fileSize,
    version: document.version,
    accessType: document.accessType,
    allowDownload: document.allowDownload,
    allowPrint: document.allowPrint,
    isActive: document.isActive,
    expiresAt: document.expiresAt,
    createdAt: document.createdAt,
    updatedAt: document.updatedAt,
  };
}

function safeFileName(fileName) {
  return fileName.replace(/[\r\n"\\/]/g, '_').slice(0, 255) || 'document.pdf';
}

function storageKeyFor(ownerId) {
  return `${ownerId}/${randomUUID()}.pdf`;
}

async function validateUpload(request) {
  if (!request.file) {
    const error = new Error('Choose a PDF file to upload.');
    error.statusCode = 400;
    throw error;
  }
  await validatePdf(request.file.buffer);
  return documentUploadSchema.parse(request.body);
}

async function applyDocumentMetadata(document, metadata) {
  const {
    accessType,
    allowedEmails,
    allowDownload,
    allowPrint,
    expiresAt,
    destinationType,
    destinationUrl,
    allowHttp,
    password,
    ...contentMetadata
  } = metadata;
  const previousAccessType = document.accessType;
  const previousEmails = document.allowedEmails.join(',');
  const previousExpiration = document.expiresAt?.getTime() ?? null;
  const previousDestination = `${document.destinationType}:${document.destinationUrl || ''}`;

  Object.assign(document, contentMetadata);
  if (accessType !== undefined) document.accessType = accessType;
  if (allowedEmails !== undefined) document.allowedEmails = allowedEmails;
  if (allowDownload !== undefined) document.allowDownload = allowDownload;
  if (allowPrint !== undefined) document.allowPrint = allowPrint;
  if (expiresAt !== undefined) document.expiresAt = expiresAt;
  if (destinationType !== undefined) document.destinationType = destinationType;
  if (destinationUrl !== undefined || Object.hasOwn(metadata, 'destinationUrl')) {
    document.destinationUrl = destinationUrl || undefined;
  }
  if (allowHttp !== undefined) document.allowHttp = allowHttp;
  if (document.destinationType === 'document') document.destinationUrl = undefined;

  const destinationChanged = previousDestination !== `${document.destinationType}:${document.destinationUrl || ''}`;
  if (destinationChanged) {
    document.validationStatus = 'not_checked';
    document.lastValidatedAt = null;
  }

  if (password) {
    document.passwordHash = await bcrypt.hash(password, 12);
  } else if (document.accessType !== 'password') {
    document.passwordHash = undefined;
  }

  if (document.accessType === 'password' && !document.passwordHash) {
    const error = new Error('A password is required for password-protected documents.');
    error.statusCode = 400;
    throw error;
  }
  if (document.accessType === 'restricted' && document.allowedEmails.length === 0) {
    const error = new Error('Add at least one allowed email for restricted documents.');
    error.statusCode = 400;
    throw error;
  }
  if (document.accessType !== 'restricted') document.allowedEmails = [];

  const accessChanged = previousAccessType !== document.accessType
    || previousEmails !== document.allowedEmails.join(',')
    || previousExpiration !== (document.expiresAt?.getTime() ?? null);
  if (accessChanged || password) document.accessVersion += 1;
}

function cleanSearch(search) {
  return search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export async function listDocuments(request, response) {
  const query = listDocumentsSchema.parse(request.query);
  const filter = { owner: request.user._id, archivedAt: null };
  if (query.destinationType) filter.destinationType = query.destinationType;
  if (query.validationStatus) filter.validationStatus = query.validationStatus;
  if (query.qrMode) {
    filter._id = {
      $in: await QRCode.distinct('document', { owner: request.user._id, qrMode: query.qrMode }),
    };
  }
  if (query.search) {
    const expression = new RegExp(cleanSearch(query.search), 'i');
    filter.$or = [
      { title: expression },
      { originalFileName: expression },
      { tags: expression },
      { category: expression },
      { destinationUrl: expression },
    ];
  }

  const sort = query.sort === 'title'
    ? { title: 1 }
    : query.sort === 'oldest'
      ? { createdAt: 1 }
      : { createdAt: -1 };
  const [documents, total] = await Promise.all([
    Document.find(filter).sort(sort).skip((query.page - 1) * query.limit).limit(query.limit),
    Document.countDocuments(filter),
  ]);
  const documentIds = documents.map((document) => document._id);
  const [qrCodes, scanCounts] = await Promise.all([
    documentIds.length
      ? QRCode.find({ owner: request.user._id, document: { $in: documentIds } }).sort({ updatedAt: -1 }).lean()
      : [],
    documentIds.length
      ? Scan.aggregate([
        { $match: { qrCode: { $in: await QRCode.distinct('_id', { owner: request.user._id, document: { $in: documentIds } }) } } },
        { $group: { _id: '$qrCode', total: { $sum: 1 } } },
      ])
      : [],
  ]);
  const qrsByDocument = new Map();
  for (const qr of qrCodes) {
    const key = String(qr.document);
    const items = qrsByDocument.get(key) || [];
    items.push({
      id: String(qr._id),
      uniqueCode: qr.uniqueCode,
      qrMode: qr.qrMode || 'dynamic',
      destinationType: qr.destinationType || 'document',
      destinationUrl: qr.destinationUrl || null,
      encodedUrl: getEncodedUrl(qr),
      isActive: qr.isActive,
      expiresAt: qr.expiresAt || null,
      scanCount: 0,
    });
    qrsByDocument.set(key, items);
  }
  const scanCountsByQr = new Map(scanCounts.map((scan) => [String(scan._id), scan.total]));
  for (const qrList of qrsByDocument.values()) {
    for (const qr of qrList) qr.scanCount = scanCountsByQr.get(qr.id) || 0;
  }

  return response.json({
    documents: documents.map((document) => ({
      ...publicDocument(document),
      qrCodes: qrsByDocument.get(String(document._id)) || [],
    })),
    pagination: { page: query.page, limit: query.limit, total, pages: Math.ceil(total / query.limit) },
  });
}

export async function createDocument(request, response) {
  const metadata = await validateUpload(request);
  const fileName = safeFileName(request.file.originalname);
  const storageKey = storageKeyFor(request.user.id);
  await storeDocument(storageKey, request.file.buffer);

  try {
    const document = new Document({
      owner: request.user._id,
      title: metadata.title || fileName.replace(/\.pdf$/i, ''),
      description: metadata.description || '',
      category: metadata.category || '',
      tags: metadata.tags || [],
      storageKey,
      originalFileName: fileName,
      fileSize: request.file.size,
      checksum: createHash('sha256').update(request.file.buffer).digest('hex'),
    });
    await applyDocumentMetadata(document, metadata);
    await document.save();
    return response.status(201).json({ document: publicDocument(document) });
  } catch (error) {
    await removeDocument(storageKey);
    throw error;
  }
}

export async function getDocument(request, response) {
  if (!mongoose.isValidObjectId(request.params.id)) {
    return response.status(404).json({ error: 'Document not found.' });
  }
  const document = await Document.findOne({ _id: request.params.id, owner: request.user._id, archivedAt: null });
  if (!document) return response.status(404).json({ error: 'Document not found.' });
  return response.json({ document: publicDocument(document) });
}

async function findOwnedExternalDestination(request, response) {
  if (!mongoose.isValidObjectId(request.params.id)) {
    response.status(404).json({ error: 'Document not found.' });
    return null;
  }
  const document = await Document.findOne({
    _id: request.params.id,
    owner: request.user._id,
    archivedAt: null,
  });
  if (!document) {
    response.status(404).json({ error: 'Document not found.' });
    return null;
  }
  if (document.destinationType !== 'external' || !document.destinationUrl) {
    response.status(400).json({ error: 'This document does not have an external destination URL.' });
    return null;
  }
  return document;
}

export async function validateDocumentDestination(request, response) {
  const document = await findOwnedExternalDestination(request, response);
  if (!document) return;
  const result = validateDestinationUrl(document.destinationUrl, { allowHttp: document.allowHttp });
  document.validationStatus = result.status;
  document.lastValidatedAt = new Date();
  if (result.valid) document.destinationUrl = result.normalizedUrl;
  await document.save();
  return response.json({ ...result, document: publicDocument(document) });
}

export async function verifyDocumentDestination(request, response) {
  const document = await findOwnedExternalDestination(request, response);
  if (!document) return;
  const result = await checkDestinationReachability(document.destinationUrl, { allowHttp: document.allowHttp });
  document.validationStatus = result.status;
  document.lastValidatedAt = new Date();
  if (result.valid) document.destinationUrl = result.normalizedUrl;
  await document.save();
  return response.json({ ...result, document: publicDocument(document) });
}

export async function updateDocument(request, response) {
  if (!mongoose.isValidObjectId(request.params.id)) {
    return response.status(404).json({ error: 'Document not found.' });
  }
  const metadata = documentMetadataSchema.partial().parse(request.body);
  const document = await Document.findOne({ _id: request.params.id, owner: request.user._id, archivedAt: null }).select('+passwordHash');
  if (!document) return response.status(404).json({ error: 'Document not found.' });

  const previousDestination = `${document.destinationType}:${document.destinationUrl || ''}`;
  await applyDocumentMetadata(document, metadata);
  await document.save();
  const nextDestination = `${document.destinationType}:${document.destinationUrl || ''}`;
  if (previousDestination !== nextDestination) {
    const qrCodes = await QRCode.find({ owner: request.user._id, document: document._id });
    await Promise.all(qrCodes.map(async (qr) => {
      qr.destinationType = document.destinationType;
      qr.destinationUrl = document.destinationType === 'external'
        ? document.destinationUrl
        : getViewerUrl(qr.uniqueCode);
      qr.encodedUrl = qr.qrMode === 'direct'
        ? qr.destinationUrl
        : getRedirectUrl(qr.uniqueCode);
      await qr.save();
    }));
  }
  return response.json({ document: publicDocument(document) });
}

export async function replaceDocument(request, response) {
  if (!mongoose.isValidObjectId(request.params.id)) {
    return response.status(404).json({ error: 'Document not found.' });
  }
  const document = await Document.findOne({ _id: request.params.id, owner: request.user._id, archivedAt: null }).select('+storageKey +passwordHash');
  if (!document) return response.status(404).json({ error: 'Document not found.' });
  const metadata = await validateUpload(request);

  const previousStorageKey = document.storageKey;
  const nextStorageKey = storageKeyFor(request.user.id);
  const nextFileName = safeFileName(request.file.originalname);
  await storeDocument(nextStorageKey, request.file.buffer);

  try {
    document.storageKey = nextStorageKey;
    document.originalFileName = nextFileName;
    document.mimeType = 'application/pdf';
    document.fileSize = request.file.size;
    document.checksum = createHash('sha256').update(request.file.buffer).digest('hex');
    document.version += 1;
    await applyDocumentMetadata(document, metadata);
    await document.save();
  } catch (error) {
    await removeDocument(nextStorageKey);
    throw error;
  }

  try {
    await removeDocument(previousStorageKey);
  } catch (error) {
    console.error(`Old document version cleanup failed for ${document.id}: ${error.message}`);
  }

  return response.json({ document: publicDocument(document) });
}

export async function deleteDocument(request, response) {
  if (!mongoose.isValidObjectId(request.params.id)) {
    return response.status(404).json({ error: 'Document not found.' });
  }
  const document = await Document.findOne({ _id: request.params.id, owner: request.user._id, archivedAt: null }).select('+storageKey');
  if (!document) return response.status(404).json({ error: 'Document not found.' });

  await removeDocument(document.storageKey);
  await Promise.all([
    QRCode.updateMany({ document: document._id }, { isActive: false }),
    CustomUrl.updateMany({ document: document._id }, { isActive: false }),
  ]);
  await document.deleteOne();
  return response.status(204).end();
}

export async function previewDocument(request, response, next) {
  if (!mongoose.isValidObjectId(request.params.id)) {
    return response.status(404).json({ error: 'Document not found.' });
  }
  const document = await Document.findOne({ _id: request.params.id, owner: request.user._id, archivedAt: null }).select('+storageKey');
  if (!document) return response.status(404).json({ error: 'Document not found.' });

  try {
    const stream = await openDocument(document.storageKey);
    response.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': `inline; filename="${safeFileName(document.originalFileName)}"`,
      'Content-Length': String(document.fileSize),
      'Cache-Control': 'private, no-store',
      'X-Content-Type-Options': 'nosniff',
    });
    await pipeline(stream, response);
  } catch (error) {
    if (response.headersSent) return response.destroy(error);
    return next(error);
  }
}