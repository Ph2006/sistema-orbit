import { Order, OrderItem } from '../types/kanban';
import { calculateItemProgress } from './progress';

// Function to check if all items in an order have completed a specific stage
export const hasCompletedStage = (items: OrderItem[], stageName: string): boolean => {
  return items.every(item => {
    const stageProgress = item.progress?.[stageName] || 0;
    return stageProgress === 100;
  });
};

// Function to determine the appropriate column for an order based on its progress
export const determineOrderColumn = (order: Order, columnIds: { [key: string]: string | undefined }): string | null => {
  if (!columnIds || Object.values(columnIds).every(id => id === undefined)) {
    console.warn("Não há colunas disponíveis para determinar a coluna apropriada");
    return null;
  }
  
  // Always default to the "Pedidos em processo" column for converted orders
  const processColumn = columnIds.listing || columnIds.production;
  if (processColumn) return processColumn;
  
  // Default to any "processo" column as fallback
  const processColumns = Object.entries(columnIds).filter(([key, _]) => 
    key.toLowerCase().includes('process') || key.toLowerCase().includes('processo')
  );
  
  if (processColumns.length > 0 && processColumns[0][1]) {
    return processColumns[0][1];
  }
  
  // If we can't find the process column, use any column
  return Object.values(columnIds).find(Boolean) || null;
};