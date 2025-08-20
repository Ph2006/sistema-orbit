// src/utils/taskSync.ts
import { doc, getDoc, updateDoc, Timestamp } from 'firebase/firestore';
import { db } from '@/lib/firebase';

export const syncTaskWithOrder = async (
  taskId: string, 
  orderId: string, 
  itemId: string, 
  stageIndex: number, 
  taskStatus: string
) => {
  try {
    const orderRef = doc(db, "companies", "mecald", "orders", orderId);
    const orderSnap = await getDoc(orderRef);
    
    if (!orderSnap.exists()) {
      throw new Error("Pedido não encontrado");
    }

    const orderData = orderSnap.data();
    const items = [...orderData.items];
    
    // Encontrar o item e a etapa correspondente
    const itemIndex = items.findIndex(item => item.id === itemId);
    if (itemIndex === -1) {
      throw new Error("Item não encontrado no pedido");
    }

    const item = items[itemIndex];
    if (!item.productionPlan || !item.productionPlan[stageIndex]) {
      throw new Error("Etapa não encontrada no plano de produção");
    }

    const stage = item.productionPlan[stageIndex];
    
    // Atualizar status da etapa baseado no status da tarefa
    switch (taskStatus) {
      case 'concluida':
        stage.status = 'Concluído';
        stage.completedDate = Timestamp.now();
        break;
      case 'em_andamento':
        stage.status = 'Em Andamento';
        if (!stage.startDate) {
          stage.startDate = Timestamp.now();
        }
        break;
      case 'pendente':
        stage.status = 'Pendente';
        break;
      case 'cancelada':
        stage.status = 'Pendente'; // Voltar para pendente se cancelada
        break;
    }

    // Salvar as alterações
    await updateDoc(orderRef, { items });
    
    console.log(`Etapa ${stage.stageName} atualizada para ${stage.status}`);
    
  } catch (error) {
    console.error("Erro ao sincronizar tarefa com pedido:", error);
    throw error;
  }
};
