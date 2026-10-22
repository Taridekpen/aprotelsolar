import { formatKoboAsNaira, type FulfilmentStatus, type Permission } from '@aprotel/shared';
import { BranchModel } from '../models/branch.model.js';
import { OrderModel } from '../models/order.model.js';
import { findOrderForCustomer } from '../repositories/commerce.repository.js';
import { AppError } from '../utils/errors.js';
import { pageMeta } from '../utils/pagination.js';
import { datedCode } from '../utils/tokens.js';
import { withTransaction } from '../utils/transaction.js';
import { recordAudit } from './audit.service.js';
import { priceSelection } from './commerce.service.js';
import { withIdempotency } from './idempotency.service.js';
import { releaseOrderReservations, reserveStock } from './inventory.service.js';
import { getSettings } from './settings.service.js';

interface OrderInput {
  customer: { name: string; email: string; phone: string };
  delivery: {
    recipientName: string;
    phone: string;
    addressLine1: string;
    addressLine2?: string;
    city: string;
    state: string;
    country?: string;
    notes?: string;
  };
  branchId?: string;
  includeInstallation: boolean;
  items?: Array<{ productId: string; quantity: number }>;
  packages?: Array<{ packageId: string; quantity: number }>;
}

export async function createOrder(input: OrderInput, idempotencyKey: string | undefined) {
  return withIdempotency({
    key: idempotencyKey,
    scope: 'order.create',
    body: input,
    execute: async () => {
      const order = await withTransaction(async (session) => {
        const branch = input.branchId
          ? await BranchModel.findOne({ _id: input.branchId, status: 'active' }).session(session)
          : await BranchModel.findOne({ isCentral: true, status: 'active' }).session(session);
        if (!branch) throw new AppError('UNPROCESSABLE', 'No active branch is available to fulfil this order', 422);
        const priced = await priceSelection(
          {
            items: input.items,
            packages: input.packages,
            state: input.delivery.state,
            includeInstallation: input.includeInstallation,
            mode: 'order',
          },
          session,
        );
        const settings = await getSettings();
        const reservationExpiresAt = new Date(Date.now() + settings.inventory.reservationTtlMinutes * 60 * 1000);
        const [created] = await OrderModel.create(
          [
            {
              orderNumber: datedCode('ORD'),
              customer: input.customer,
              delivery: input.delivery,
              branchId: branch._id,
              lines: [
                ...priced.lines.map((line) => ({
                  kind: 'product' as const,
                  productId: line.productId,
                  name: line.name,
                  sku: line.sku,
                  quantity: line.quantity,
                  unitPriceKobo: line.unitPriceKobo,
                  lineTotalKobo: line.lineTotalKobo,
                  snapshot: { specifications: line.specificationsSnapshot },
                })),
                ...priced.packageLines.map((line) => ({
                  kind: 'package' as const,
                  packageId: line.packageId,
                  name: line.name,
                  sku: line.sku,
                  quantity: line.quantity,
                  unitPriceKobo: line.unitPriceKobo,
                  lineTotalKobo: line.lineTotalKobo,
                  snapshot: { components: line.components, pricingBasis: 'package_price' },
                })),
              ],
              subtotalKobo: priced.subtotalKobo,
              deliveryCostKobo: priced.deliveryCostKobo,
              installationCostKobo: priced.installationCostKobo,
              taxKobo: priced.taxKobo,
              totalKobo: priced.totalKobo,
              paymentStatus: 'pending',
              fulfilmentStatus: 'unfulfilled',
              reservationExpiresAt,
              idempotencyKey: idempotencyKey ?? null,
            },
          ],
          { session },
        );
        for (const demand of priced.demands) {
          await reserveStock(
            {
              productId: demand.productId,
              branchId: String(branch._id),
              quantity: demand.quantity,
              orderId: created!._id,
              expiresAt: reservationExpiresAt,
            },
            session,
          );
        }
        return created!;
      });
      return { statusCode: 201, body: { data: presentOrder(order, false) } };
    },
  });
}

export async function lookupOrder(orderNumber: string, email: string) {
  const order = await findOrderForCustomer(orderNumber, email);
  if (!order) throw new AppError('NOT_FOUND', 'Order was not found', 404);
  return presentOrder(order, false);
}

export async function cancelGuestOrder(input: { orderNumber: string; email: string; phone: string }) {
  const order = await OrderModel.findOne({ orderNumber: input.orderNumber, 'customer.email': input.email, 'customer.phone': input.phone });
  if (!order) throw new AppError('NOT_FOUND', 'Order was not found', 404);
  if (order.paymentStatus !== 'pending') throw new AppError('CONFLICT', 'Only unpaid orders can be cancelled', 409);
  await withTransaction(async (session) => {
    const current = await OrderModel.findOne({ _id: order._id, paymentStatus: 'pending' }).session(session);
    if (!current) throw new AppError('CONFLICT', 'Only unpaid orders can be cancelled', 409);
    await releaseOrderReservations(String(current._id), 'reservation_release', session);
    current.paymentStatus = 'cancelled';
    current.fulfilmentStatus = 'cancelled';
    current.cancelledAt = new Date();
    await current.save({ session });
  });
  const updated = await OrderModel.findById(order._id);
  return presentOrder(updated!, false);
}

export async function listOrders(query: { page: number; pageSize: number; status?: string; fulfilment?: string; q?: string }) {
  const filter: Record<string, unknown> = {};
  if (query.status) filter.paymentStatus = query.status;
  if (query.fulfilment) filter.fulfilmentStatus = query.fulfilment;
  if (query.q) {
    const expression = new RegExp(query.q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
    filter.$or = [{ orderNumber: expression }, { 'customer.email': expression }, { 'customer.name': expression }];
  }
  const [items, total] = await Promise.all([
    OrderModel.find(filter)
      .sort({ createdAt: -1 })
      .skip((query.page - 1) * query.pageSize)
      .limit(query.pageSize),
    OrderModel.countDocuments(filter),
  ]);
  return { items: items.map((item) => presentOrder(item, true)), meta: pageMeta(query.page, query.pageSize, total) };
}

export async function getOrder(id: string) {
  const order = await OrderModel.findById(id);
  if (!order) throw new AppError('NOT_FOUND', 'Order was not found', 404);
  return presentOrder(order, true);
}

export async function updateFulfilment(
  id: string,
  input: { fulfilmentStatus: FulfilmentStatus; branchId?: string },
  actor: { id: string; permissions: Permission[]; ipAddress?: string; userAgent?: string },
) {
  const order = await OrderModel.findById(id);
  if (!order) throw new AppError('NOT_FOUND', 'Order was not found', 404);
  if (input.fulfilmentStatus === 'cancelled') {
    throw new AppError('VALIDATION_ERROR', 'Cancel unpaid orders with the cancel action', 400);
  }
  order.fulfilmentStatus = input.fulfilmentStatus;
  if (input.branchId) order.branchId = input.branchId as never;
  await order.save();
  await recordAudit({
    actorId: actor.id,
    action: 'order.fulfilment',
    resourceType: 'order',
    resourceId: id,
    ipAddress: actor.ipAddress,
    userAgent: actor.userAgent,
    metadata: { fulfilmentStatus: input.fulfilmentStatus },
  });
  return presentOrder(order, true);
}

export async function cancelOrder(id: string, actor: { id: string; ipAddress?: string; userAgent?: string }) {
  const order = await OrderModel.findById(id);
  if (!order) throw new AppError('NOT_FOUND', 'Order was not found', 404);
  if (order.paymentStatus === 'paid') throw new AppError('CONFLICT', 'Paid orders cannot be cancelled from this action', 409);
  if (order.paymentStatus === 'cancelled') return presentOrder(order, true);
  await withTransaction(async (session) => {
    const current = await OrderModel.findOne({ _id: id, paymentStatus: order.paymentStatus }).session(session);
    if (!current || current.paymentStatus === 'paid') throw new AppError('CONFLICT', 'Paid orders cannot be cancelled from this action', 409);
    if (current.paymentStatus === 'pending') await releaseOrderReservations(String(current._id), 'reservation_release', session);
    current.paymentStatus = 'cancelled';
    current.fulfilmentStatus = 'cancelled';
    current.cancelledAt = new Date();
    await current.save({ session });
  });
  await recordAudit({ actorId: actor.id, action: 'order.cancel', resourceType: 'order', resourceId: id, ipAddress: actor.ipAddress, userAgent: actor.userAgent });
  const updated = await OrderModel.findById(id);
  return presentOrder(updated!, true);
}

export function presentOrder(order: any, _admin: boolean) {
  const money = formatKoboAsNaira;
  return {
    id: String(order._id),
    orderNumber: order.orderNumber,
    customer: order.customer,
    delivery: order.delivery,
    branchId: String(order.branchId),
    lines: order.lines.map((line: any) => ({
      kind: line.kind,
      productId: line.productId ? String(line.productId) : null,
      packageId: line.packageId ? String(line.packageId) : null,
      name: line.name,
      sku: line.sku ?? '',
      quantity: line.quantity,
      unitPrice: money(line.unitPriceKobo),
      lineTotal: money(line.lineTotalKobo),
      snapshot: line.snapshot ?? null,
    })),
    currency: order.currency,
    subtotal: money(order.subtotalKobo),
    deliveryCost: money(order.deliveryCostKobo),
    installationCost: money(order.installationCostKobo),
    tax: money(order.taxKobo),
    total: money(order.totalKobo),
    paymentStatus: order.paymentStatus,
    fulfilmentStatus: order.fulfilmentStatus,
    paymentReference: order.paymentReference ?? '',
    reservationExpiresAt: order.reservationExpiresAt,
    createdAt: order.createdAt,
    updatedAt: order.updatedAt,
  };
}
