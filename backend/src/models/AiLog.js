import mongoose from 'mongoose';

// P3 — one row per AI request, so the ~20/hour rate limit can be
// enforced by counting rows (works across serverless instances, where
// in-memory counters would not). Never stores salary data, prompts
// containing salary figures, or the API key — only the endpoint, the
// tool names used, and a generic success/error flag.
const aiLogSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    endpoint: { type: String, enum: ['chat', 'dashboard-summary', 'smart-leave'], required: true },
    toolsUsed: { type: [String], default: [] },
    success: { type: Boolean, default: true },
    error: { type: String, default: null, maxlength: 200 },
    latencyMs: { type: Number, default: null },
  },
  { timestamps: true },
);

aiLogSchema.index({ user: 1, createdAt: -1 });

export const AiLog = mongoose.model('AiLog', aiLogSchema);
