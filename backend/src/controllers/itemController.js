import { Item } from '../models/Item.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { notFoundError } from '../utils/errors.js';

// Every query is scoped to req.user._id: a user can never read, edit,
// or delete another user's items, even with a guessed id.
const findOwnedItem = async (id, ownerId) => {
  const item = await Item.findOne({ _id: id, owner: ownerId });
  if (!item) throw notFoundError('Item not found');
  return item;
};

// GET /api/items
export const getItems = asyncHandler(async (req, res) => {
  const items = await Item.find({ owner: req.user._id }).sort({ createdAt: -1 });
  res.status(200).json({ success: true, count: items.length, items });
});

// POST /api/items
export const createItem = asyncHandler(async (req, res) => {
  const item = await Item.create({ ...req.body, owner: req.user._id });
  res.status(201).json({ success: true, item });
});

// PUT /api/items/:id
export const updateItem = asyncHandler(async (req, res) => {
  const item = await findOwnedItem(req.params.id, req.user._id);
  Object.assign(item, req.body);
  await item.save();
  res.status(200).json({ success: true, item });
});

// DELETE /api/items/:id
export const deleteItem = asyncHandler(async (req, res) => {
  const item = await findOwnedItem(req.params.id, req.user._id);
  await item.deleteOne();
  res.status(200).json({ success: true, message: 'Item deleted' });
});
