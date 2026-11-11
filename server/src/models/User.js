import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';

const userSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    trim: true,
    minlength: 2,
    maxlength: 80,
  },
  email: {
    type: String,
    required: true,
    unique: true,
    lowercase: true,
    trim: true,
    maxlength: 254,
  },
  passwordHash: {
    type: String,
    required: true,
    select: false,
  },
  role: {
    type: String,
    enum: ['super_admin', 'admin', 'user'],
    default: 'user',
    required: true,
  },
  status: {
    type: String,
    enum: ['active', 'suspended'],
    default: 'active',
    required: true,
  },
  authVersion: {
    type: Number,
    default: 0,
  },
  passwordResetTokenHash: {
    type: String,
    select: false,
  },
  passwordResetExpiresAt: {
    type: Date,
    select: false,
  },
}, { timestamps: true });

userSchema.index({ role: 1 }, {
  unique: true,
  partialFilterExpression: { role: 'super_admin' },
});

userSchema.methods.verifyPassword = function verifyPassword(password) {
  return bcrypt.compare(password, this.passwordHash);
};

userSchema.set('toJSON', {
  transform(_document, result) {
    delete result.passwordHash;
    delete result.passwordResetTokenHash;
    delete result.passwordResetExpiresAt;
    delete result.__v;
    return result;
  },
});

const User = mongoose.models.User || mongoose.model('User', userSchema);

export default User;