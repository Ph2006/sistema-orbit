import React from 'react';
import { Order, Project } from '../types/kanban';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

interface KanbanCardProps {
  order: Order;
  isManaging: boolean;
  isSelected: boolean;
  highlight: boolean;
  compactView: boolean;
  onOrderClick: (order: Order) => void;
  projects?: Project[]; // Adicionar projects como prop
}

const KanbanCard: React.FC<KanbanCardProps> = ({ 
  order, 
  isManaging, 
  isSelected, 
  highlight, 
  compactView, 
  onOrderClick,
  projects = [] 
}) => {
  // Buscar o projeto pelo ID
  const project = projects.find(p => p.id === order.projectId);
  const projectName = project?.name || '';

  // Função para determinar a cor do status
  const getStatusColor = (status: string) => {
    switch (status) {
      case 'in-progress': return 'bg-orange-100 border-orange-400 text-orange-800';
      case 'delayed': return 'bg-red-100 border-red-400 text-red-800';
      case 'waiting-docs': return 'bg-yellow-100 border-yellow-400 text-yellow-800';
      case 'completed': return 'bg-green-100 border-green-400 text-green-800';
      case 'ready': return 'bg-blue-100 border-blue-400 text-blue-800';
      case 'urgent': return 'bg-purple-100 border-purple-400 text-purple-800';
      default: return 'bg-gray-100 border-gray-400 text-gray-800';
    }
  };

  // Função para obter o texto do status
  const getStatusLabel = (status: string) => {
    switch (status) {
      case 'in-progress': return 'Em Processo';
      case 'delayed': return 'Atrasado';
      case 'waiting-docs': return 'Aguardando Docs';
      case 'completed': return 'Concluído';
      case 'ready': return 'Pronto';
      case 'urgent': return 'Urgente';
      default: return status;
    }
  };

  return (
    <div 
      className={`
        p-4 bg-white rounded-lg shadow-sm border-2 cursor-pointer transition-all duration-200
        hover:shadow-md hover:scale-105
        ${isSelected ? 'ring-2 ring-blue-500' : ''}
        ${highlight ? 'ring-2 ring-yellow-400' : ''}
        ${getStatusColor(order.status)}
      `}
      onClick={() => onOrderClick(order)}
    >
      {/* Cabeçalho do Card */}
      <div className="flex justify-between items-start mb-3">
        <div className="flex-1">
          <h3 className="font-bold text-lg text-gray-900">
            #{order.orderNumber}
          </h3>
          {/* EXIBIR PROJETO NO CABEÇALHO */}
          {projectName && (
            <div className="flex items-center mt-1">
              <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-indigo-100 text-indigo-800">
                🏗️ {projectName}
              </span>
            </div>
          )}
        </div>
        <div className="flex flex-col items-end">
          <span className={`
            inline-flex items-center px-2 py-1 rounded-full text-xs font-medium border
            ${getStatusColor(order.status)}
          `}>
            {getStatusLabel(order.status)}
          </span>
        </div>
      </div>

      {/* Informações do Cliente */}
      <div className="space-y-2 mb-4">
        <div className="flex items-center text-sm text-gray-700">
          <span className="font-medium">🏢 Cliente:</span>
          <span className="ml-1 truncate">{order.customer}</span>
        </div>
        <div className="flex items-center text-sm text-gray-700">
          <span className="font-medium">📋 OS:</span>
          <span className="ml-1">{order.internalOrderNumber}</span>
        </div>
      </div>

      {/* Datas */}
      <div className="space-y-1 mb-4">
        <div className="flex items-center justify-between text-sm">
          <span className="text-gray-600">📅 Entrega:</span>
          <span className="font-medium text-gray-900">
            {format(new Date(order.deliveryDate), 'dd/MM/yyyy', { locale: ptBR })}
          </span>
        </div>
        {order.totalWeight && (
          <div className="flex items-center justify-between text-sm">
            <span className="text-gray-600">⚖️ Peso:</span>
            <span className="font-medium text-gray-900">
              {order.totalWeight.toFixed(1)} kg
            </span>
          </div>
        )}
      </div>

      {/* Progresso */}
      {!compactView && (
        <div className="mb-4">
          <div className="flex items-center justify-between mb-1">
            <span className="text-sm text-gray-600">Progresso</span>
            <span className="text-sm font-medium text-gray-900">
              {order.items?.length || 0} {order.items?.length === 1 ? 'item' : 'itens'}
            </span>
          </div>
          <div className="w-full bg-gray-200 rounded-full h-2">
            <div 
              className="bg-blue-600 h-2 rounded-full transition-all duration-300"
              style={{ 
                width: `${
                  order.items?.length 
                    ? (order.items.reduce((acc, item) => acc + (item.overallProgress || 0), 0) / order.items.length) 
                    : 0
                }%` 
              }}
            ></div>
          </div>
        </div>
      )}

      {/* Botões de Ação */}
      {!isManaging && (
        <div className="flex gap-2 mt-4">
          <button 
            onClick={(e) => {
              e.stopPropagation();
              // Navegar para controle de qualidade
            }}
            className="flex-1 px-3 py-2 bg-purple-600 text-white text-sm rounded-lg hover:bg-purple-700 transition-colors"
          >
            🔍 Controle de Qualidade
          </button>
        </div>
      )}

      {/* Link do Google Drive (se existir) */}
      {order.driveLink && (
        <div className="mt-3 pt-3 border-t border-gray-200">
          <a
            href={order.driveLink}
            target="_blank"
            rel="noopener noreferrer"
            onClick={(e) => e.stopPropagation()}
            className="flex items-center text-sm text-blue-600 hover:text-blue-800 transition-colors"
          >
            📁 Documentação no Drive
            <svg className="ml-1 h-3 w-3" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M10.293 3.293a1 1 0 011.414 0l6 6a1 1 0 010 1.414l-6 6a1 1 0 01-1.414-1.414L14.586 11H3a1 1 0 110-2h11.586l-4.293-4.293a1 1 0 010-1.414z" clipRule="evenodd" />
            </svg>
          </a>
        </div>
      )}
    </div>
  );
};

export default KanbanCard;
