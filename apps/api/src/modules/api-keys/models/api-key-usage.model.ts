import { Schema, model, models, Types } from 'mongoose';

export interface IApiKeyUsage {
  _id: Types.ObjectId;
  apiKeyId: Types.ObjectId;
  userId: Types.ObjectId;
  clinicId: Types.ObjectId;
  method: string;
  endpoint: string;
  statusCode: number;
  scopes: string[];
  scopeGranted: boolean; // whether the requested scope granted access
  ipAddress?: string;
  userAgent?: string;
  errorMessage?: string;
  createdAt: Date;
}

const apiKeyUsageSchema = new Schema<IApiKeyUsage>(
  {
    apiKeyId: { type: Schema.Types.ObjectId, ref: 'ApiKey', required: true, index: true },
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    clinicId: { type: Schema.Types.ObjectId, ref: 'Clinic', required: true, index: true },
    method: { type: String, required: true, enum: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD'] },
    endpoint: { type: String, required: true, index: true },
    statusCode: { type: Number, required: true },
    scopes: { type: [String], required: true },
    scopeGranted: { type: Boolean, required: true, index: true },
    ipAddress: { type: String },
    userAgent: { type: String },
    errorMessage: { type: String },
  },
  { timestamps: false, versionKey: false }
);

// Compound index for querying usage by API key and date
apiKeyUsageSchema.index({ apiKeyId: 1, createdAt: -1 });
// Index for querying failed scope checks
apiKeyUsageSchema.index({ scopeGranted: 1, createdAt: -1 });
// TTL index to auto-delete logs after 90 days
apiKeyUsageSchema.index({ createdAt: 1 }, { expireAfterSeconds: 7776000 });

export const ApiKeyUsageModel = models.ApiKeyUsage || model<IApiKeyUsage>('ApiKeyUsage', apiKeyUsageSchema);
