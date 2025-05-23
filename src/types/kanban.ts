export interface OrderItem {
  id: string;
  itemNumber: number;
  code: string;
  description: string;
  quantity: number;
  unitWeight: number;
  totalWeight: number;
  unitPrice: number;
  totalPrice: number;
  unitCost?: number;
  totalCost?: number;
  margin?: number;
  progress?: {
    [stage: string]: number;
  };
  stagePlanning?: {
    [stage: string]: {
      days: number;
      startDate: string;
      endDate: string;
      responsible: string;
    };
  };
  invoiceNumber?: string;
  expeditionLE?: string;
  expeditionDate?: string;
  completedDate?: string;
  overallProgress?: number;
}

export interface ClientProject {
  id: string;
  name: string;
  description: string;
  manager: string;
  deadline: string;
  status: 'active' | 'completed' | 'on-hold';
  notes?: string;
  createdAt: string;
}

export interface OrderHistoryEntry {
  status: string;
  date: string;
  user: string;
}

export interface ClientAccessLink {
  id: string;
  url: string;
  createdAt: string;
  expiresAt: string;
  isActive: boolean;
}

export interface Order {
  id: string;
  orderNumber: string;
  startDate: string;
  deliveryDate: string;
  internalOrderNumber: string;
  totalWeight: number;
  status: OrderStatus;
  items: OrderItem[];
  driveLinks: string[];
  customer: string;
  columnId: string | null; // Aceita coluna null
  deleted?: boolean; // Marca se o pedido foi excluído
  customerEmail?: string;
  validationRequestSentAt?: string;
  statusHistory?: OrderHistoryEntry[]; // Histórico de alterações de status
  statusChangedAt?: string; // Data da última alteração de status
  createdAt?: string; // Data de criação do pedido
  checklist?: {
    drawings: boolean;
    inspectionTestPlan: boolean;
    paintPlan: boolean;
  };
  projectId?: string; // Reference to client project or free text
  projectName?: string; // Text name for the project
  selected?: boolean;
  completedDate?: string;
  lastExportDate?: string; // Date when the order was last exported
  clientAccessLinks?: ClientAccessLink[];
}

export interface Column {
  id: string;
  title: string;
  order: number;
  orders: Order[];
}

export type OrderStatus = 
  | 'in-progress'  // Em Processo (Laranja)
  | 'delayed'      // Atrasado (Vermelho)
  | 'waiting-docs' // Aguardando Validação de Documentação (Amarelo)
  | 'completed'    // Documentação Validada (Verde)
  | 'ready'        // Aguardando Embarque (Azul)
  | 'urgent'       // Pedido Urgente (Roxo)
  | 'new';         // Novo pedido (Cinza)