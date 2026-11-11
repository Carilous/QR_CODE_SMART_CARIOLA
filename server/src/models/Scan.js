import mongoose from 'mongoose';

const scanSchema = new mongoose.Schema({
  qrCode: { type: mongoose.Schema.Types.ObjectId, ref: 'QRCode', default: null, index: true },
  customUrl: { type: mongoose.Schema.Types.ObjectId, ref: 'CustomUrl', default: null },
  document: { type: mongoose.Schema.Types.ObjectId, ref: 'Document', default: null, index: true },
  source: { type: String, enum: ['qr', 'custom_url'], required: true },
  timestamp: { type: Date, default: Date.now, index: true },
  deviceType: { type: String, enum: ['mobile', 'tablet', 'desktop', 'unknown'], default: 'unknown' },
  browser: { type: String, enum: ['Chrome', 'Firefox', 'Safari', 'Edge', 'Opera', 'Other'], default: 'Other' },
  operatingSystem: { type: String, enum: ['iOS', 'Android', 'Windows', 'macOS', 'Linux', 'Other'], default: 'Other' },
  anonymousSessionId: { type: String, required: true, select: false },
  dedupeKey: { type: String, required: true, unique: true, select: false },
  referrer: { type: String, maxlength: 500, default: '' },
}, { timestamps: false });

scanSchema.index({ qrCode: 1, timestamp: -1 });
scanSchema.index({ document: 1, timestamp: -1 });
scanSchema.index({ anonymousSessionId: 1, timestamp: -1 });

const Scan = mongoose.models.Scan || mongoose.model('Scan', scanSchema);

export default Scan;