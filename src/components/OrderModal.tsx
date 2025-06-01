import React, { useState, useEffect } from 'react';
import { Order, OrderItem } from '../types/kanban';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { X, Save, Trash, FileText, Plus } from 'lucide-react';

interface OrderModalProps {
  order: Order;
  onClose: () => void;
  onUpdateOrder: (order: Order) => void;
  onDeleteOrder: (orderId: string) => void;
  generateReport?: () => void;
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
  const [isEditing, setIsEditing] = useState(false);
  const [showItemsSection, setShowItemsSection] = useState(true);
  const [newItem, setNewItem] = useState<OrderItem>({
    id: '',
    code: '',
    description: '',
    quantity: 1,
    unitWeight: 0,
    overallProgress: 0
  });
  
  useEffect(() => {
    setEditedOrder({ ...order });
  }, [order]);
  
  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setEditedOrder(prev => ({
      ...prev,
      [name]: value
    }));
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
  
  const handleAddItem = () => {
    if (!newItem.code) return;
    
    const newItemWithId = {
      ...newItem,
      id: Date.now().toString()
    };
    
    setEditedOrder(prev => ({
      ...prev,
      items: [...(prev.items || []), newItemWithId]
    }));
    
    setNewItem({
      id: '',
      code: '',
      description: '',
      quantity: 1,
      unitWeight: 0,
      overallProgress: 0
    });
  };
  
  const handleRemoveItem = (itemId: string) => {
    setEditedOrder(prev => ({
      ...prev,
      items: (prev.items || []).filter(item => item.id !== itemId)
    }));
  };
  
  const handleItemChange = (itemId: string, field: keyof OrderItem, value: any) => {
    setEditedOrder(prev => ({
      ...prev,
      items: (prev.items || []).map(item => 
        item.id === itemId ? { ...item, [field]: value } : item
      )
    }));
  };
  
  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-start justify-center overflow-y-auto pt-10 pb-10">
      <div className="bg-gray-800 w-full max-w-3xl rounded-lg shadow-2xl border border-gray-700 overflow-hidden">
        {/* Cabeçalho */}
        <div className="bg-gray-700 px-6 py-4 flex justify-between items-center border-b border-gray-600">
          <h2 className="text-xl font-bold text-white">Pedido #{editedOrder.orderNumber}</h2>
          <button 
            onClick={onClose}
            className="text-gray-400 hover:text-white transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        
        {/* Corpo do modal */}
        <div className="px-6 py-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
            {/* Número do Pedido */}
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">
                Número do Pedido *
              </label>
              <input 
                type="text"
                name="orderNumber"
                value={editedOrder.orderNumber || ''}
                onChange={handleChange}
                className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-md text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            
            {/* OS Interna */}
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">
                OS Interna *
              </label>
              <input 
                type="text"
                name="internalOrderNumber"
                value={editedOrder.internalOrderNumber || ''}
                onChange={handleChange}
                className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-md text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            
            {/* Cliente */}
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">
                Cliente *
              </label>
              <input 
                type="text"
                name="customer"
                value={editedOrder.customer || ''}
                onChange={handleChange}
                className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-md text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            
            {/* Status */}
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">
                Status
              </label>
              <select
                name="status"
                value={editedOrder.status || ''}
                onChange={handleChange}
                className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-md text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="waiting">Aguardando</option>
                <option value="in-progress">Em Processo</option>
                <option value="delayed">Atrasado</option>
                <option value="completed">Concluído</option>
                <option value="urgent">Urgente</option>
                <option value="on-hold">Em Espera</option>
                <option value="waiting-docs">Aguardando Docs</option>
                <option value="ready">Pronto</option>
              </select>
            </div>
            
            {/* Projeto */}
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">
                Projeto do Cliente
              </label>
              <select
                name="projectId"
                value={editedOrder.projectId || ''}
                onChange={handleChange}
                className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-md text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="">Selecione um projeto</option>
                {projects.map(project => (
                  <option key={project.id} value={project.id}>
                    {project.name}
                  </option>
                ))}
              </select>
            </div>
            
            {/* Peso Total */}
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">
                Peso Total (kg)
              </label>
              <input 
                type="number"
                step="0.1"
                name="totalWeight"
                value={editedOrder.totalWeight || ''}
                onChange={handleChange}
                className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-md text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            
            {/* Data de Início */}
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">
                Data de Início *
              </label>
              <input 
                type="date"
                name="startDate"
                value={editedOrder.startDate || ''}
                onChange={handleChange}
                className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-md text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            
            {/* Data de Entrega */}
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">
                Data de Entrega *
              </label>
              <input 
                type="date"
                name="deliveryDate"
                value={editedOrder.deliveryDate || ''}
                onChange={handleChange}
                className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-md text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            
            {/* Data de Conclusão */}
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">
                Data de Conclusão
              </label>
              <input 
                type="date"
                name="completionDate"
                value={editedOrder.completionDate || ''}
                onChange={handleChange}
                className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-md text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>
          
          {/* Descrição */}
          <div className="mb-6">
            <label className="block text-sm font-medium text-gray-300 mb-2">
              Descrição
            </label>
            <textarea 
              name="notes"
              value={editedOrder.notes || ''}
              onChange={handleChange}
              rows={3}
              className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-md text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="Descrição do pedido..."
            />
          </div>
          
          {/* Observações */}
          <div className="mb-6">
            <label className="block text-sm font-medium text-gray-300 mb-2">
              Observações
            </label>
            <textarea 
              name="observations"
              value={editedOrder.observations || ''}
              onChange={handleChange}
              rows={2}
              className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-md text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="Observações adicionais..."
            />
          </div>
          
          {/* Seção de Itens */}
          <div className="mb-6 border border-gray-600 rounded-lg p-4">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-medium text-white flex items-center">
                <span className="mr-2">📦</span> Itens do Pedido
              </h3>
              <button
                type="button"
                onClick={() => setShowItemsSection(!showItemsSection)}
                className="text-gray-400 hover:text-white transition-colors text-sm"
              >
                {showItemsSection ? 'Ocultar' : 'Mostrar'}
              </button>
            </div>
            
            {showItemsSection && (
              <>
                {/* Lista de itens existentes */}
                <div className="mb-4 max-h-64 overflow-y-auto bg-gray-700/50 rounded-lg p-2">
                  {editedOrder.items && editedOrder.items.length > 0 ? (
                    <div className="space-y-2">
                      {editedOrder.items.map((item, index) => (
                        <div 
                          key={item.id || index} 
                          className="bg-gray-700 border border-gray-600 rounded-lg p-3 flex flex-col"
                        >
                          <div className="flex justify-between items-start mb-2">
                            <div>
                              <div className="font-medium text-white">{item.code || `Item ${index + 1}`}</div>
                              <div className="text-sm text-gray-300 truncate max-w-xs">{item.description}</div>
                            </div>
                            <button
                              onClick={() => handleRemoveItem(item.id)}
                              className="text-red-400 hover:text-red-300 transition-colors"
                              title="Remover item"
                            >
                              <Trash className="h-4 w-4" />
                            </button>
                          </div>
                          
                          <div className="grid grid-cols-3 gap-2 mt-2">
                            <div>
                              <div className="text-xs text-gray-400">Quantidade</div>
                              <input
                                type="number"
                                min="1"
                                value={item.quantity || 1}
                                onChange={(e) => handleItemChange(item.id, 'quantity', parseInt(e.target.value) || 1)}
                                className="w-full bg-gray-600 border border-gray-500 rounded px-2 py-1 text-sm text-white"
                              />
                            </div>
                            <div>
                              <div className="text-xs text-gray-400">Peso Unitário (kg)</div>
                              <input
                                type="number"
                                step="0.1"
                                value={item.unitWeight || 0}
                                onChange={(e) => handleItemChange(item.id, 'unitWeight', parseFloat(e.target.value) || 0)}
                                className="w-full bg-gray-600 border border-gray-500 rounded px-2 py-1 text-sm text-white"
                              />
                            </div>
                            <div>
                              <div className="text-xs text-gray-400">Progresso (%)</div>
                              <input
                                type="number"
                                min="0"
                                max="100"
                                value={item.overallProgress || 0}
                                onChange={(e) => handleItemChange(item.id, 'overallProgress', Math.min(100, Math.max(0, parseInt(e.target.value) || 0)))}
                                className="w-full bg-gray-600 border border-gray-500 rounded px-2 py-1 text-sm text-white"
                              />
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="text-center py-8 text-gray-400">
                      Nenhum item cadastrado para este pedido
                    </div>
                  )}
                </div>
                
                {/* Formulário para adicionar novo item */}
                <div className="p-3 bg-gray-700 rounded-lg mb-2">
                  <div className="text-sm font-medium text-white mb-2">Adicionar Novo Item</div>
                  <div className="grid grid-cols-2 gap-2 mb-2">
                    <input
                      type="text"
                      placeholder="Código"
                      value={newItem.code}
                      onChange={e => setNewItem({...newItem, code: e.target.value})}
                      className="px-3 py-2 bg-gray-600 border border-gray-500 rounded text-white text-sm"
                    />
                    <input
                      type="text"
                      placeholder="Descrição"
                      value={newItem.description}
                      onChange={e => setNewItem({...newItem, description: e.target.value})}
                      className="px-3 py-2 bg-gray-600 border border-gray-500 rounded text-white text-sm"
                    />
                  </div>
                  <div className="grid grid-cols-3 gap-2 mb-2">
                    <input
                      type="number"
                      placeholder="Quantidade"
                      min="1"
                      value={newItem.quantity}
                      onChange={e => setNewItem({...newItem, quantity: parseInt(e.target.value) || 1})}
                      className="px-3 py-2 bg-gray-600 border border-gray-500 rounded text-white text-sm"
                    />
                    <input
                      type="number"
                      placeholder="Peso Unit. (kg)"
                      step="0.1"
                      value={newItem.unitWeight}
                      onChange={e => setNewItem({...newItem, unitWeight: parseFloat(e.target.value) || 0})}
                      className="px-3 py-2 bg-gray-600 border border-gray-500 rounded text-white text-sm"
                    />
                    <input
                      type="number"
                      placeholder="Progresso (%)"
                      min="0"
                      max="100"
                      value={newItem.overallProgress}
                      onChange={e => setNewItem({...newItem, overallProgress: Math.min(100, Math.max(0, parseInt(e.target.value) || 0))})}
                      className="px-3 py-2 bg-gray-600 border border-gray-500 rounded text-white text-sm"
                    />
                  </div>
                  <button
                    onClick={handleAddItem}
                    disabled={!newItem.code}
                    className={`w-full flex items-center justify-center gap-2 py-1.5 text-sm rounded
                      ${newItem.code 
                        ? 'bg-blue-600 hover:bg-blue-700 text-white' 
                        : 'bg-gray-600 text-gray-400 cursor-not-allowed'}`}
                  >
                    <Plus className="h-4 w-4" />
                    Adicionar Item
                  </button>
                </div>
              </>
            )}
          </div>
          
          {/* Checklist de Documentação */}
          <div className="mb-6">
            <h3 className="text-lg font-medium text-white mb-3 flex items-center">
              <span className="mr-2">📄</span> Checklist de Documentação
            </h3>
            <div className="grid grid-cols-3 gap-4">
              <div className="flex items-center">
                <input
                  type="checkbox"
                  id="drawings"
                  checked={editedOrder.documentation?.drawings || false}
                  onChange={(e) => setEditedOrder({
                    ...editedOrder,
                    documentation: {
                      ...(editedOrder.documentation || {}),
                      drawings: e.target.checked
                    }
                  })}
                  className="w-4 h-4 rounded text-blue-500 bg-gray-700 border-gray-500 focus:ring-blue-500 focus:ring-2"
                />
                <label htmlFor="drawings" className="ml-2 text-sm text-gray-300">
                  Desenhos
                </label>
              </div>
              <div className="flex items-center">
                <input
                  type="checkbox"
                  id="inspectionPlan"
                  checked={editedOrder.documentation?.inspectionPlan || false}
                  onChange={(e) => setEditedOrder({
                    ...editedOrder,
                    documentation: {
                      ...(editedOrder.documentation || {}),
                      inspectionPlan: e.target.checked
                    }
                  })}
                  className="w-4 h-4 rounded text-blue-500 bg-gray-700 border-gray-500 focus:ring-blue-500 focus:ring-2"
                />
                <label htmlFor="inspectionPlan" className="ml-2 text-sm text-gray-300">
                  Plano de Inspeção
                </label>
              </div>
              <div className="flex items-center">
                <input
                  type="checkbox"
                  id="paintingPlan"
                  checked={editedOrder.documentation?.paintingPlan || false}
                  onChange={(e) => setEditedOrder({
                    ...editedOrder,
                    documentation: {
                      ...(editedOrder.documentation || {}),
                      paintingPlan: e.target.checked
                    }
                  })}
                  className="w-4 h-4 rounded text-blue-500 bg-gray-700 border-gray-500 focus:ring-blue-500 focus:ring-2"
                />
                <label htmlFor="paintingPlan" className="ml-2 text-sm text-gray-300">
                  Plano de Pintura
                </label>
              </div>
            </div>
          </div>
        </div>
        
        {/* Rodapé com ações */}
        <div className="bg-gray-700 px-6 py-4 flex justify-between border-t border-gray-600">
          <div>
            <button
              onClick={handleDelete}
              className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg transition-colors mr-2"
            >
              Excluir Pedido
            </button>
            {generateReport && (
              <button
                onClick={generateReport}
                className="px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-lg transition-colors"
              >
                <span className="flex items-center gap-2">
                  <FileText className="h-4 w-4" />
                  Gerar Relatório
                </span>
              </button>
            )}
          </div>
          <div className="flex gap-2">
            <button
              onClick={onClose}
              className="px-4 py-2 bg-gray-600 hover:bg-gray-500 text-white rounded-lg transition-colors"
            >
              Cancelar
            </button>
            <button
              onClick={handleSave}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors flex items-center gap-2"
            >
              <Save className="h-4 w-4" />
              Salvar Alterações
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default OrderModal;
