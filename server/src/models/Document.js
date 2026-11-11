import mongoose from 'mongoose';

const documentSchema = new mongoose.Schema({
  owner: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true,
  },
  title: {
    type: String,
    required: true,
    trim: true,
    maxlength: 160,
  },
  description: {
    type: String,
    trim: true,
    maxlength: 2000,
    default: '',
  },
  category: {
    type: String,
    trim: true,
    maxlength: 80,
    default: '',
  },
  tags: {
    type: [{ type: String, trim: true, maxlength: 32 }],
    default: [],
  },
  destinationType: {
    type: String,
    enum: ['document', 'external'],
    default: 'document',
    index: true,
  },
  destinationUrl: {
    type: String,
    trim: true,
    maxlength: 2048,
  },
  allowHttp: {
    type: Boolean,
    default: false,
  },
  validationStatus: {
    type: String,
    enum: ['not_checked', 'valid', 'reachable', 'inaccessible', 'timeout', 'inconclusive', 'invalid'],
    default: 'not_checked',
  },
  lastValidatedAt: {
    type: Date,
    default: null,
  },
  storageKey: {
    type: String,
    required: true,
    select: false,
  },
  originalFileName: {
    type: String,
    required: true,
    maxlength: 255,
  },
  mimeType: {
    type: String,
    enum: ['application/pdf'],
    default: 'application/pdf',
    required: true,
  },
  fileSize: {
    type: Number,
    required: true,
    min: 1,
  },
  checksum: {
    type: String,
    required: true,
    match: /^[a-f0-9]{64}$/,
  },
  version: {
    type: Number,
    default: 1,
    min: 1,
  },
  accessType: {
    type: String,
    enum: ['public', 'password', 'private', 'restricted'],
    default: 'private',
  },
  passwordHash: {
    type: String,
    select: false,
  },
  accessVersion: {
    type: Number,
    default: 0,
  },
  allowedEmails: {
    type: [{ type: String, lowercase: true, trim: true }],
    default: [],
  },
  allowDownload: {
    type: Boolean,
    default: true,
  },
  allowPrint: {
    type: Boolean,
    default: true,
  },
  isActive: {
    type: Boolean,
    default: true,
  },
  expiresAt: {
    type: Date,
    default: null,
  },
  archivedAt: {
    type: Date,
    default: null,
  },
}, { timestamps: true });

documentSchema.pre('validate', function validateDestination() {
  if (this.destinationType === 'external' && !this.destinationUrl) {
    this.invalidate('destinationUrl', 'An external destination URL is required.');
  }
  if (this.destinationType === 'external' && this.destinationUrl) {
    try {
      const protocol = new URL(this.destinationUrl).protocol;
      if (protocol === 'http:' && !this.allowHttp) {
        this.invalidate('allowHttp', 'HTTP destinations require explicit opt-in.');
      }
    } catch {
      this.invalidate('destinationUrl', 'Destination URL is malformed.');
    }
  }
});

documentSchema.index({ owner: 1, updatedAt: -1 });
documentSchema.index({ owner: 1, title: 1 });
documentSchema.index({ owner: 1, tags: 1 });

documentSchema.set('toJSON', {
  transform(_document, result) {
    delete result.storageKey;
    delete result.passwordHash;
    delete result.__v;
    return result;
  },
});

const Document = mongoose.models.Document || mongoose.model('Document', documentSchema);

export default Document;