import mongoose from 'mongoose';
import ActivityLog from '../models/ActivityLog.js';
import CustomUrl from '../models/CustomUrl.js';
import Document from '../models/Document.js';
import QRCode from '../models/QRCode.js';
import Scan from '../models/Scan.js';
import { z } from 'zod';

const daysSchema = z.coerce.number().int().min(1).max(365).default(30);

async function ownedDocumentIds(ownerId) {
  return Document.distinct('_id', { owner: ownerId, archivedAt: null });
}

async function ownedCustomUrlIds(ownerId) {
  return CustomUrl.distinct('_id', { owner: ownerId });
}

export async function getOverview(request, response) {
  const ownerId = request.user._id;
  const [totalDocuments, totalQrs, activeLinks, protectedDocuments, documentIds, recentActivity] = await Promise.all([
    Document.countDocuments({ owner: ownerId, archivedAt: null }),
    QRCode.countDocuments({ owner: ownerId }),
    CustomUrl.countDocuments({ owner: ownerId, isActive: true, $or: [{ expiresAt: null }, { expiresAt: { $gt: new Date() } }] }),
    Document.countDocuments({ owner: ownerId, accessType: { $ne: 'public' }, archivedAt: null }),
    ownedDocumentIds(ownerId),
    ActivityLog.find({ user: ownerId }).sort({ timestamp: -1 }).limit(8).lean(),
  ]);

  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const customUrlIds = await ownedCustomUrlIds(ownerId);
  const scanScope = { $or: [
    { document: { $in: documentIds } },
    { customUrl: { $in: customUrlIds } },
  ] };
  const [totalScans, uniqueVisitors] = await Promise.all([
    Scan.countDocuments({ ...scanScope, timestamp: { $gte: thirtyDaysAgo } }),
    Scan.distinct('anonymousSessionId', { ...scanScope, timestamp: { $gte: thirtyDaysAgo } }),
  ]);

  return response.json({
    overview: {
      totalDocuments,
      totalQrs,
      totalScans,
      uniqueVisitors: uniqueVisitors.length,
      activeLinks,
      protectedDocuments,
    },
    recentActivity,
  });
}

export async function getScans(request, response) {
  const days = daysSchema.parse(request.query.days);
  const [documentIds, customUrlIds] = await Promise.all([
    ownedDocumentIds(request.user._id),
    ownedCustomUrlIds(request.user._id),
  ]);
  if (documentIds.length === 0 && customUrlIds.length === 0) {
    return response.json({ scans: [], devices: [], total: 0 });
  }

  const start = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  const scanScope = { $or: [
    { document: { $in: documentIds } },
    { customUrl: { $in: customUrlIds } },
  ] };
  const [scans, devices, total] = await Promise.all([
    Scan.aggregate([
      { $match: { ...scanScope, timestamp: { $gte: start } } },
      { $group: { _id: { $dateToString: { format: '%Y-%m-%d', date: '$timestamp' } }, scans: { $sum: 1 } } },
      { $sort: { _id: 1 } },
    ]),
    Scan.aggregate([
      { $match: { ...scanScope, timestamp: { $gte: start } } },
      { $group: { _id: '$deviceType', scans: { $sum: 1 } } },
      { $sort: { scans: -1 } },
    ]),
    Scan.countDocuments({ ...scanScope, timestamp: { $gte: start } }),
  ]);

  return response.json({
    scans: scans.map((item) => ({ date: item._id, scans: item.scans })),
    devices: devices.map((item) => ({ device: item._id, scans: item.scans })),
    total,
  });
}

export async function getDocumentAnalytics(request, response) {
  const documents = await Document.aggregate([
    { $match: { owner: request.user._id, archivedAt: null } },
    { $lookup: { from: 'scans', localField: '_id', foreignField: 'document', as: 'scanRecords' } },
    {
      $project: {
        id: '$_id',
        title: 1,
        version: 1,
        accessType: 1,
        scans: { $size: '$scanRecords' },
      },
    },
    { $sort: { scans: -1, title: 1 } },
    { $limit: 50 },
  ]);
  return response.json({ documents });
}

export async function getQrAnalytics(request, response) {
  if (!mongoose.isValidObjectId(request.params.id)) {
    return response.status(404).json({ error: 'QR code not found.' });
  }
  const qr = await QRCode.findOne({ _id: request.params.id, owner: request.user._id }).select('_id name uniqueCode');
  if (!qr) return response.status(404).json({ error: 'QR code not found.' });

  const [scans, uniqueVisitors, devices] = await Promise.all([
    Scan.aggregate([
      { $match: { qrCode: qr._id } },
      { $group: { _id: { $dateToString: { format: '%Y-%m-%d', date: '$timestamp' } }, scans: { $sum: 1 } } },
      { $sort: { _id: 1 } },
    ]),
    Scan.distinct('anonymousSessionId', { qrCode: qr._id }),
    Scan.aggregate([
      { $match: { qrCode: qr._id } },
      { $group: { _id: '$deviceType', scans: { $sum: 1 } } },
      { $sort: { scans: -1 } },
    ]),
  ]);

  return response.json({
    qr: { id: qr.id, name: qr.name, uniqueCode: qr.uniqueCode },
    scans: scans.map((item) => ({ date: item._id, scans: item.scans })),
    uniqueVisitors: uniqueVisitors.length,
    devices: devices.map((item) => ({ device: item._id, scans: item.scans })),
  });
}