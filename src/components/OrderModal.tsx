import React, { useState, useEffect } from 'react';
import { Order, OrderItem } from '../types/kanban';
import { format, isValid } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { X, Save, Trash, FileText, ChevronDown, ChevronUp, RefreshCw, Check, Square, CheckSquare } from 'lucide-react';
import ItemProgressModal from './ItemProgressModal';

interface OrderModalProps {
  order: Order;
  onClose: () => void;
  onUpdateOrder: (order: Order) => void;
  onDeleteOrder: (orderId: string) => void;
  generateReport?: (selectedItems: OrderItem[]) => void; // Mudado para receber os objetos completos
  customers: any[];
  projects: any[];
}

const OrderModal: React.FC<OrderModalProps> = ({
  order,
  onClose,
  onUpdateOrder,
  onDeleteOrder,
  generateReport,
  customers,
  projects
}) => {
  const [editedOrder, setEditedOrder] = useState<Order>({ ...order });
  const [showItemsSection, setShowItemsSection] = useState(true);
  const [selectedItemForProgress, setSelectedItemForProgress] = useState<OrderItem | null>(null);
  // Estado para controlar itens selecionados para relatório
  const [selectedItems, setSelectedItems] = useState<string[]>([]);
  
  useEffect(() => {
    setEditedOrder({ ...order });
    // Inicializar lista de itens selecionados como vazia
    setSelectedItems([]);
  }, [order]);
  
  const handleDateChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setEditedOrder(prev => ({
      ...prev,
      [name]: value
    }));
  };

  const handleUpdateProgress = (item: OrderItem) => {
    setSelectedItemForProgress(item);
  };

  const handleSaveItemProgress = (updatedItem: OrderItem) => {
    // Atualizar o item na lista de itens
    const updatedItems = editedOrder.items?.map(item => 
      item.id === updatedItem.id ? updatedItem : item
    ) || [];
    
    setEditedOrder(prev => ({
      ...prev,
      items: updatedItems,
      // Calcular o progresso geral baseado em todos os itens
      progress: updatedItems.length > 0 
        ? Math.round(updatedItems.reduce((sum, item) => sum + (item.overallProgress || 0), 0) / updatedItems.length) 
        : 0
    }));
    
    setSelectedItemForProgress(null);
  };
  
  const handleItemSelect = (itemId: string) => {
    setSelectedItems(prev => {
      if (prev.includes(itemId)) {
        return prev.filter(id => id !== itemId);
      } else {
        return [...prev, itemId];
      }
    });
  };
  
  const handleSelectAllItems = () => {
    if (!editedOrder.items || editedOrder.items.length === 0) return;
    
    const allItemIds = editedOrder.items.map(item => item.id);
    setSelectedItems(allItemIds);
  };
  
  const handleDeselectAllItems = () => {
    setSelectedItems([]);
  };
  
  const handleSave = () => {
    onUpdateOrder(editedOrder);
    onClose();
  };
  
  const handleDelete = () => {
    if (window.confirm("Tem certeza que deseja excluir este pedido?")) {
      onDeleteOrder(order.id);
      onClose();
    }
  };

  const handleGenerateReport = () => {
    if (generateReport && selectedItems.length > 0) {
      // Filtrar apenas os itens selecionados
      const itemsToReport = editedOrder.items?.filter(item => 
        selectedItems.includes(item.id)
      ) || [];
      
      if (itemsToReport.length > 0) {
        // Passar apenas os itens selecionados para a função de geração de relatório
        generateReport(itemsToReport);
      } else {
        alert("Erro ao gerar relatório: itens selecionados não encontrados.");
      }
    } else {
      alert("Por favor, selecione pelo menos um item para gerar o relatório.");
    }
  };

  const formatDate = (dateString?: string) => {
    if (!dateString) return 'Não definida';
    try {
      return format(new Date(dateString), 'dd/MM/yyyy', { locale: ptBR });
    } catch (error) {
      return 'Data inválida';
    }
  };

  const projectName = editedOrder.projectId 
    ? projects.find(p => p.id === editedOrder.projectId)?.name || 'Projeto não encontrado'
    : 'Nenhum projeto';

  const getStatusLabel = (status?: string) => {
    switch(status) {
      case 'waiting': return 'Aguardando';
      case 'in-progress': return 'Em Processo';
      case 'delayed': return 'Atrasado';
      case 'completed': return 'Concluído';
      case 'urgent': return 'Urgente';
      case 'on-hold': return 'Em Espera';
      case 'waiting-docs': return 'Aguardando Docs';
      case 'ready': return 'Pronto';
      default: return 'Indefinido';
    }
  };

  const getStatusClasses = (status?: string) => {
    switch(status) {
      case 'waiting': return 'bg-gray-700 text-gray-300';
      case 'in-progress': return 'bg-blue-900/50 text-blue-300';
      case 'delayed': return 'bg-red-900/50 text-red-300';
      case 'completed': return 'bg-emerald-900/50 text-emerald-300';
      case 'urgent': return 'bg-orange-900/50 text-orange-300';
      case 'on-hold': return 'bg-amber-900/50 text-amber-300';
      case 'waiting-docs': return 'bg-purple-900/50 text-purple-300';
      case 'ready': return 'bg-indigo-900/50 text-indigo-300';
      default: return 'bg-gray-700 text-gray-300';
    }
  };
  
  return (
    <>
      <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center overflow-y-auto p-4">
        <div className="bg-gray-800 w-full max-w-3xl rounded-lg shadow-2xl border border-gray-700 overflow-hidden mx-auto my-auto">
          {/* Cabeçalho */}
          <div className="bg-gray-700 px-4 py-3 sm:px-6 flex justify-between items-center border-b border-gray-600">
            <div className="flex items-center space-x-3">
              <h2 className="text-xl font-bold text-white">Pedido #{editedOrder.orderNumber}</h2>
              <span className={`px-3 py-1 rounded-full text-xs font-medium ${getStatusClasses(editedOrder.status)}`}>
                {getStatusLabel(editedOrder.status)}
              </span>
            </div>
            <button 
              onClick={onClose}
              className="text-gray-400 hover:text-white transition-colors"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
          
          {/* Corpo do modal */}
          <div className="px-4 py-5 sm:p-6 space-y-6">
            {/* Informações principais */}
            <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
              <div className="bg-gray-700/40 rounded-lg p-4 space-y-3">
                <div>
                  <h3 className="text-sm font-medium text-gray-400">Cliente</h3>
                  <p className="mt-1 text-base font-medium text-white">{editedOrder.customer || 'Não informado'}</p>
                </div>
                
                <div>
                  <h3 className="text-sm font-medium text-gray-400">OS Interna</h3>
                  <p className="mt-1 text-base font-medium font-mono text-white">{editedOrder.internalOrderNumber || 'Não informado'}</p>
                </div>
                
                <div>
                  <h3 className="text-sm font-medium text-gray-400">Projeto</h3>
                  <p className="mt-1 text-base text-white">{projectName}</p>
                </div>
              </div>
              
              <div className="bg-gray-700/40 rounded-lg p-4 space-y-3">
                <div>
                  <h3 className="text-sm font-medium text-gray-400">Data de Início</h3>
                  <p className="mt-1 text-base text-white">{formatDate(editedOrder.startDate)}</p>
                </div>
                
                <div>
                  <h3 className="text-sm font-medium text-gray-400">Data de Entrega</h3>
                  <p className="mt-1 text-base text-white">{formatDate(editedOrder.deliveryDate)}</p>
                </div>
                
                <div>
                  <h3 className="text-sm font-medium text-gray-400">Data de Conclusão</h3>
                  <div className="mt-1">
                    <input 
                      type="date"
                      name="completionDate"
                      value={editedOrder.completionDate || ''}
                      onChange={handleDateChange}
                      className="px-3 py-2 bg-gray-700 border border-gray-600 rounded-md text-white w-full focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                    />
                  </div>
                </div>
              </div>
            </div>
            
            {/* Descrição e Observações */}
            {(editedOrder.notes || editedOrder.observations) && (
              <div className="bg-gray-700/40 rounded-lg p-4 space-y-4">
                {editedOrder.notes && (
                  <div>
                    <h3 className="text-sm font-medium text-gray-400 flex items-center gap-2">
                      <span>📝</span>
                      Descrição
                    </h3>
                    <p className="mt-2 text-sm text-gray-300 whitespace-pre-wrap">{editedOrder.notes}</p>
                  </div>
                )}
                
                {editedOrder.observations && (
                  <div>
                    <h3 className="text-sm font-medium text-gray-400 flex items-center gap-2">
                      <span>📌</span>
                      Observações
                    </h3>
                    <p className="mt-2 text-sm text-gray-300 whitespace-pre-wrap">{editedOrder.observations}</p>
                  </div>
                )}
              </div>
            )}
            
            {/* Documentação */}
            {editedOrder.documentation && (
              <div className="bg-gray-700/40 rounded-lg p-4">
                <h3 className="text-sm font-medium text-gray-400 flex items-center gap-2 mb-3">
                  <span>📄</span>
                  Documentação
                </h3>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                  {editedOrder.documentation.drawings && (
                    <div className="bg-gray-700/70 rounded-md px-3 py-2 text-sm text-white flex items-center gap-2">
                      <span className="h-2 w-2 bg-blue-500 rounded-full"></span>
                      Desenhos
                    </div>
                  )}
                  
                  {editedOrder.documentation.inspectionPlan && (
                    <div className="bg-gray-700/70 rounded-md px-3 py-2 text-sm text-white flex items-center gap-2">
                      <span className="h-2 w-2 bg-blue-500 rounded-full"></span>
                      Plano de Inspeção
                    </div>
                  )}
                  
                  {editedOrder.documentation.paintingPlan && (
                    <div className="bg-gray-700/70 rounded-md px-3 py-2 text-sm text-white flex items-center gap-2">
                      <span className="h-2 w-2 bg-blue-500 rounded-full"></span>
                      Plano de Pintura
                    </div>
                  )}
                </div>
              </div>
            )}
            
            {/* Seção de Itens */}
            <div className="bg-gray-700/40 rounded-lg p-4">
              <div className="flex justify-between items-center mb-4">
                <h3 className="text-base font-medium text-white flex items-center gap-2">
                  <span>📦</span> Itens do Pedido ({editedOrder.items?.length || 0})
                </h3>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={handleSelectAllItems}
                    className="text-xs bg-blue-600 hover:bg-blue-700 text-white px-2 py-1 rounded flex items-center gap-1"
                  >
                    <CheckSquare className="h-3 w-3" />
                    Marcar Todos
                  </button>
                  <button
                    type="button"
                    onClick={handleDeselectAllItems}
                    className="text-xs bg-gray-600 hover:bg-gray-500 text-white px-2 py-1 rounded flex items-center gap-1"
                  >
                    <Square className="h-3 w-3" />
                    Desmarcar Todos
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowItemsSection(!showItemsSection)}
                    className="text-gray-400 hover:text-white transition-colors"
                  >
                    {showItemsSection ? (
                      <ChevronUp className="h-4 w-4" />
                    ) : (
                      <ChevronDown className="h-4 w-4" />
                    )}
                  </button>
                </div>
              </div>
              
              {showItemsSection && (
                <div className="space-y-4 max-h-96 overflow-y-auto pr-1 scrollbar-thin scrollbar-thumb-gray-600 scrollbar-track-gray-700">
                  {editedOrder.items && editedOrder.items.length > 0 ? (
                    editedOrder.items.map((item, index) => (
                      <div 
                        key={item.id || index}
                        className="bg-gray-700 border border-gray-600 rounded-lg p-3"
                      >
                        <div className="flex justify-between items-start">
                          {/* Checkbox para selecionar item para relatório */}
                          <div className="flex items-center">
                            <input
                              type="checkbox"
                              id={`select-item-${item.id}`}
                              checked={selectedItems.includes(item.id)}
                              onChange={() => handleItemSelect(item.id)}
                              className="form-checkbox h-4 w-4 text-blue-500 rounded focus:ring-blue-500 border-gray-500 bg-gray-800"
                            />
                            <div className="ml-3 flex-1">
                              <div className="flex items-center gap-2">
                                <span className="font-medium text-white">{item.code || `Item ${index + 1}`}</span>
                                <span className="bg-gray-600 px-2 py-0.5 rounded text-xs text-gray-300">
                                  {item.quantity || 0} un • {((item.unitWeight || 0) * (item.quantity || 0)).toFixed(1)} kg
                                </span>
                              </div>
                              {item.description && (
                                <p className="text-sm text-gray-400 mt-1">{item.description}</p>
                              )}
                            </div>
                          </div>
                          
                          {/* Botão para atualizar progresso */}
                          <button
                            onClick={() => handleUpdateProgress(item)}
                            className="bg-blue-600 hover:bg-blue-700 text-white p-1.5 rounded-md flex-shrink-0 ml-2"
                            title="Atualizar Progresso"
                          >
                            <RefreshCw className="h-4 w-4" />
                          </button>
                        </div>
                        
                        {/* Barra de progresso */}
                        <div className="mt-3">
                          <div className="flex justify-between items-center text-xs text-gray-400 mb-1.5">
                            <span>Progresso</span>
                            <span className="font-medium text-white">{item.overallProgress || 0}%</span>
                          </div>
                          <div className="h-2 bg-gray-600 rounded-full overflow-hidden">
                            <div 
                              className={`h-full rounded-full transition-all ${
                                (item.overallProgress || 0) >= 100 ? 'bg-emerald-500' : 
                                (item.overallProgress || 0) >= 75 ? 'bg-blue-500' : 
                                (item.overallProgress || 0) >= 50 ? 'bg-amber-500' : 
                                'bg-gray-500'
                              }`}
                              style={{ width: `${Math.max(item.overallProgress || 0, 2)}%` }}
                            />
                          </div>
                        </div>
                        
                        {/* Campos adicionais para itens 100% concluídos */}
                        {(item.overallProgress || 0) === 100 && (
                          <div className="mt-4 pt-3 border-t border-gray-600/50 space-y-3">
                            <div className="text-xs font-medium text-emerald-400 mb-2">
                              Item Concluído - Informações de Despacho
                            </div>
                            
                            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                              <div>
                                <label className="block text-xs font-medium text-gray-400 mb-1">
                                  Lista de Embarque (LE)
                                </label>
                                <input 
                                  type="text"
                                  value={item.shippingList || ''}
                                  onChange={(e) => {
                                    const updatedItems = editedOrder.items?.map(i => 
                                      i.id === item.id ? { ...i, shippingList: e.target.value } : i
                                    );
                                    setEditedOrder(prev => ({ ...prev, items: updatedItems }));
                                  }}
                                  placeholder="Número da LE"
                                  className="w-full px-2 py-1 bg-gray-600 border border-gray-500 rounded text-white text-sm focus:outline-none focus:border-blue-500"
                                />
                              </div>
                              
                              <div>
                                <label className="block text-xs font-medium text-gray-400 mb-1">
                                  Nota Fiscal
                                </label>
                                <input 
                                  type="text"
                                  value={item.invoice || ''}
                                  onChange={(e) => {
                                    const updatedItems = editedOrder.items?.map(i => 
                                      i.id === item.id ? { ...i, invoice: e.target.value } : i
                                    );
                                    setEditedOrder(prev => ({ ...prev, items: updatedItems }));
                                  }}
                                  placeholder="Número da NF"
                                  className="w-full px-2 py-1 bg-gray-600 border border-gray-500 rounded text-white text-sm focus:outline-none focus:border-blue-500"
                                />
                              </div>
                              
                              <div className="sm:col-span-2">
                                <label className="block text-xs font-medium text-gray-400 mb-1">
                                  Data de Entrega
                                </label>
                                <input 
                                  type="date"
                                  value={item.deliveryDate || ''}
                                  onChange={(e) => {
                                    const updatedItems = editedOrder.items?.map(i => 
                                      i.id === item.id ? { ...i, deliveryDate: e.target.value } : i
                                    );
                                    setEditedOrder(prev => ({ ...prev, items: updatedItems }));
                                  }}
                                  className="w-full px-2 py-1 bg-gray-600 border border-gray-500 rounded text-white text-sm focus:outline-none focus:border-blue-500"
                                />
                              </div>
                            </div>
                          </div>
                        )}
                      </div>
                    ))
                  ) : (
                    <div className="text-center py-8 text-gray-400">
                      <div className="text-3xl mb-2">📦</div>
                      <p>Nenhum item cadastrado para este pedido</p>
                    </div>
                  )}
                </div>
              )}
            </div>
            
            {/* Progresso geral */}
            <div className="bg-gray-700/40 rounded-lg p-4">
              <div className="flex justify-between items-center text-sm mb-2">
                <h3 className="font-medium text-white">Progresso Geral</h3>
                <span className="text-white font-medium">{editedOrder.progress || 0}%</span>
              </div>
              <div className="h-3 bg-gray-700 rounded-full overflow-hidden">
                <div 
                  className={`h-full rounded-full transition-all ${
                    (editedOrder.progress || 0) >= 100 ? 'bg-emerald-500' : 
                    (editedOrder.progress || 0) >= 75 ? 'bg-blue-500' : 
                    (editedOrder.progress || 0) >= 50 ? 'bg-amber-500' : 
                    'bg-gray-500'
                  }`}
                  style={{ width: `${Math.max(editedOrder.progress || 0, 2)}%` }}
                />
              </div>
            </div>
          </div>
          
          {/* Rodapé com ações */}
          <div className="bg-gray-700 px-4 py-3 sm:px-6 flex flex-col sm:flex-row sm:justify-between border-t border-gray-600 gap-3 sm:gap-0">
            <div className="flex gap-2 flex-col sm:flex-row">
              <button
                onClick={handleDelete}
                className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg transition-colors flex items-center justify-center gap-2"
              >
                <Trash className="h-4 w-4" />
                <span>Excluir</span>
              </button>
              {generateReport && (
                <button
                  onClick={handleGenerateReport}
                  disabled={selectedItems.length === 0}
                  className={`px-4 py-2 ${
                    selectedItems.length > 0
                      ? 'bg-purple-600 hover:bg-purple-700'
                      : 'bg-purple-600/50 cursor-not-allowed'
                  } text-white rounded-lg transition-colors flex items-center justify-center gap-2`}
                  title={selectedItems.length === 0 ? 'Selecione pelo menos um item para gerar relatório' : ''}
                >
                  <FileText className="h-4 w-4" />
                  <span>Gerar Relatório ({selectedItems.length})</span>
                </button>
              )}
            </div>
            <div className="flex gap-2">
              <button
                onClick={onClose}
                className="flex-1 sm:flex-none px-4 py-2 bg-gray-600 hover:bg-gray-500 text-white rounded-lg transition-colors"
              >
                Cancelar
              </button>
              <button
                onClick={handleSave}
                className="flex-1 sm:flex-none px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors flex items-center justify-center gap-2"
              >
                <Save className="h-4 w-4" />
                <span>Salvar</span>
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Modal de Progresso do Item */}
      {selectedItemForProgress && (
        <ItemProgressModal
          item={selectedItemForProgress}
          allItems={editedOrder.items || []}
          onClose={() => setSelectedItemForProgress(null)}
          onSave={handleSaveItemProgress}
        />
      )}
    </>
  );
};

export default OrderModal;
