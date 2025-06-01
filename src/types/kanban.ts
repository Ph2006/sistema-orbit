// types/kanban.ts - Código Completo com Google Drive adicionado

export type OrderStatus = 
  | 'in-progress' 
  | 'delayed' 
  | 'waiting-docs' 
  | 'completed' 
  | 'ready' 
  | 'urgent'
  | 'quality-control';

export interface StatusHistoryEntry {
  status: OrderStatus;
  date: string;
  user: string;
  notes?: string;
}

export interface OrderItem {
  id: string;
  itemNumber: number;
  code: string;
  description?: string;
  name?: string;
  quantity: number;
  unitWeight: number;
  specifications?: string;
  progress?: Record<string, number>;
  overallProgress?: number;
  actualDeliveryDate?: string; // NOVA: Data de entrega real do item
  stagePlanning?: Record<string, {
    days: number;
    startDate: string;
    endDate: string;
    responsible: string;
  }>;
  materials?: string[];
  drawings?: string[];
  notes?: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface Order {
  id: string;
  orderNumber: string;
  internalOrderNumber: string;
  customer: string;
  deliveryDate: string;
  startDate?: string;
  actualDeliveryDate?: string; // NOVA: Data de entrega real
  status: OrderStatus;
  items?: OrderItem[];
  totalWeight?: number;
  progress?: number;
  deleted?: boolean;
  columnId?: string;
  projectId?: string;
  statusChangedAt?: string;
  statusHistory?: StatusHistoryEntry[];
  lastExportDate?: string;
  completedDate?: string;
  
  // Propriedades de documentação
  hasDrawings?: boolean;
  hasInspectionPlan?: boolean;
  hasPaintPlan?: boolean;
  
  // NOVAS: Informações de embarque
  shippingList?: string; // LE - Lista de Embarque
  invoice?: string; // NF - Nota Fiscal
  
  // NOVA: Google Drive Integration
  googleDriveLink?: string; // Link para a pasta do Google Drive do pedido
  googleDriveFolderId?: string; // ID da pasta no Google Drive (opcional, para API)
  
  // Propriedades adicionais
  priority?: 'low' | 'medium' | 'high' | 'urgent';
  description?: string;
  notes?: string;
  estimatedDuration?: number; // em dias
  actualDuration?: number; // em dias
  
  // Dados do cliente
  customerContact?: string;
  customerEmail?: string;
  customerPhone?: string;
  
  // Dados financeiros
  estimatedValue?: number;
  actualValue?: number;
  currency?: string;
  
  // Controle de qualidade
  qualityControlStatus?: 'pending' | 'in-progress' | 'approved' | 'rejected';
  qualityControlNotes?: string;
  qualityControlDate?: string;
  qualityControlResponsible?: string;
  
  // Metadados
  createdAt?: string;
  updatedAt?: string;
  createdBy?: string;
  updatedBy?: string;
  version?: number;
  
  // Arquivos e documentos
  attachments?: {
    id: string;
    name: string;
    url: string;
    type: string;
    size: number;
    uploadedAt: string;
    uploadedBy: string;
  }[];
  
  // Rastreamento de mudanças
  changeLog?: {
    date: string;
    user: string;
    action: string;
    details: string;
    previousValue?: any;
    newValue?: any;
  }[];
}

export interface Column {
  id: string;
  title: string;
  color?: string;
  order: number;
  maxItems?: number;
  isDefault?: boolean;
  description?: string;
  
  // Configurações visuais
  backgroundColor?: string;
  textColor?: string;
  borderColor?: string;
  
  // Regras de negócio
  allowedStatuses?: OrderStatus[];
  autoMoveRules?: {
    condition: string;
    targetColumnId: string;
  }[];
  
  // Metadados
  createdAt?: string;
  updatedAt?: string;
  createdBy?: string;
}

export interface Project {
  id: string;
  name: string;
  description?: string;
  startDate: string;
  endDate?: string;
  status: 'planning' | 'active' | 'on-hold' | 'completed' | 'cancelled';
  manager?: string;
  team?: string[];
  budget?: number;
  actualCost?: number;
  progress?: number;
  
  // Configurações
  defaultPriority?: Order['priority'];
  estimatedDuration?: number;
  
  // Metadados
  createdAt?: string;
  updatedAt?: string;
  createdBy?: string;
}

export interface Customer {
  id: string;
  name: string;
  companyName?: string;
  email?: string;
  phone?: string;
  address?: {
    street: string;
    city: string;
    state: string;
    zipCode: string;
    country: string;
  };
  
  // Dados comerciais
  customerType?: 'individual' | 'company' | 'government';
  paymentTerms?: string;
  creditLimit?: number;
  discount?: number;
  
  // Contatos
  contacts?: {
    id: string;
    name: string;
    role: string;
    email: string;
    phone: string;
    isPrimary: boolean;
  }[];
  
  // Histórico
  totalOrders?: number;
  totalValue?: number;
  averageOrderValue?: number;
  lastOrderDate?: string;
  
  // Configurações
  preferredCurrency?: string;
  preferredLanguage?: string;
  timeZone?: string;
  
  // Status
  isActive?: boolean;
  blacklisted?: boolean;
  
  // Metadados
  createdAt?: string;
  updatedAt?: string;
  createdBy?: string;
  notes?: string;
}

export interface ManufacturingStage {
  id: string;
  name: string;
  description?: string;
  order: number;
  active: boolean;
  defaultDays?: number;
  category?: string;
  
  // Configurações
  allowParallel?: boolean;
  prerequisites?: string[];
  equipment?: string[];
  skills?: string[];
  
  // Estimativas
  estimatedHours?: number;
  estimatedCost?: number;
  
  // Metadados
  createdAt?: string;
  updatedAt?: string;
  createdBy?: string;
}

export interface TeamMember {
  id: string;
  name: string;
  email: string;
  role: string;
  department?: string;
  skills?: string[];
  availability?: number; // porcentagem
  hourlyRate?: number;
  
  // Contato
  phone?: string;
  extension?: string;
  
  // Status
  isActive?: boolean;
  startDate?: string;
  endDate?: string;
  
  // Metadados
  createdAt?: string;
  updatedAt?: string;
}

export interface KanbanSettings {
  // Configurações visuais
  theme?: 'light' | 'dark' | 'auto';
  compactView?: boolean;
  showProgress?: boolean;
  showWeights?: boolean;
  showDates?: boolean;
  
  // Configurações de funcionamento
  autoSave?: boolean;
  autoSaveInterval?: number; // em segundos
  enableDragDrop?: boolean;
  enableNotifications?: boolean;
  
  // Configurações de filtros
  defaultFilters?: {
    status?: OrderStatus[];
    customers?: string[];
    projects?: string[];
    dateRange?: {
      start: string;
      end: string;
    };
  };
  
  // Configurações de exportação
  defaultExportFormat?: 'pdf' | 'excel' | 'csv';
  includeLogo?: boolean;
  logoUrl?: string;
  companyName?: string;
  
  // Notificações
  notificationSettings?: {
    emailNotifications?: boolean;
    pushNotifications?: boolean;
    deadlineWarnings?: number; // dias antes do prazo
    delayedOrderAlerts?: boolean;
  };
  
  // NOVA: Configurações do Google Drive
  googleDriveSettings?: {
    enabled?: boolean;
    defaultFolderStructure?: string; // Template para estrutura de pastas
    autoCreateFolders?: boolean; // Criar pastas automaticamente
    folderNamingPattern?: string; // Padrão: "{orderNumber} - {customer}"
    sharedWithTeam?: boolean; // Compartilhar com equipe automaticamente
  };
}

// Tipos para filtros e busca
export interface FilterOptions {
  status?: OrderStatus[];
  customers?: string[];
  projects?: string[];
  dateRange?: {
    start: string;
    end: string;
  };
  priority?: Order['priority'][];
  searchTerm?: string;
  hasDelays?: boolean;
  hasDocuments?: boolean;
  hasGoogleDrive?: boolean; // NOVO: Filtrar por pedidos com Google Drive
}

// Tipos para estatísticas
export interface OrderStatistics {
  totalOrders: number;
  completedOrders: number;
  delayedOrders: number;
  totalWeight: number;
  averageCompletionTime: number;
  onTimeDeliveryRate: number;
  
  // Por período
  monthly: {
    [month: string]: {
      orders: number;
      weight: number;
      completionRate: number;
    };
  };
  
  // Por status
  byStatus: {
    [status in OrderStatus]: number;
  };
  
  // Por cliente
  byCustomer: {
    [customer: string]: {
      orders: number;
      weight: number;
      value: number;
    };
  };
}

// Tipos para relatórios
export interface ReportConfig {
  type: 'orders' | 'production' | 'quality' | 'financial';
  period: {
    start: string;
    end: string;
  };
  filters?: FilterOptions;
  groupBy?: 'customer' | 'project' | 'status' | 'month';
  includeCharts?: boolean;
  format: 'pdf' | 'excel' | 'csv';
}

// Tipos para backup e sincronização
export interface BackupData {
  version: string;
  timestamp: string;
  orders: Order[];
  columns: Column[];
  projects: Project[];
  customers: Customer[];
  settings: KanbanSettings;
  manufacturingStages: ManufacturingStage[];
  teamMembers: TeamMember[];
}

// Tipos para integração com APIs externas
export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
  timestamp: string;
}

export interface PaginatedResponse<T> extends ApiResponse<T[]> {
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

// Tipos para webhooks e eventos
export type WebhookEvent = 
  | 'order.created'
  | 'order.updated'
  | 'order.deleted'
  | 'order.status_changed'
  | 'order.completed'
  | 'order.delayed'
  | 'column.created'
  | 'column.updated'
  | 'column.deleted'
  | 'googledrive.linked'    // NOVO: Link do Google Drive adicionado
  | 'googledrive.updated'; // NOVO: Link do Google Drive atualizado

export interface WebhookPayload {
  event: WebhookEvent;
  timestamp: string;
  data: any;
  user?: string;
}

// NOVA: Interface específica para operações do Google Drive
export interface GoogleDriveIntegration {
  createOrderFolder: (order: Order) => Promise<string>; // Retorna o link da pasta criada
  updateOrderFolder: (orderId: string, newData: Partial<Order>) => Promise<void>;
  shareFolder: (folderId: string, emails: string[]) => Promise<void>;
  uploadFile: (folderId: string, file: File) => Promise<string>; // Retorna o link do arquivo
  getFolderContents: (folderId: string) => Promise<any[]>;
  generateFolderName: (order: Order) => string;
}

// Tipos para validação
export interface ValidationError {
  field: string;
  message: string;
  code: string;
}

export interface ValidationResult {
  isValid: boolean;
  errors: ValidationError[];
}

// Tipos para cache e performance
export interface CacheEntry<T> {
  data: T;
  timestamp: number;
  ttl: number; // time to live em segundos
}

// Exportar todos os tipos como default também
export default {
  OrderStatus,
  StatusHistoryEntry,
  OrderItem,
  Order,
  Column,
  Project,
  Customer,
  ManufacturingStage,
  TeamMember,
  KanbanSettings,
  FilterOptions,
  OrderStatistics,
  ReportConfig,
  BackupData,
  ApiResponse,
  PaginatedResponse,
  WebhookEvent,
  WebhookPayload,
  ValidationError,
  ValidationResult,
  CacheEntry,
  GoogleDriveIntegration
};
