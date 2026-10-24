import mongoose from 'mongoose';

// Example resource: copy this model + its controller + route when you add
// a real feature, then rename it and delete this file. Every item belongs
// to the user who created it, so users can only see their own items.
const itemSchema = new mongoose.Schema(
  {
    title: { type: String, required: true, trim: true, maxlength: 100 },
    description: { type: String, trim: true, maxlength: 500, default: '' },
    completed: { type: Boolean, default: false },
    owner: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  },
  { timestamps: true },
);

itemSchema.index({ owner: 1, createdAt: -1 });

export const Item = mongoose.model('Item', itemSchema);
