import type { ClientSession, Types } from 'mongoose';
import { BranchModel } from '../models/branch.model.js';
import { StockLevelModel, StockMovementModel, StockReservationModel } from '../models/inventory.model.js';
import { ProductModel } from '../models/product.model.js';
import { AppError } from '../utils/errors.js';
import { toObjectId } from '../utils/object-id.js';
import { pageMeta } from '../utils/pagination.js';
import { withTransaction } from '../utils/transaction.js';
import { recordAudit } from './audit.service.js';
import { getSettings } from './settings.service.js';

type Session = ClientSession;

export async function ensureStockLevelsForProduct(productId: Types.ObjectId, session?: Session): Promise<void> {
  const settings = await getSettings();
  const branches = await BranchModel.find({ status: 'active' }).session(session ?? null);
  for (const branch of branches) {
    await StockLevelModel.updateOne(
      { productId, branchId: branch._id },
      {
        $setOnInsert: {
          productId,
          branchId: branch._id,
          onHand: 0,
          reserved: 0,
          lowStockThreshold: settings.inventory.defaultLowStockThreshold,
        },
      },
      { upsert: true, session },
    );
  }
}

export async function ensureStockLevelsForBranch(branchId: Types.ObjectId, session?: Session): Promise<void> {
  const settings = await getSettings();
  const products = await ProductModel.find({ deletedAt: null }).select('_id').session(session ?? null);
  for (const product of products) {
    await StockLevelModel.updateOne(
      { productId: product._id, branchId },
      {
        $setOnInsert: {
          productId: product._id,
          branchId,
          onHand: 0,
          reserved: 0,
          lowStockThreshold: settings.inventory.defaultLowStockThreshold,
        },
      },
      { upsert: true, session },
    );
  }
}

export async function receiveStock(input: {
  productId: string;
  branchId: string;
  quantity: number;
  note?: string;
  administratorId: string;
}) {
  return withTransaction(async (session) => {
    await assertProductAndBranch(input.productId, input.branchId, session);
    const level = await changeOnHand(input.productId, input.branchId, input.quantity, session);
    await writeMovement(
      {
        productId: input.productId,
        branchId: input.branchId,
        type: 'receipt',
        onHandDelta: input.quantity,
        reservedDelta: 0,
        balanceOnHand: level.onHand,
        balanceReserved: level.reserved,
        note: input.note ?? '',
        administratorId: input.administratorId,
      },
      session,
    );
    await syncProductInventory(input.productId, session);
    await recordAudit({
      actorId: input.administratorId,
      action: 'inventory.receipt',
      resourceType: 'inventory',
      resourceId: input.productId,
      metadata: { branchId: input.branchId, quantity: input.quantity },
    });
    return level;
  });
}

export async function adjustStock(input: {
  productId: string;
  branchId: string;
  delta: number;
  note: string;
  administratorId: string;
}) {
  return withTransaction(async (session) => {
    await assertProductAndBranch(input.productId, input.branchId, session);
    const level = await StockLevelModel.findOneAndUpdate(
      {
        productId: toObjectId(input.productId),
        branchId: toObjectId(input.branchId),
        $expr: {
          $and: [
            { $gte: [{ $add: ['$onHand', input.delta] }, 0] },
            { $gte: [{ $add: ['$onHand', input.delta] }, '$reserved'] },
          ],
        },
      },
      { $inc: { onHand: input.delta } },
      { new: true, session },
    );
    if (!level) {
      throw new AppError('INSUFFICIENT_STOCK', 'That adjustment would make stock negative or drop below reserved units', 409);
    }
    await writeMovement(
      {
        productId: input.productId,
        branchId: input.branchId,
        type: 'adjustment',
        onHandDelta: input.delta,
        reservedDelta: 0,
        balanceOnHand: level.onHand,
        balanceReserved: level.reserved,
        note: input.note,
        administratorId: input.administratorId,
      },
      session,
    );
    await syncProductInventory(input.productId, session);
    await recordAudit({
      actorId: input.administratorId,
      action: 'inventory.adjustment',
      resourceType: 'inventory',
      resourceId: input.productId,
      metadata: { branchId: input.branchId, delta: input.delta },
    });
    return level;
  });
}

export async function transferStock(input: {
  productId: string;
  fromBranchId: string;
  toBranchId: string;
  quantity: number;
  note?: string;
  administratorId: string;
}) {
  if (input.fromBranchId === input.toBranchId) {
    throw new AppError('VALIDATION_ERROR', 'Choose two different branches', 400);
  }
  return withTransaction(async (session) => {
    await assertProductAndBranch(input.productId, input.fromBranchId, session);
    await assertProductAndBranch(input.productId, input.toBranchId, session);
    const source = await StockLevelModel.findOneAndUpdate(
      {
        productId: toObjectId(input.productId),
        branchId: toObjectId(input.fromBranchId),
        $expr: { $gte: [{ $subtract: ['$onHand', '$reserved'] }, input.quantity] },
      },
      { $inc: { onHand: -input.quantity } },
      { new: true, session },
    );
    if (!source) throw new AppError('INSUFFICIENT_STOCK', 'The source branch does not have enough available stock', 409);
    const destination = await StockLevelModel.findOneAndUpdate(
      { productId: toObjectId(input.productId), branchId: toObjectId(input.toBranchId) },
      { $inc: { onHand: input.quantity } },
      { new: true, session },
    );
    if (!destination) throw new AppError('NOT_FOUND', 'Destination stock record was not found', 404);
    await writeMovement(
      {
        productId: input.productId,
        branchId: input.fromBranchId,
        type: 'transfer_out',
        onHandDelta: -input.quantity,
        reservedDelta: 0,
        balanceOnHand: source.onHand,
        balanceReserved: source.reserved,
        relatedBranchId: input.toBranchId,
        note: input.note ?? '',
        administratorId: input.administratorId,
      },
      session,
    );
    await writeMovement(
      {
        productId: input.productId,
        branchId: input.toBranchId,
        type: 'transfer_in',
        onHandDelta: input.quantity,
        reservedDelta: 0,
        balanceOnHand: destination.onHand,
        balanceReserved: destination.reserved,
        relatedBranchId: input.fromBranchId,
        note: input.note ?? '',
        administratorId: input.administratorId,
      },
      session,
    );
    await syncProductInventory(input.productId, session);
    await recordAudit({
      actorId: input.administratorId,
      action: 'inventory.transfer',
      resourceType: 'inventory',
      resourceId: input.productId,
      metadata: { fromBranchId: input.fromBranchId, toBranchId: input.toBranchId, quantity: input.quantity },
    });
    return { source, destination };
  });
}

export async function setLowStockThreshold(input: { productId: string; branchId: string; lowStockThreshold: number; administratorId: string }) {
  const level = await StockLevelModel.findOneAndUpdate(
    { productId: toObjectId(input.productId), branchId: toObjectId(input.branchId) },
    { $set: { lowStockThreshold: input.lowStockThreshold } },
    { new: true },
  );
  if (!level) throw new AppError('NOT_FOUND', 'Stock record was not found', 404);
  await recordAudit({
    actorId: input.administratorId,
    action: 'inventory.threshold',
    resourceType: 'inventory',
    resourceId: input.productId,
    metadata: { branchId: input.branchId, lowStockThreshold: input.lowStockThreshold },
  });
  return level;
}

export async function reserveStock(
  input: { productId: string; branchId: string; quantity: number; orderId: Types.ObjectId; expiresAt: Date },
  session: Session,
) {
  const level = await StockLevelModel.findOneAndUpdate(
    {
      productId: toObjectId(input.productId),
      branchId: toObjectId(input.branchId),
      $expr: { $gte: [{ $subtract: ['$onHand', '$reserved'] }, input.quantity] },
    },
    { $inc: { reserved: input.quantity } },
    { new: true, session },
  );
  if (!level) throw new AppError('INSUFFICIENT_STOCK', 'Not enough stock is available to reserve', 409);
  const [reservation] = await StockReservationModel.create(
    [
      {
        productId: input.productId,
        branchId: input.branchId,
        quantity: input.quantity,
        orderId: input.orderId,
        status: 'active',
        expiresAt: input.expiresAt,
      },
    ],
    { session },
  );
  await writeMovement(
    {
      productId: input.productId,
      branchId: input.branchId,
      type: 'reservation',
      onHandDelta: 0,
      reservedDelta: input.quantity,
      balanceOnHand: level.onHand,
      balanceReserved: level.reserved,
      orderId: String(input.orderId),
      reservationId: String(reservation!._id),
      note: 'Order reservation',
    },
    session,
  );
  await syncProductInventory(input.productId, session);
  return reservation!;
}

export async function releaseOrderReservations(orderId: string, reason: 'reservation_release' | 'reservation_expiry', session: Session) {
  const reservations = await StockReservationModel.find({ orderId, status: 'active' }).session(session);
  for (const reservation of reservations) {
    const level = await StockLevelModel.findOneAndUpdate(
      { productId: reservation.productId, branchId: reservation.branchId, reserved: { $gte: reservation.quantity } },
      { $inc: { reserved: -reservation.quantity } },
      { new: true, session },
    );
    if (!level) throw new AppError('CONFLICT', 'Reserved stock could not be released', 409);
    reservation.status = reason === 'reservation_expiry' ? 'expired' : 'released';
    await reservation.save({ session });
    await writeMovement(
      {
        productId: String(reservation.productId),
        branchId: String(reservation.branchId),
        type: reason,
        onHandDelta: 0,
        reservedDelta: -reservation.quantity,
        balanceOnHand: level.onHand,
        balanceReserved: level.reserved,
        orderId,
        reservationId: String(reservation._id),
        note: reason,
      },
      session,
    );
    await syncProductInventory(String(reservation.productId), session);
  }
  return reservations.length;
}

export async function commitOrderReservations(orderId: string, session: Session) {
  const reservations = await StockReservationModel.find({ orderId, status: 'active' }).session(session);
  if (reservations.length === 0) return false;
  for (const reservation of reservations) {
    const level = await StockLevelModel.findOneAndUpdate(
      {
        productId: reservation.productId,
        branchId: reservation.branchId,
        reserved: { $gte: reservation.quantity },
        onHand: { $gte: reservation.quantity },
      },
      { $inc: { reserved: -reservation.quantity, onHand: -reservation.quantity } },
      { new: true, session },
    );
    if (!level) return false;
    reservation.status = 'committed';
    await reservation.save({ session });
    await writeMovement(
      {
        productId: String(reservation.productId),
        branchId: String(reservation.branchId),
        type: 'sale',
        onHandDelta: -reservation.quantity,
        reservedDelta: -reservation.quantity,
        balanceOnHand: level.onHand,
        balanceReserved: level.reserved,
        orderId,
        reservationId: String(reservation._id),
        note: 'Payment confirmed',
      },
      session,
    );
    await syncProductInventory(String(reservation.productId), session);
  }
  return true;
}

export async function listInventory(query: { page: number; pageSize: number; productId?: string; branchId?: string }) {
  const filter: Record<string, unknown> = {};
  if (query.productId) filter.productId = toObjectId(query.productId);
  if (query.branchId) filter.branchId = toObjectId(query.branchId);
  const [items, total] = await Promise.all([
    StockLevelModel.find(filter)
      .sort({ updatedAt: -1 })
      .skip((query.page - 1) * query.pageSize)
      .limit(query.pageSize),
    StockLevelModel.countDocuments(filter),
  ]);
  return { items: items.map(presentLevel), meta: pageMeta(query.page, query.pageSize, total) };
}

export async function listLowStock(query: { page: number; pageSize: number }) {
  const items = await StockLevelModel.find({
    $expr: { $lte: [{ $subtract: ['$onHand', '$reserved'] }, '$lowStockThreshold'] },
  })
    .skip((query.page - 1) * query.pageSize)
    .limit(query.pageSize);
  const total = await StockLevelModel.countDocuments({
    $expr: { $lte: [{ $subtract: ['$onHand', '$reserved'] }, '$lowStockThreshold'] },
  });
  return { items: items.map(presentLevel), meta: pageMeta(query.page, query.pageSize, total) };
}

export async function listMovements(query: { page: number; pageSize: number; productId?: string }) {
  const filter: Record<string, unknown> = {};
  if (query.productId) filter.productId = toObjectId(query.productId);
  const [items, total] = await Promise.all([
    StockMovementModel.find(filter)
      .sort({ createdAt: -1 })
      .skip((query.page - 1) * query.pageSize)
      .limit(query.pageSize),
    StockMovementModel.countDocuments(filter),
  ]);
  return {
    items: items.map((movement) => ({
      id: String(movement._id),
      productId: String(movement.productId),
      branchId: String(movement.branchId),
      type: movement.type,
      onHandDelta: movement.onHandDelta,
      reservedDelta: movement.reservedDelta,
      balanceOnHand: movement.balanceOnHand,
      balanceReserved: movement.balanceReserved,
      relatedBranchId: movement.relatedBranchId ? String(movement.relatedBranchId) : null,
      orderId: movement.orderId ? String(movement.orderId) : null,
      note: movement.note,
      administratorId: movement.administratorId ? String(movement.administratorId) : null,
      createdAt: movement.createdAt,
    })),
    meta: pageMeta(query.page, query.pageSize, total),
  };
}

export async function branchAvailability(productIds: string[]) {
  const levels = await StockLevelModel.find({ productId: { $in: productIds } });
  const branches = await BranchModel.find({ _id: { $in: levels.map((level) => level.branchId) } });
  const names = new Map(branches.map((branch) => [String(branch._id), branch.name]));
  const grouped = new Map<string, Array<{ branchId: string; branchName: string; available: number }>>();
  for (const level of levels) {
    const productId = String(level.productId);
    const rows = grouped.get(productId) ?? [];
    rows.push({
      branchId: String(level.branchId),
      branchName: names.get(String(level.branchId)) ?? 'Branch',
      available: level.onHand - level.reserved,
    });
    grouped.set(productId, rows);
  }
  return grouped;
}

export function presentLevel(level: {
  _id: { toString(): string };
  productId: { toString(): string };
  branchId: { toString(): string };
  onHand: number;
  reserved: number;
  lowStockThreshold: number;
  updatedAt?: Date;
}) {
  return {
    id: String(level._id),
    productId: String(level.productId),
    branchId: String(level.branchId),
    onHand: level.onHand,
    reserved: level.reserved,
    available: level.onHand - level.reserved,
    lowStockThreshold: level.lowStockThreshold,
    lowStock: level.onHand - level.reserved <= level.lowStockThreshold,
    updatedAt: level.updatedAt,
  };
}

async function assertProductAndBranch(productId: string, branchId: string, session: Session) {
  const product = await ProductModel.findOne({ _id: toObjectId(productId), deletedAt: null }).session(session);
  if (!product) throw new AppError('NOT_FOUND', 'Product was not found', 404);
  const branch = await BranchModel.findById(toObjectId(branchId)).session(session);
  if (!branch || branch.status !== 'active') throw new AppError('NOT_FOUND', 'Active branch was not found', 404);
  await StockLevelModel.updateOne(
    { productId: product._id, branchId: branch._id },
    { $setOnInsert: { productId: product._id, branchId: branch._id, onHand: 0, reserved: 0, lowStockThreshold: 0 } },
    { upsert: true, session },
  );
}

async function changeOnHand(productId: string, branchId: string, delta: number, session: Session) {
  const level = await StockLevelModel.findOneAndUpdate(
    { productId: toObjectId(productId), branchId: toObjectId(branchId) },
    { $inc: { onHand: delta } },
    { new: true, session },
  );
  if (!level) throw new AppError('NOT_FOUND', 'Stock record was not found', 404);
  return level;
}

async function writeMovement(
  input: {
    productId: string;
    branchId: string;
    type: string;
    onHandDelta: number;
    reservedDelta: number;
    balanceOnHand: number;
    balanceReserved: number;
    relatedBranchId?: string;
    orderId?: string;
    reservationId?: string;
    note?: string;
    administratorId?: string;
  },
  session: Session,
) {
  await StockMovementModel.create(
    [
      {
        ...input,
        productId: toObjectId(input.productId),
        branchId: toObjectId(input.branchId),
        relatedBranchId: input.relatedBranchId ? toObjectId(input.relatedBranchId) : null,
        orderId: input.orderId ? toObjectId(input.orderId) : null,
        reservationId: input.reservationId ? toObjectId(input.reservationId) : null,
        administratorId: input.administratorId ? toObjectId(input.administratorId) : null,
      },
    ],
    { session },
  );
}

export async function syncProductInventory(productId: string, session?: Session): Promise<void> {
  const levels = await StockLevelModel.find({ productId: toObjectId(productId) }).session(session ?? null);
  const available = levels.reduce((sum, level) => sum + (level.onHand - level.reserved), 0);
  const product = await ProductModel.findById(productId).session(session ?? null);
  if (!product) return;
  const update: Record<string, unknown> = { inventoryQuantity: Math.max(0, available) };
  if (product.availability === 'in_stock' && available <= 0) update.availability = 'out_of_stock';
  if (product.availability === 'out_of_stock' && available > 0) update.availability = 'in_stock';
  await ProductModel.updateOne({ _id: product._id }, { $set: update }, { session });
}

export async function expireReservations(now = new Date()): Promise<number> {
  const due = await StockReservationModel.find({ status: 'active', expiresAt: { $lte: now } }).limit(100);
  let expired = 0;
  for (const reservation of due) {
    await withTransaction(async (session) => {
      const current = await StockReservationModel.findOne({ _id: reservation._id, status: 'active' }).session(session);
      if (!current) return;
      await releaseOrderReservations(String(current.orderId), 'reservation_expiry', session);
      const { OrderModel } = await import('../models/order.model.js');
      await OrderModel.updateOne(
        { _id: current.orderId, paymentStatus: 'pending' },
        { $set: { paymentStatus: 'failed', fulfilmentStatus: 'cancelled', cancelledAt: now } },
        { session },
      );
    });
    expired += 1;
  }
  return expired;
}
