import crypto from 'crypto';
import { Schema, model, models, Types } from 'mongoose';
import { ApiKeyScope, PREDEFINED_SCOPES } from '../constants/scopes';

export interface IApiKey {
  _id: Types.ObjectId;
  name: string;
  key: string; // hashed API key
  keyPrefix: string; // first 8 chars of unhashed key for display
  userId: Types.ObjectId;
  clinicId: Types.ObjectId;
  scopes: ApiKeyScope[];
  isActive: boolean;
  lastUsedAt?: Date;
  expiresAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const apiKeySchema = new Schema<IApiKey>(
  {
    name: { type: String, required: true, trim: true },
    key: { type: String, required: true, unique: true, select: false },
    keyPrefix: { type: String, required: true, index: true },
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    clinicId: { type: Schema.Types.ObjectId, ref: 'Clinic', required: true, index: true },
    scopes: {
      type: [String],
      enum: Object.values(PREDEFINED_SCOPES),
      required: true,
      validate: {
        validator: (v: string[]) => v.length > 0,
        message: 'At least one scope is required',
      },
    },
    isActive: { type: Boolean, default: true, index: true },
    lastUsedAt: { type: Date, default: null },
    expiresAt: { type: Date, default: null, index: true },
  },
  { timestamps: true, versionKey: false }
);

// Index for finding active, non-expired keys by prefix
apiKeySchema.index({ keyPrefix: 1, isActive: 1, expiresAt: 1 });
// Index for finding keys by user and clinic
apiKeySchema.index({ userId: 1, clinicId: 1, isActive: 1 });

export const ApiKeyModel = models.ApiKey || model<IApiKey>('ApiKey', apiKeySchema);

/**
 * Hash an API key using SHA-256
 */
export const hashApiKey = (key: string): string => {
  return crypto.createHash('sha256').update(key).digest('hex');
};

/**
 * Generate a new API key
 * Format: hw_<random_32_chars>
 */
export const generateApiKey = (): string => {
  const randomBytes = crypto.randomBytes(24).toString('hex');
  return `hw_${randomBytes}`;
};

/**
 * Get the prefix (first 8 chars after hw_) for display
 */
export const getKeyPrefix = (key: string): string => {
  return key.substring(0, 11); // "hw_" + 8 chars
};
