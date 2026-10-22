import { EnquiryModel } from '../models/enquiry.model.js';
import { OrderModel } from '../models/order.model.js';
import { QuotationModel } from '../models/quotation.model.js';

export function findOrderForCustomer(orderNumber: string, email: string) {
  return OrderModel.findOne({ orderNumber, 'customer.email': email });
}

export function findQuotationForCustomer(reference: string, email: string) {
  return QuotationModel.findOne({ reference, 'customer.email': email });
}

export function countEnquiries(status?: string) {
  return EnquiryModel.countDocuments(status ? { status } : {});
}

export function countOrders(paymentStatus?: string) {
  return OrderModel.countDocuments(paymentStatus ? { paymentStatus } : {});
}
