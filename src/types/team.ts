export interface TeamMember {
  id: string;
  name: string;
  email: string;
  phone: string;
  role: string;
  department: string;
  skills: string[];
  isActive: boolean;
  createdAt: string;
  permissions?: string[]; // Access control permissions
}

export interface Permission {
  id: string;
  module: string;
  description: string;
}

export const AVAILABLE_PERMISSIONS = [
  { id: 'dashboard', module: 'Dashboard', description: 'Acesso ao painel principal' },
  { id: 'orders', module: 'Pedidos', description: 'Gerenciamento de pedidos' },
  { id: 'kanban', module: 'Kanban', description: 'Visualização e edição do quadro Kanban' },
  { id: 'occupation', module: 'Taxa de Ocupação', description: 'Visualização da taxa de ocupação' },
  { id: 'quotations', module: 'Orçamentos', description: 'Gerenciamento de orçamentos' },
  { id: 'customers', module: 'Clientes', description: 'Gerenciamento de clientes' },
  { id: 'team', module: 'Equipe', description: 'Gerenciamento de equipe' },
  { id: 'quality', module: 'Controle de Qualidade', description: 'Controle de qualidade' },
  { id: 'material-requisitions', module: 'Requisição de Materiais', description: 'Gerenciamento de requisições de materiais' },
  { id: 'supplier-portal', module: 'Portal do Fornecedor', description: 'Acesso ao portal do fornecedor' },
  { id: 'financial', module: 'Controle Financeiro', description: 'Acesso ao controle financeiro' }
];