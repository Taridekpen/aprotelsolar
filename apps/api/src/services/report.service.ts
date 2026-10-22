import { formatKoboAsNaira } from '@aprotel/shared';
import { EnquiryModel } from '../models/enquiry.model.js';
import { StockLevelModel, StockReservationModel } from '../models/inventory.model.js';
import { OrderModel } from '../models/order.model.js';
import { ProductModel } from '../models/product.model.js';
import { QuotationModel } from '../models/quotation.model.js';
import { AuditLogModel } from '../models/security.model.js';
import { AppError } from '../utils/errors.js';
import { escapeRegex, pageMeta } from '../utils/pagination.js';

const LAGOS = 'Africa/Lagos';

function dayKey(date: Date) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: LAGOS, year: 'numeric', month: '2-digit', day: '2-digit' }).format(date);
}

function parseRange(from?: string, to?: string) {
  const end = to ? new Date(`${to}T23:59:59.999+01:00`) : new Date();
  const start = from ? new Date(`${from}T00:00:00.000+01:00`) : new Date(end.getTime() - 29 * 24 * 60 * 60 * 1000);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || start > end) {
    throw new AppError('VALIDATION_ERROR', 'Choose a valid date range', 400);
  }
  return { start, end, from: dayKey(start), to: dayKey(end) };
}

function eachDay(start: Date, end: Date) {
  const days: string[] = [];
  const cursor = new Date(start);
  while (dayKey(cursor) <= dayKey(end) && days.length < 370) {
    days.push(dayKey(cursor));
    cursor.setTime(cursor.getTime() + 24 * 60 * 60 * 1000);
  }
  if (!days.includes(dayKey(end))) days.push(dayKey(end));
  return days;
}

export async function dashboard(query: { from?: string; to?: string } = {}) {
  const range = parseRange(query.from, query.to);
  const created = { $gte: range.start, $lte: range.end };
  const [
    publishedProducts,
    draftProducts,
    inactiveProducts,
    pendingOrders,
    newEnquiries,
    pendingQuotations,
    activeReservations,
    lowStock,
    available,
    revenue,
    sales,
    popular,
    recentOrders,
    recommendationCount,
    calculationCount,
    recommendationGroups,
    activity,
    lowStockRows,
    awaitingFulfilment,
  ] = await Promise.all([
    ProductModel.countDocuments({ publicationStatus: 'published', deletedAt: null }),
    ProductModel.countDocuments({ publicationStatus: 'draft', deletedAt: null }),
    ProductModel.countDocuments({ publicationStatus: 'inactive', deletedAt: null }),
    OrderModel.countDocuments({ paymentStatus: 'pending' }),
    EnquiryModel.countDocuments({ status: 'new' }),
    QuotationModel.countDocuments({ engineeringApproval: 'pending', status: { $in: ['submitted', 'in_review'] } }),
    StockReservationModel.countDocuments({ status: 'active' }),
    StockLevelModel.countDocuments({ $expr: { $lte: [{ $subtract: ['$onHand', '$reserved'] }, '$lowStockThreshold'] } }),
    StockLevelModel.aggregate<{ _id: null; available: number }>([
      { $group: { _id: null, available: { $sum: { $subtract: ['$onHand', '$reserved'] } } } },
    ]),
    OrderModel.aggregate<{ _id: null; total: number }>([
      { $match: { paymentStatus: 'paid', createdAt: created } },
      { $group: { _id: null, total: { $sum: '$totalKobo' } } },
    ]),
    OrderModel.aggregate<{ _id: string; total: number; count: number }>([
      { $match: { paymentStatus: 'paid', createdAt: created } },
      {
        $group: {
          _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt', timezone: LAGOS } },
          total: { $sum: '$totalKobo' },
          count: { $sum: 1 },
        },
      },
    ]),
    OrderModel.aggregate<{ _id: { name: string; sku: string }; quantity: number; revenueKobo: number }>([
      { $match: { paymentStatus: 'paid', createdAt: created } },
      { $unwind: '$lines' },
      {
        $group: {
          _id: { name: '$lines.name', sku: '$lines.sku' },
          quantity: { $sum: '$lines.quantity' },
          revenueKobo: { $sum: '$lines.lineTotalKobo' },
        },
      },
      { $sort: { quantity: -1 } },
      { $limit: 8 },
    ]),
    OrderModel.find({ createdAt: created }).sort({ createdAt: -1 }).limit(8),
    EnquiryModel.countDocuments({ createdAt: created, recommendationSnapshot: { $ne: null } }),
    EnquiryModel.countDocuments({ createdAt: created, solarCalculation: { $ne: null } }),
    EnquiryModel.aggregate<{ _id: string; count: number }>([
      { $match: { createdAt: created, recommendationSnapshot: { $ne: null } } },
      { $group: { _id: '$enquiryType', count: { $sum: 1 } } },
      { $sort: { count: -1 } },
    ]),
    AuditLogModel.find({ createdAt: created }).sort({ createdAt: -1 }).limit(12),
    StockLevelModel.find({ $expr: { $lte: [{ $subtract: ['$onHand', '$reserved'] }, '$lowStockThreshold'] } }).limit(8),
    OrderModel.countDocuments({
      paymentStatus: 'paid',
      fulfilmentStatus: { $in: ['unfulfilled', 'processing', 'ready', 'dispatched'] },
    }),
  ]);

  const salesByDate = new Map(sales.map((row) => [row._id, row]));
  const revenueKobo = revenue[0]?.total ?? 0;
  return {
    range: { from: range.from, to: range.to },
    products: { published: publishedProducts, draft: draftProducts, inactive: inactiveProducts },
    orders: {
      pendingPayment: pendingOrders,
      awaitingFulfilment,
      paidRevenue: formatKoboAsNaira(revenueKobo),
      salesByDay: eachDay(range.start, range.end).map((date) => ({
        date,
        total: formatKoboAsNaira(salesByDate.get(date)?.total ?? 0),
        totalKobo: salesByDate.get(date)?.total ?? 0,
        count: salesByDate.get(date)?.count ?? 0,
      })),
    },
    enquiries: { new: newEnquiries },
    quotations: { pendingEngineeringApproval: pendingQuotations },
    inventory: {
      availableUnits: available[0]?.available ?? 0,
      lowStockLines: lowStock,
      activeReservations,
      lowStock: lowStockRows.map((level) => ({
        productId: String(level.productId),
        branchId: String(level.branchId),
        available: level.onHand - level.reserved,
        lowStockThreshold: level.lowStockThreshold,
      })),
    },
    recentOrders: recentOrders.map((order) => ({
      id: String(order._id),
      orderNumber: order.orderNumber,
      customerName: order.customer?.name ?? '',
      total: formatKoboAsNaira(order.totalKobo),
      paymentStatus: order.paymentStatus,
      fulfilmentStatus: order.fulfilmentStatus,
      createdAt: order.createdAt,
    })),
    popularProducts: popular.map((row) => ({
      name: row._id.name,
      sku: row._id.sku ?? '',
      quantity: row.quantity,
      revenue: formatKoboAsNaira(row.revenueKobo),
    })),
    calculatorRecommendations: {
      enquiriesWithCalculation: calculationCount,
      enquiriesWithRecommendation: recommendationCount,
      byEnquiryType: recommendationGroups.map((row) => ({ enquiryType: row._id, count: row.count })),
      engineStatus: 'active' as const,
    },
    recentActivity: activity.map((item) => ({
      id: String(item._id),
      action: item.action,
      resourceType: item.resourceType,
      resourceId: item.resourceId,
      createdAt: item.createdAt,
    })),
    currency: 'NGN',
  };
}

export async function listAudit(query: { page: number; pageSize: number; q?: string }) {
  const filter = query.q ? { action: new RegExp(escapeRegex(query.q), 'i') } : {};
  const [items, total] = await Promise.all([
    AuditLogModel.find(filter)
      .sort({ createdAt: -1 })
      .skip((query.page - 1) * query.pageSize)
      .limit(query.pageSize),
    AuditLogModel.countDocuments(filter),
  ]);
  return {
    items: items.map((item) => ({
      id: String(item._id),
      actorId: item.actorId ? String(item.actorId) : null,
      action: item.action,
      resourceType: item.resourceType,
      resourceId: item.resourceId,
      ipAddress: item.ipAddress,
      metadata: item.metadata,
      createdAt: item.createdAt,
    })),
    meta: pageMeta(query.page, query.pageSize, total),
  };
}
