export interface Customer {
  id: string;
  name: string;
  email: string;
  phone: string;
  address: string;
  cnpj: string;
  createdAt: string;
  category?: string;
  segment?: string;
  notes?: string;
  contactPerson?: string;
  contactPhone?: string;
  lifetimeValue?: number;
  lastPurchase?: string;
  status?: 'active' | 'inactive' | 'lead';
}