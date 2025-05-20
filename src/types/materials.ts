export interface MaterialRequisition {
  id: string;
  orderId: string;
  orderNumber: string;
  customer: string;
  items: MaterialRequisitionItem[];
  requestDate: string;
  status: 'pending' | 'partial' | 'complete' | 'cancelled';
  notes?: string;
  createdAt: string;
  createdBy?: string;
  lastUpdated: string;
  totalCost: number;
  budgetLimit?: number;
  budgetExceeded?: boolean;
}

export interface MaterialRequisitionItem {
  id: string;
  traceabilityCode: string; // Auto-generated
  orderItemId: string;  // Reference to the original order item
  itemCode: string; // Drawing reference code
  description: string;
  material: string;
  quantity: number;
  dimensions: string;
  weight: number; // in kg
  surplusWeight: number; // in kg
  totalWeight: number; // weight + surplusWeight
  
  // Purchase details
  purchaseOrderNumber?: string;
  receiptDate?: string;
  qualityCertificateNumber?: string;
  invoiceNumber?: string;
  supplierId?: string;
  supplierName?: string;
  invoiceValue?: number;
  unitPrice?: number; // per kg
  
  // Status
  status: 'pending' | 'ordered' | 'received' | 'stock';
  sentForQuotation: boolean;
}

export interface Supplier {
  id: string;
  name: string; // Razão Social
  tradeName?: string; // Nome Fantasia
  cnpj: string;
  stateRegistration?: string; // Inscrição Estadual
  email: string;
  phone: string;
  address: string;
  contactPerson: string;
  category: string[];  // Types of materials they supply
  lastOrderDate?: string;
  evaluationScore?: number;  // 1-5 rating
  paymentTerms?: string;
  deliveryTimeAvg?: number; // in days
  status: 'active' | 'inactive' | 'blocked';
  notes?: string;
  createdAt: string;
}

export interface QuotationRequest {
  id: string;
  requisitionId: string;
  supplierId: string;
  supplierName: string;
  items: QuotationRequestItem[];
  status: 'pending' | 'responded' | 'expired' | 'accepted';
  requestDate: string;
  responseDate?: string;
  expirationDate: string;
  notes?: string;
}

export interface QuotationRequestItem {
  id: string;
  requisitionItemId: string;
  description: string;
  material: string;
  quantity: number;
  dimensions: string;
  weight: number; // in kg
  drawingAttachment?: string; // URL to the attachment
  
  // Supplier response
  pricePerKg?: number;
  ipiPercentage?: number;
  totalPrice?: number;
  deliveryTime?: number; // in days
  notes?: string;
  
  // Calculated fields
  productPrice?: number; // weight * pricePerKg
  finalPrice?: number; // productPrice * (1 + (ipiPercentage/100))
}