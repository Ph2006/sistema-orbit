import React, { useState, useEffect } from 'react';
import { Plus, Search, Trash2, Edit, Calendar as CalendarIcon, List, Clock, AlertTriangle, CheckCircle2, Hourglass, Package, Ship, ClipboardList, Briefcase, FileText } from 'lucide-react';
import { Order, OrderItem, ClientProject } from '../types/kanban';
import { useOrderStore } from '../store/orderStore';
import { useColumnStore } from '../store/columnStore';
import { useProductionOrderStore } from '../store/productionOrderStore';
import { useProjectStore } from '../store/projectStore';
import OrderModal from './OrderModal';
import OrderHistory from './OrderHistory';
import OrderCalendar from './OrderCalendar';
import ProjectModal from './ProjectModal';
import { format, isBefore, isToday, addDays } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { collection, query, orderBy, getDocs } from 'firebase/firestore';
import { db, getCompanyCollection } from '../lib/firebase';

const Orders: React.FC = () => {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const { orders, deleteOrder, updateOrder, addOrder, subscribeToOrders } = useOrderStore();
  const { columns, initializeDefaultColumns, subscribeToColumns } = useColumnStore();
  const { addProductionOrder } = useProductionOrderStore();
  const { projects, subscribeToProjects, loadProjects } = useProjectStore();
  const [showCalendarView, setShowCalendarView] = useState(false);
  const [isHistoryOpen, setIsHistoryOpen] = useState(false);
  const [isGeneratingProductionOrders, setIsGeneratingProductionOrders] = useState(false);
  const [isProjectModalOpen, setIsProjectModalOpen] = useState(false);
  const [selectedProject, setSelectedProject] = useState<ClientProject | null>(null);

  // Filtros adicionais
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [dateFilter, setDateFilter] = useState<string>('all');
  const [projectFilter, setProjectFilter] = useState<string>('all');

  useEffect(() => {
    // Ensure columns are initialized on component mount
    if (columns.length === 0) {
      initializeDefaultColumns().catch(error => {
        console.error('Error initializing default columns:', error);
      });
    }
    
    // Subscribe to columns updates to ensure we have the latest state
    const columnsUnsubscribe = subscribeToColumns();
    return () => columnsUnsubscribe();
  }, [columns.length, initializeDefaultColumns, subscribeToColumns]);

  // Subscribe to order updates
  useEffect(() => {
    const unsubscribe = subscribeToOrders();
    return () => unsubscribe();
  }, [subscribeToOrders]);

  // Load and subscribe to projects
  useEffect(() => {
    loadProjects();
    const unsubscribe = subscribeToProjects();
    return () => unsubscribe();
  }, [loadProjects, subscribeToProjects]);

  const handleAddOrder = () => {
    setSelectedOrder(null);
    setIsModalOpen(true);
  };

  const handleEditOrder = (order: Order, e?: React.MouseEvent) => {
    if (e) {
      e.stopPropagation();
    }
    setSelectedOrder(order);
    setIsModalOpen(true);
  };

  const handleViewHistory = (order: Order, e: React.MouseEvent) => {
    e.stopPropagation();
    setSelectedOrder(order);
    setIsHistoryOpen(true);
  };

  const handleDeleteOrder = async (order: Order, e: React.MouseEvent) => {
    e.stopPropagation();
    if (window.confirm('Tem certeza que deseja excluir este pedido?')) {
      try {
        await deleteOrder(order.id);
      } catch (error) {
        console.error('Error deleting order:', error);
        alert('Erro ao excluir pedido. Por favor, tente novamente.');
      }
    }
  };

  const handleStatusChange = async (order: Order, newStatus: string, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await updateOrder({
        ...order,
        status: newStatus as any,
        statusChangedAt: new Date().toISOString(),
        statusHistory: [
          ...((order.statusHistory || []) as any[]),
          {
            status: order.status,
            date: new Date().toISOString(),
            user: 'usuario@atual.com' // Idealmente, usar o usuário logado
          }
        ]
      });
    } catch (error) {
      console.error('Error updating order status:', error);
      alert('Erro ao atualizar status. Por favor, tente novamente.');
    }
  };

  const handleSaveOrder = async (order: Order) => {
    try {
      // Make sure we have columns available
      if (columns.length === 0) {
        console.log("No columns available, initializing default columns...");
        await initializeDefaultColumns();
        
        // Get fresh columns from the store after initialization
        const freshColumns = useColumnStore.getState().columns;
        
        // If still no columns after initialization, show error
        if (freshColumns.length === 0) {
          throw new Error('No columns available');
        }
        
        // Use the first column as default
        order.columnId = freshColumns[0].id;
      } else if (!order.columnId || !columns.some(c => c.id === order.columnId)) {
        // If order doesn't have a valid columnId, assign the first available column
        order.columnId = columns[0].id;
      }
      
      // Sanitize the order object to replace undefined values with null
      // This prevents Firestore from rejecting documents with undefined values
      const sanitizedOrder = sanitizeForFirestore({
        ...order,
        columnId: order.columnId
      });
      
      console.log('Saving order with columnId:', sanitizedOrder.columnId);
      
      // Check if this is a new order or an existing order
      const isNewOrder = order.id === 'new' || !orders.some(o => o.id === order.id);
      
      if (isNewOrder) {
        // Use addOrder for new orders
        await addOrder(sanitizedOrder);
      } else {
        // Use updateOrder for existing orders
        await updateOrder(sanitizedOrder);
      }
      
      setIsModalOpen(false);
      setSelectedOrder(null);
    } catch (error) {
      console.error('Error saving order:', error);
      alert('Erro ao salvar pedido. Por favor, tente novamente.');
    }
  };

  const handleSaveProject = async (project: ClientProject) => {
    try {
      if (project.id) {
        await useProjectStore.getState().updateProject(project);
      } else {
        await useProjectStore.getState().addProject(project);
      }
      setIsProjectModalOpen(false);
      setSelectedProject(null);
    } catch (error) {
      console.error('Error saving project:', error);
      alert('Erro ao salvar projeto. Por favor, tente novamente.');
    }
  };

  // Create production orders for all stages of an item
  const createProductionOrdersForItem = async (
    order: Order,
    item: OrderItem,
    stages: string[]
  ) => {
    try {
      const startDate = new Date();
      let currentDate = startDate;
      
      for (let i = 0; i < stages.length; i++) {
        const stageName = stages[i];
        
        // Skip stages that already have 100% progress
        if (item.progress && item.progress[stageName] === 100) {
          continue;
        }
        
        // Set due date as 3 days after start date for each stage
        const dueDate = new Date(currentDate);
        dueDate.setDate(dueDate.getDate() + 3);
        
        // Create production order
        await addProductionOrder({
          orderId: order.id,
          itemId: item.id,
          stageId: stageName, // Using stage name as ID
          stageName,
          assignedTo: '',
          status: 'pending',
          priority: 'medium',
          plannedStartDate: currentDate.toISOString(),
          plannedEndDate: dueDate.toISOString(),
          actualStartDate: null,
          actualEndDate: null,
          notes: '',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          createdBy: 'system',
          workInstructions: [],
          materialsRequired: [],
          qualityChecklist: [],
          startCode: '',
          endCode: '',
          history: []
        });
        
        // Set next stage to start after this one ends
        currentDate = dueDate;
      }
      
      return true;
    } catch (error) {
      console.error('Error creating production orders:', error);
      return false;
    }
  };

  // Generate production orders for a complete order
  const handleGenerateProductionOrders = async (order: Order, e: React.MouseEvent) => {
    e.stopPropagation();
    
    if (isGeneratingProductionOrders) return;
    
    if (!window.confirm(`Deseja gerar ordens de produção para todas as etapas do pedido #${order.orderNumber}?`)) {
      return;
    }
    
    setIsGeneratingProductionOrders(true);
    
    try {
      // Load manufacturing stages from Firestore
      const stagesRef = collection(db, getCompanyCollection('manufacturingStages'));
      const stagesQuery = query(stagesRef, orderBy('order', 'asc'));
      const stagesSnapshot = await getDocs(stagesQuery);
      
      if (stagesSnapshot.empty) {
        alert('Nenhuma etapa de fabricação encontrada. Configure as etapas primeiro.');
        return;
      }
      
      const manufacturingStages = stagesSnapshot.docs
        .map(doc => doc.data().name as string)
        .filter(Boolean);
      
      // Generate production orders for each item
      const results = await Promise.all(
        order.items.map(item => 
          createProductionOrdersForItem(order, item, manufacturingStages)
        )
      );
      
      const successCount = results.filter(Boolean).length;
      
      alert(`Foram geradas ordens de produção para ${successCount} de ${order.items.length} itens.`);
      
    } catch (error) {
      console.error('Error generating production orders:', error);
      alert('Erro ao gerar ordens de produção. Por favor, tente novamente.');
    } finally {
      setIsGeneratingProductionOrders(false);
    }
  };

  // Helper function to sanitize objects for Firestore
  const sanitizeForFirestore = (obj: any): any => {
    if (obj === null || obj === undefined) return null;
    if (typeof obj !== 'object') return obj;
    
    if (Array.isArray(obj)) {
      return obj.map(item => sanitizeForFirestore(item));
    }
    
    const sanitized: Record<string, any> = {};
    for (const [key, value] of Object.entries(obj)) {
      if (value === undefined) {
        sanitized[key] = null;
      } else if (typeof value === 'object' && value !== null) {
        sanitized[key] = sanitizeForFirestore(value);
      } else {
        sanitized[key] = value;
      }
    }
    
    return sanitized;
  };

  // Função para filtrar por status, data e termo de busca
  const getFilteredOrders = () => {
    return orders.filter(order => {
      // Filtrar pedidos excluídos
      if (order.deleted) return false;
      
      // Filtro por status
      if (statusFilter !== 'all' && order.status !== statusFilter) {
        return false;
      }

      // Filtro por data
      const today = new Date();
      const deliveryDate = new Date(order.deliveryDate);
      
      if (dateFilter === 'late') {
        // Check if the order is late (past delivery date and not completed)
        if (order.status === 'completed' || order.completedDate) return false;
        return isBefore(deliveryDate, today);
      } else if (dateFilter === 'today') {
        return isToday(deliveryDate);
      } else if (dateFilter === 'week') {
        const nextWeek = addDays(today, 7);
        if (isBefore(deliveryDate, today) || !isBefore(deliveryDate, nextWeek)) {
          return false;
        }
      }

      // Filtro por projeto
      if (projectFilter !== 'all' && order.projectId !== projectFilter) {
        return false;
      }

      // Filtro por termo de busca
      const searchLower = searchTerm.toLowerCase();
      if (searchLower) {
        return (
          order.orderNumber.toLowerCase().includes(searchLower) ||
          order.customer.toLowerCase().includes(searchLower) ||
          order.internalOrderNumber.toLowerCase().includes(searchLower)
        );
      }

      return true;
    });
  };

  const filteredOrders = getFilteredOrders();

  // Renderizar ícone de status
  const renderStatusIcon = (status: string) => {
    switch (status) {
      case 'delayed':
        return <AlertTriangle className="h-5 w-5 text-red-500" />;
      case 'completed':
        return <CheckCircle2 className="h-5 w-5 text-green-500" />;
      case 'urgent':
        return <Clock className="h-5 w-5 text-purple-500" />;
      case 'waiting-docs':
        return <Hourglass className="h-5 w-5 text-yellow-500" />;
      case 'ready':
        return <Ship className="h-5 w-5 text-blue-500" />;
      default: // in-progress
        return <Package className="h-5 w-5 text-orange-500" />;
    }
  };

  // Função para verificar se um pedido tem checklist
  const hasChecklist = (order: Order): boolean => {
    return !!order.checklist;
  };

  // Função para calcular se um pedido está atrasado
  const isOrderLate = (order: Order): boolean => {
    // If completed or has a completion date, it's not late
    if (order.status === 'completed' || order.completedDate) {
      return false;
    }
    
    // If not completed, check if delivery date has passed
    const today = new Date();
    return isBefore(new Date(order.deliveryDate), today);
  };

  // Função para calcular dias restantes até a entrega
  const getDaysUntilDelivery = (order: Order) => {
    // For completed orders, calculate how many days past/before the deadline it was completed
    if (order.completedDate) {
      const deliveryDate = new Date(order.deliveryDate);
      const completionDate = new Date(order.completedDate);
      return Math.ceil((completionDate.getTime() - deliveryDate.getTime()) / (1000 * 60 * 60 * 24));
    }
    
    // For non-completed orders, calculate days remaining until delivery
    const today = new Date();
    const deliveryDate = new Date(order.deliveryDate);
    return Math.ceil((deliveryDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
  };

  // Obter nome do projeto para um pedido
  const getProjectName = (projectId?: string): string => {
    if (!projectId) return 'Sem projeto';
    
    // First check if there's a project with this ID
    const project = projects.find(p => p.id === projectId);
    if (project) return project.name;
    
    // If not found in projects, check for projectName directly on orders
    const orderWithName = orders.find(o => o.projectId === projectId && o.projectName);
    if (orderWithName?.projectName) return orderWithName.projectName;
    
    return 'Projeto não encontrado';
  };

  return (
    <div className="p-6">
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-2xl font-bold">Pedidos</h2>
        <div className="flex space-x-4">
          <button
            onClick={() => {
              setSelectedProject(null);
              setIsProjectModalOpen(true);
            }}
            className="flex items-center px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700"
          >
            <Briefcase className="h-5 w-5 mr-2" />
            Novo Projeto
          </button>
          <button
            onClick={() => setShowCalendarView(!showCalendarView)}
            className="flex items-center px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700"
            title={showCalendarView ? "Visualização em lista" : "Visualização em calendário"}
          >
            {showCalendarView ? (
              <>
                <List className="h-5 w-5 mr-2" />
                Lista
              </>
            ) : (
              <>
                <CalendarIcon className="h-5 w-5 mr-2" />
                Calendário
              </>
            )}
          </button>
          <button
            onClick={handleAddOrder}
            className="flex items-center px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
          >
            <Plus className="h-5 w-5 mr-2" />
            Novo Pedido
          </button>
        </div>
      </div>

      {/* Filtros */}
      <div className="mb-6 grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Buscar por número, cliente ou OS..."
            className="pl-10 w-full rounded-lg border border-gray-300 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          />
        </div>
        
        <div>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="w-full rounded-lg border border-gray-300 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          >
            <option value="all">Todos os status</option>
            <option value="in-progress">Em processo</option>
            <option value="delayed">Atrasado</option>
            <option value="waiting-docs">Aguardando documentação</option>
            <option value="completed">Concluído</option>
            <option value="ready">Pronto para embarque</option>
            <option value="urgent">Urgente</option>
          </select>
        </div>
        
        <div>
          <select
            value={dateFilter}
            onChange={(e) => setDateFilter(e.target.value)}
            className="w-full rounded-lg border border-gray-300 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          >
            <option value="all">Todos os prazos</option>
            <option value="late">Atrasados</option>
            <option value="today">Entrega hoje</option>
            <option value="week">Próximos 7 dias</option>
          </select>
        </div>

        <div>
          <select
            value={projectFilter}
            onChange={(e) => setProjectFilter(e.target.value)}
            className="w-full rounded-lg border border-gray-300 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          >
            <option value="all">Todos os projetos</option>
            {projects.map(project => (
              <option key={project.id} value={project.id}>{project.name}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Lista de Projetos */}
      <div className="mb-6">
        <h3 className="text-lg font-medium mb-4">Projetos do Cliente</h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {projects.length === 0 ? (
            <div className="col-span-3 p-4 bg-gray-50 rounded-lg text-center">
              <p className="text-gray-500">Nenhum projeto cadastrado.</p>
            </div>
          ) : (
            projects.map(project => (
              <div key={project.id} className="bg-white rounded-lg shadow p-4 border border-gray-200">
                <div className="flex justify-between">
                  <h4 className="font-medium">{project.name}</h4>
                  <span className={`px-2 py-1 text-xs rounded-full ${
                    project.status === 'active' 
                      ? 'bg-green-100 text-green-800' 
                      : project.status === 'on-hold'
                      ? 'bg-yellow-100 text-yellow-800'
                      : 'bg-blue-100 text-blue-800'
                  }`}>
                    {project.status === 'active' ? 'Ativo' : 
                     project.status === 'on-hold' ? 'Em Espera' : 'Concluído'}
                  </span>
                </div>
                <p className="text-sm text-gray-600 mt-2">
                  {project.description || 'Sem descrição'}
                </p>
                <div className="mt-3 text-sm">
                  <p><span className="text-gray-500">Gerente:</span> {project.manager}</p>
                  <p><span className="text-gray-500">Prazo:</span> {format(new Date(project.deadline), 'dd/MM/yyyy', { locale: ptBR })}</p>
                </div>
                <div className="mt-3 flex justify-end space-x-2">
                  <button
                    onClick={() => {
                      setSelectedProject(project);
                      setIsProjectModalOpen(true);
                    }}
                    className="text-blue-600 hover:text-blue-800"
                  >
                    <Edit className="h-4 w-4" />
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Contador de pedidos filtrados */}
      <div className="mb-4 text-sm text-gray-600">
        {filteredOrders.length} pedido(s) encontrado(s)
      </div>

      {showCalendarView ? (
        <OrderCalendar 
          orders={filteredOrders} 
          onOrderClick={handleEditOrder}
        />
      ) : (
        <div className="bg-white rounded-lg shadow overflow-hidden">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Número do Pedido
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Cliente
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  OS Interna
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Data de Início
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Data de Entrega
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Projeto
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Checklist
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Status
                </th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Ações
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {filteredOrders.map((order) => {
                const isLate = isOrderLate(order);
                const daysUntil = getDaysUntilDelivery(order);
                const isCompleted = order.status === 'completed' || !!order.completedDate;
                const wasCompletedLate = isCompleted && daysUntil > 0;
                const isCloseToDeadline = !isCompleted && daysUntil > 0 && daysUntil <= 7;
                
                return (
                  <tr 
                    key={order.id}
                    onClick={() => handleEditOrder(order)}
                    className={`cursor-pointer hover:bg-gray-50 ${
                      isCompleted ? 'bg-green-50/50' :
                      isLate ? 'bg-red-50/50' : 
                      isCloseToDeadline ? 'bg-yellow-50/50' : 
                      ''
                    }`}
                  >
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm font-medium text-gray-900">
                        #{order.orderNumber}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm text-gray-900">{order.customer}</div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm text-gray-900">{order.internalOrderNumber}</div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm text-gray-900">
                        {format(new Date(order.startDate), 'dd/MM/yyyy', { locale: ptBR })}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm space-y-1">
                        <div className={`${isLate ? 'font-bold text-red-700' : isCloseToDeadline ? 'font-semibold text-yellow-700' : 'text-gray-900'}`}>
                          {format(new Date(order.deliveryDate), 'dd/MM/yyyy', { locale: ptBR })}
                          {isLate && (
                            <span className="ml-2 bg-red-100 text-red-800 text-xs px-2 py-0.5 rounded-full">
                              {Math.abs(daysUntil)}d atrasado
                            </span>
                          )}
                          {isCloseToDeadline && (
                            <span className="ml-2 bg-yellow-100 text-yellow-800 text-xs px-2 py-0.5 rounded-full">
                              {daysUntil}d restantes
                            </span>
                          )}
                        </div>
                        
                        {order.completedDate && (
                          <div className="flex items-center">
                            <CheckCircle2 className="h-3.5 w-3.5 text-green-600 mr-1" />
                            <span className="text-sm text-green-700">
                              Concluído: {format(new Date(order.completedDate), 'dd/MM/yyyy', { locale: ptBR })}
                              {wasCompletedLate && (
                                <span className="ml-2 bg-orange-100 text-orange-800 text-xs px-2 py-0.5 rounded-full">
                                  {daysUntil}d após o prazo
                                </span>
                              )}
                            </span>
                          </div>
                        )}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm text-gray-900">
                        {order.projectName || (order.projectId ? getProjectName(order.projectId) : '-')}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      {order.checklist ? (
                        <div className="flex space-x-2">
                          <span className={`p-1 ${order.checklist.drawings ? 'bg-blue-100 text-blue-600' : 'bg-gray-100 text-gray-400'} rounded-full`} title="Desenhos">
                            <FileText className="h-4 w-4" />
                          </span>
                          <span className={`p-1 ${order.checklist.inspectionTestPlan ? 'bg-green-100 text-green-600' : 'bg-gray-100 text-gray-400'} rounded-full`} title="Plano de Inspeção e Testes">
                            <CheckCircle2 className="h-4 w-4" />
                          </span>
                          <span className={`p-1 ${order.checklist.paintPlan ? 'bg-purple-100 text-purple-600' : 'bg-gray-100 text-gray-400'} rounded-full`} title="Plano de Pintura">
                            <Brush className="h-4 w-4" />
                          </span>
                        </div>
                      ) : (
                        <span className="text-sm text-gray-500">-</span>
                      )}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex items-center">
                        {renderStatusIcon(order.status)}
                        <div className="ml-2">
                          <select
                            className={`text-xs py-1 px-2 rounded-full border-none ${
                              order.status === 'delayed' ? 'bg-red-100 text-red-800' :
                              order.status === 'completed' ? 'bg-green-100 text-green-800' :
                              order.status === 'urgent' ? 'bg-purple-100 text-purple-800' :
                              order.status === 'waiting-docs' ? 'bg-yellow-100 text-yellow-800' :
                              order.status === 'ready' ? 'bg-blue-100 text-blue-800' :
                              'bg-orange-100 text-orange-800'
                            }`}
                            value={order.status}
                            onClick={(e) => e.stopPropagation()}
                            onChange={(e) => handleStatusChange(order, e.target.value, e as any)}
                          >
                            <option value="in-progress">Em Processo</option>
                            <option value="delayed">Atrasado</option>
                            <option value="waiting-docs">Aguardando Docs</option>
                            <option value="completed">Concluído</option>
                            <option value="ready">Pronto</option>
                            <option value="urgent">Urgente</option>
                          </select>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium space-x-2">
                      <button
                        onClick={(e) => handleGenerateProductionOrders(order, e)}
                        className="text-green-600 hover:text-green-800 inline-block"
                        title="Gerar Ordens de Produção"
                        disabled={isGeneratingProductionOrders}
                      >
                        <ClipboardList className="h-5 w-5" />
                      </button>
                      <button
                        onClick={(e) => handleViewHistory(order, e)}
                        className="text-gray-600 hover:text-gray-900 inline-block"
                        title="Histórico de Alterações"
                      >
                        <Clock className="h-5 w-5" />
                      </button>
                      <button
                        onClick={(e) => handleEditOrder(order, e)}
                        className="text-blue-600 hover:text-blue-900 inline-block"
                        title="Editar Pedido"
                      >
                        <Edit className="h-5 w-5" />
                      </button>
                      <button
                        onClick={(e) => handleDeleteOrder(order, e)}
                        className="text-red-600 hover:text-red-900 inline-block"
                        title="Excluir Pedido"
                      >
                        <Trash2 className="h-5 w-5" />
                      </button>
                    </td>
                  </tr>
                );
              })}

              {filteredOrders.length === 0 && (
                <tr>
                  <td colSpan={9} className="px-6 py-4 text-center text-gray-500">
                    Nenhum pedido encontrado com os filtros selecionados.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {isModalOpen && (
        <OrderModal
          order={selectedOrder}
          onClose={() => {
            setIsModalOpen(false);
            setSelectedOrder(null);
          }}
          onSave={handleSaveOrder}
          projects={projects}
        />
      )}

      {isHistoryOpen && selectedOrder && (
        <OrderHistory
          order={selectedOrder}
          onClose={() => {
            setIsHistoryOpen(false);
            setSelectedOrder(null);
          }}
        />
      )}

      {isProjectModalOpen && (
        <ProjectModal
          project={selectedProject}
          onClose={() => {
            setIsProjectModalOpen(false);
            setSelectedProject(null);
          }}
          onSave={handleSaveProject}
        />
      )}
    </div>
  );
};

// Add Brush icon component
const Brush = (props: any) => {
  return (
    <svg
      {...props}
      xmlns="http://www.w3.org/2000/svg"
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M18 8c0 2.5-1 4-2 6-1.5 2.5-4 3.5-6 5l.5-2 .5-2-1-1-2 .5-2 .5c1.5-2 2.5-4.5 5-6 1.5-1 3.5-2 6-2z"></path>
      <path d="M10 22H8c-3 0-4-1-4-4V6c0-2 1-2 1-2h2"></path>
    </svg>
  );
};

export default Orders;