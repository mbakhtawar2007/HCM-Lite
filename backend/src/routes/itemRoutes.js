import express from 'express';
import {
  createItem,
  deleteItem,
  getItems,
  updateItem,
} from '../controllers/itemController.js';
import { protect } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { createItemSchema, updateItemSchema } from '../validation/itemValidation.js';

const router = express.Router();

// Everything under /api/items requires a valid token.
router.use(protect);

router.route('/').get(getItems).post(validate(createItemSchema), createItem);
router
  .route('/:id')
  .put(validate(updateItemSchema), updateItem)
  .delete(deleteItem);

export default router;
