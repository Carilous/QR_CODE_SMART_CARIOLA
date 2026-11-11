import mongoose from 'mongoose';

const qrCodeSchema = new mongoose.Schema({
  owner: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true,
  },
  document: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Document',
    required: true,
    index: true,
  },
  name: {
    type: String,
    required: true,
    trim: true,
    maxlength: 80,
  },
  uniqueCode: {
    type: String,
    required: true,
    unique: true,
    immutable: true,
    index: true,
  },
  qrMode: {
    type: String,
    enum: ['direct', 'dynamic'],
    default: 'dynamic',
    index: true,
  },
  encodedUrl: {
    type: String,
    trim: true,
    maxlength: 2048,
  },
  destinationType: {
    type: String,
    enum: ['document', 'external'],
    default: 'document',
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
  foregroundColor: {
    type: String,
    match: /^#[a-fA-F0-9]{6}$/,
    default: '#163E2A',
  },
  backgroundColor: {
    type: String,
    match: /^#[a-fA-F0-9]{6}$/,
    default: '#FFFFFF',
  },
  errorCorrectionLevel: {
    type: String,
    enum: ['L', 'M', 'Q', 'H'],
    default: 'H',
  },
  size: {
    type: Number,
    min: 128,
    max: 1024,
    default: 512,
  },
  isActive: {
    type: Boolean,
    default: true,
  },
  expiresAt: {
    type: Date,
    default: null,
    index: true,
  },
}, { timestamps: true });

qrCodeSchema.pre('validate', function validateDestination() {
  if (this.destinationType === 'external' && !this.destinationUrl) {
    this.invalidate('destinationUrl', 'An external QR destination URL is required.');
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
  if (this.qrMode === 'direct' && !this.encodedUrl) {
    this.invalidate('encodedUrl', 'Direct QR codes must store their encoded URL.');
  }
});

qrCodeSchema.index({ owner: 1, updatedAt: -1 });

const QRCode = mongoose.models.QRCode || mongoose.model('QRCode', qrCodeSchema);

export default QRCode;