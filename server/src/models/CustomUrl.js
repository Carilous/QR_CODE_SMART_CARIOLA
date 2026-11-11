import mongoose from 'mongoose';

const customUrlSchema = new mongoose.Schema({
  owner: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true,
  },
  document: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Document',
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
  slug: {
    type: String,
    required: true,
    unique: true,
    lowercase: true,
    trim: true,
    minlength: 3,
    maxlength: 64,
  },
  isActive: {
    type: Boolean,
    default: true,
  },
  expiresAt: {
    type: Date,
    default: null,
  },
}, { timestamps: true });

customUrlSchema.pre('validate', function validateTarget() {
  if (Boolean(this.document) === Boolean(this.destinationUrl)) {
    this.invalidate('destinationUrl', 'Provide exactly one link destination.');
  }
  if (this.destinationUrl) {
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

customUrlSchema.index(
  { owner: 1, document: 1 },
  {
    unique: true,
    name: 'owner_document_unique',
    partialFilterExpression: { document: { $type: 'objectId' } },
  },
);

const CustomUrl = mongoose.models.CustomUrl || mongoose.model('CustomUrl', customUrlSchema);

export default CustomUrl;