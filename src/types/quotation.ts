export interface Quotation {
  id: string;
  number: string;         // Sequential quote number that never repeats
  customerId: string;     // Reference to customer ID
  customerName: string;   // Customer name for easier reference
  items: QuotationItem[];
  totalAmount: number;    // Total without taxes
  totalTaxAmount: number; // Total tax amount
  totalWithTaxes: number; // Final amount with taxes
  status: 'draft' | 'sent' | 'approved' | 'rejected' | 'expired';
  createdAt: string;
  updatedAt: string;
  sentAt?: string;
  approvedAt?: string;
  rejectedAt?: string;
  expiresAt?: string;
  convertedToOrderId?: string;  // Reference to order if converted
  notes?: string;
  paymentTerms?: string;
  deliveryTerms?: string;
  contactPerson?: string;
  validityDays: number;   // Quote validity in days
  processDetails?: string; // Details about the manufacturing process
  includedServices?: string[]; // List of services included in the quote
}

export interface QuotationItem {
  id: string;
  code: string;
  description: string;
  quantity: number;
  unitWeight: number;     // Added unit weight field
  totalWeight?: number;   // Total weight (quantity * unitWeight)
  unitPrice: number;      // Price per unit without taxes
  taxRate: number;        // Tax percentage (e.g., 10 for 10%)
  leadTimeDays: number;   // Manufacturing lead time in days
  totalPrice: number;     // unitPrice * quantity
  taxAmount: number;      // Tax amount based on totalPrice and taxRate
  totalWithTax: number;   // totalPrice + taxAmount
  notes?: string;
  // drawingReference field has been removed
}

export interface QuotationStats {
  totalQuotes: number;
  approvedQuotes: number;
  rejectedQuotes: number;
  pendingQuotes: number;
  approvalRate: number;
  averageResponseTime: number; // in days
  totalQuoteValue: number;
  approvedQuoteValue: number;
}

export interface CustomerApprovalRate {
  customerId: string;
  customerName: string;
  totalQuotes: number;
  approvedQuotes: number;
  approvalRate: number;
  totalValue: number;
  approvedValue: number;
}