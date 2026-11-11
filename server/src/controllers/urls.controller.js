import mongoose from 'mongoose';
import CustomUrl from '../models/CustomUrl.js';
import Document from '../models/Document.js';
import { createUrlSchema, slugSchema, updateUrlSchema } from '../utils/url.validation.js';

function publicUrl(slug) {
  const appUrl = process.env.PUBLIC_APP_URL || process.env.CLIENT_URL || 'http://localhost:5173';
  return new URL(`/d/${encodeURIComponent(slug)}`, appUrl).toString();
}

function publicLink(link) {
  const document = link.document && typeof link.document === 'object'
    ? { id: link.document.id, title: link.document.title }
    : null;
  return {
    id: link.id,
    document,
    destinationUrl: link.destinationUrl || null,
    allowHttp: link.allowHttp,
    slug: link.slug,
    url: publicUrl(link.slug),
    isActive: link.isActive,
    expiresAt: link.expiresAt,
    createdAt: link.createdAt,
    updatedAt: link.updatedAt,
  };
}

export async function checkSlug(request, response) {
  const slug = slugSchema.parse(request.params.slug);
  const excludeId = request.query.excludeId;
  const excluded = typeof excludeId === 'string' && mongoose.isValidObjectId(excludeId)
    ? excludeId
    : null;
  const exists = await CustomUrl.exists({ slug, ...(excluded ? { _id: { $ne: excluded } } : {}) });
  return response.json({ slug, available: !exists, url: publicUrl(slug) });
}

export async function listUrls(request, response) {
  const links = await CustomUrl.find({ owner: request.user._id })
    .populate('document', 'title')
    .sort({ updatedAt: -1 });
  return response.json({ urls: links.map(publicLink) });
}

export async function createUrl(request, response) {
  const input = createUrlSchema.parse(request.body);
  let document = null;
  if (input.documentId) {
    document = await Document.findOne({
      _id: input.documentId,
      owner: request.user._id,
      archivedAt: null,
    });
    if (!document) return response.status(404).json({ error: 'Document not found.' });
  }

  const link = await CustomUrl.create({
    owner: request.user._id,
    document: document?._id,
    destinationUrl: input.destinationUrl,
    allowHttp: input.allowHttp,
    slug: input.slug,
    expiresAt: null,
  });
  if (document) await link.populate('document', 'title');
  return response.status(201).json({ url: publicLink(link) });
}

export async function updateUrl(request, response) {
  if (!mongoose.isValidObjectId(request.params.id)) {
    return response.status(404).json({ error: 'URL not found.' });
  }
  const input = updateUrlSchema.parse(request.body);
  const link = await CustomUrl.findOne({ _id: request.params.id, owner: request.user._id });
  if (!link) return response.status(404).json({ error: 'URL not found.' });

  if (input.documentId) {
    const document = await Document.findOne({
      _id: input.documentId,
      owner: request.user._id,
      archivedAt: null,
    });
    if (!document) return response.status(404).json({ error: 'Document not found.' });
    link.document = document._id;
    link.destinationUrl = undefined;
  } else if (Object.hasOwn(input, 'destinationUrl')) {
    link.document = undefined;
    link.destinationUrl = input.destinationUrl;
  }

  if (input.slug !== undefined) link.slug = input.slug;
  if (input.expiresAt !== undefined) link.expiresAt = input.expiresAt;
  if (input.isActive !== undefined) link.isActive = input.isActive;
  await link.save();
  if (link.document) await link.populate('document', 'title');
  return response.json({ url: publicLink(link) });
}

export async function deleteUrl(request, response) {
  if (!mongoose.isValidObjectId(request.params.id)) {
    return response.status(404).json({ error: 'URL not found.' });
  }
  const link = await CustomUrl.findOneAndDelete({ _id: request.params.id, owner: request.user._id });
  if (!link) return response.status(404).json({ error: 'URL not found.' });
  return response.status(204).end();
}
