import mongoose from 'mongoose';

// Append-only by design: no update/delete route exists for this model.
const auditSchema = new mongoose.Schema(
  {
    actor: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    action: { type: String, required: true, trim: true, maxlength: 100 },
    entity: { type: String, required: true, trim: true, maxlength: 100 },
    entityId: { type: String, default: '' },
    before: { type: mongoose.Schema.Types.Mixed, default: null },
    after: { type: mongoose.Schema.Types.Mixed, default: null },
  },
  { timestamps: true },
);

export const AuditLog = mongoose.model('AuditLog', auditSchema);
