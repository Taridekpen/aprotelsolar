import { Schema, Types, model, type InferSchemaType } from 'mongoose';

const MOVEMENT_TYPES = [
  'receipt',
  'adjustment',
  'transfer_out',
  'transfer_in',
  'reservation',
  'reservation_release',
  'sale',
  'reservation_expiry',
] as const;

const stockLevelSchema = new Schema(
  {
    productId: { type: Types.ObjectId, ref: 'Product', required: true },
    branchId: { type: Types.ObjectId, ref: 'Branch', required: true },
    onHand: { type: Number, required: true, default: 0, min: 0 },
    reserved: { type: Number, required: true, default: 0, min: 0 },
    lowStockThreshold: { type: Number, required: true, default: 0, min: 0 },
  },
  { timestamps: true, collection: 'stock_levels' },
);

stockLevelSchema.index({ productId: 1, branchId: 1 }, { unique: true });
stockLevelSchema.index({ branchId: 1 });

const stockMovementSchema = new Schema(
  {
    productId: { type: Types.ObjectId, ref: 'Product', required: true, index: true },
    branchId: { type: Types.ObjectId, ref: 'Branch', required: true },
    type: { type: String, required: true, enum: MOVEMENT_TYPES },
    onHandDelta: { type: Number, required: true },
    reservedDelta: { type: Number, required: true },
    balanceOnHand: { type: Number, required: true },
    balanceReserved: { type: Number, required: true },
    relatedBranchId: { type: Types.ObjectId, ref: 'Branch', default: null },
    orderId: { type: Types.ObjectId, ref: 'Order', default: null },
    reservationId: { type: Types.ObjectId, default: null },
    note: { type: String, default: '' },
    administratorId: { type: Types.ObjectId, ref: 'Administrator', default: null },
  },
  { timestamps: { createdAt: true, updatedAt: false }, collection: 'stock_movements' },
);

stockMovementSchema.index({ createdAt: -1 });
stockMovementSchema.index({ productId: 1, createdAt: -1 });

const reservationSchema = new Schema(
  {
    productId: { type: Types.ObjectId, ref: 'Product', required: true },
    branchId: { type: Types.ObjectId, ref: 'Branch', required: true },
    quantity: { type: Number, required: true, min: 1 },
    orderId: { type: Types.ObjectId, ref: 'Order', required: true, index: true },
    status: { type: String, required: true, enum: ['active', 'committed', 'released', 'expired'], default: 'active' },
    expiresAt: { type: Date, required: true },
  },
  { timestamps: { createdAt: true, updatedAt: false }, collection: 'stock_reservations' },
);

reservationSchema.index({ status: 1, expiresAt: 1 });

export type StockLevel = InferSchemaType<typeof stockLevelSchema>;
export type StockMovement = InferSchemaType<typeof stockMovementSchema>;
export type StockReservation = InferSchemaType<typeof reservationSchema>;

export const StockLevelModel = model('StockLevel', stockLevelSchema);
export const StockMovementModel = model('StockMovement', stockMovementSchema);
export const StockReservationModel = model('StockReservation', reservationSchema);
