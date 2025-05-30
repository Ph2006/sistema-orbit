import { 
  collection, 
  getDocs, 
  query, 
  where, 
  orderBy, 
  addDoc, 
  updateDoc, 
  doc, 
  getDoc, 
  Firestore 
} from 'firebase/firestore';
import { db } from '../lib/firebase';
import { MaterialRequisition } from '../types/materials';

class MaterialRequisitionService {
  // Obter companyId da sessão ou localStorage como fallback
  private getCompanyId(): string | null {
    // Tenta obter do localStorage como backup
    return localStorage.getItem('companyId') || sessionStorage.getItem('companyId') || null;
  }

  // Constrói o caminho da coleção
  private getCollectionPath(collectionName: string): string {
    const companyId = this.getCompanyId();
    if (!companyId) {
      console.error('ERRO: CompanyId indisponível');
      throw new Error('ID da empresa é necessário');
    }
    return `companies/${companyId}/${collectionName}`;
  }

  // Salva companyId no localStorage e sessionStorage para redundância
  public saveCompanyId(companyId: string): void {
    if (companyId) {
      localStorage.setItem('companyId', companyId);
      sessionStorage.setItem('companyId', companyId);
      console.log('CompanyId salvo localmente:', companyId);
    }
  }

  // Criar nova requisição
  public async createRequisition(requisition: MaterialRequisition): Promise<string> {
    try {
      console.log('=== INÍCIO DA CRIAÇÃO DE REQUISIÇÃO ===');
      const collectionPath = this.getCollectionPath('materialRequisitions');
      console.log('Path da coleção:', collectionPath);

      // Remover o ID 'new'
      const { id, ...requisitionData } = requisition;
      
      // Estrutura simplificada para evitar problemas
      const dataToSave = {
        orderId: requisitionData.orderId,
        orderNumber: requisitionData.orderNumber,
        customer: requisitionData.customer,
        requestDate: requisitionData.requestDate,
        status: requisitionData.status,
        budgetLimit: requisitionData.budgetLimit || 0,
        totalCost: requisitionData.totalCost || 0,
        budgetExceeded: requisitionData.budgetExceeded || false,
        notes: requisitionData.notes || '',
        items: requisitionData.items.map(item => ({
          id: item.id,
          materialId: item.materialId || '',
          description: item.description || '',
          material: item.material || '',
          quantity: item.quantity || 0,
          dimensions: item.dimensions || '',
          weight: item.weight || 0,
          pricePerKg: item.pricePerKg || 0,
          finalPrice: item.finalPrice || 0,
          status: item.status || 'pending',
          sentForQuotation: item.sentForQuotation || false,
          notes: item.notes || ''
        })),
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };

      console.log('Dados a salvar:', dataToSave);
      
      // Usar .add diretamente do Firestore
      const docRef = await addDoc(collection(db, collectionPath), dataToSave);
      console.log('✅ Requisição criada com sucesso! ID:', docRef.id);
      
      return docRef.id;
    } catch (error) {
      console.error('Erro ao criar requisição:', error);
      throw error;
    }
  }

  // Atualizar requisição existente
  public async updateRequisition(requisitionId: string, requisition: MaterialRequisition): Promise<void> {
    try {
      console.log('=== INÍCIO DA ATUALIZAÇÃO DE REQUISIÇÃO ===');
      console.log('ID da requisição a atualizar:', requisitionId);
      
      const collectionPath = this.getCollectionPath('materialRequisitions');
      
      // Remover o ID para não tentar atualizá-lo
      const { id, ...requisitionData } = requisition;
      
      // Estrutura simplificada
      const updateData = {
        orderId: requisitionData.orderId,
        orderNumber: requisitionData.orderNumber,
        customer: requisitionData.customer,
        requestDate: requisitionData.requestDate,
        status: requisitionData.status,
        budgetLimit: requisitionData.budgetLimit || 0,
        totalCost: requisitionData.totalCost || 0,
        budgetExceeded: requisitionData.budgetExceeded || false,
        notes: requisitionData.notes || '',
        items: requisitionData.items.map(item => ({
          id: item.id,
          materialId: item.materialId || '',
          description: item.description || '',
          material: item.material || '',
          quantity: item.quantity || 0,
          dimensions: item.dimensions || '',
          weight: item.weight || 0,
          pricePerKg: item.pricePerKg || 0,
          finalPrice: item.finalPrice || 0,
          status: item.status || 'pending',
          sentForQuotation: item.sentForQuotation || false,
          notes: item.notes || ''
        })),
        updatedAt: new Date().toISOString()
      };

      console.log('Dados a atualizar:', updateData);
      
      const docRef = doc(db, collectionPath, requisitionId);
      await updateDoc(docRef, updateData);
      
      console.log('✅ Requisição atualizada com sucesso!');
    } catch (error) {
      console.error('Erro ao atualizar requisição:', error);
      throw error;
    }
  }
}

export const materialRequisitionService = new MaterialRequisitionService();
