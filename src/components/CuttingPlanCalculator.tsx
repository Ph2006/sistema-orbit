import React, { useState, useEffect, useRef } from 'react';
import { useOrderStore } from '../store/orderStore';
import { Order, OrderItem } from '../types/kanban';
import { CuttingPlan, Bar, CutItem } from '../types/cutting-plan';
import { ArrowRight, BarChart3, Download, Info, Grape as Tape, Trash2, RefreshCw, AlertTriangle, Search } from 'lucide-react';
import { collection, addDoc, getDocs, getDoc, query, orderBy, where, deleteDoc, doc, updateDoc, writeBatch, onSnapshot } from 'firebase/firestore';
import { db, getCompanyCollection } from '../lib/firebase';
import { jsPDF } from 'jspdf';
import 'jspdf-autotable';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { useSettingsStore } from '../store/settingsStore';
import { useAuthStore } from '../store/authStore';

const CuttingPlanCalculator: React.FC = () => {
  const { orders } = useOrderStore();
  const { companyLogo } = useSettingsStore();
  const { companyId } = useAuthStore();
  const [selectedOrderId, setSelectedOrderId] = useState<string>('');
  const [materialName, setMaterialName] = useState<string>('');
  const [materialDescription, setMaterialDescription] = useState<string>('');
  const [barLength, setBarLength] = useState<number>(6000);
  const [maxBars, setMaxBars] = useState<number>(100);
  const [cutItems, setCutItems] = useState<CutItem[]>([]);
  const [newCutItem, setNewCutItem] = useState<CutItem>({
    id: crypto.randomUUID(),
    drawingCode: '',
    itemNumber: '',
    length: 0,
    quantity: 0
  });
  const [cuttingPlan, setCuttingPlan] = useState<CuttingPlan | null>(null);
  const [cuttingThickness, setCuttingThickness] = useState<number>(3);
  const [weightPerMeter, setWeightPerMeter] = useState<number>(0);
  const [loadedPlans, setLoadedPlans] = useState<CuttingPlan[]>([]);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isDeletingAll, setIsDeletingAll] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [formData, setFormData] = useState({ orderId: '' });
  const [items, setItems] = useState<Array<{ id: string; code: string; description: string }>>([]);
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [planCounter, setPlanCounter] = useState<number>(1);
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
  const unsubscribeRef = useRef<(() => void) | null>(null);

  // Load existing cutting plans on component mount
  useEffect(() => {
    const loadPlans = async () => {
      if (!companyId) {
        console.log('⏳ Aguardando companyId para carregar planos de corte...');
        return;
      }

      try {
        console.log('🔄 Configurando listener para planos de corte...');

        // Limpar listener anterior se existir
        if (unsubscribeRef.current) {
          unsubscribeRef.current();
        }

        // CORREÇÃO AQUI
        const collectionPath = getCompanyCollection('cuttingPlans', companyId);
        console.log('📁 Collection path:', collectionPath);

        if (collectionPath.includes('invalid')) {
          console.error('❌ Caminho de coleção inválido:', collectionPath);
          return;
        }

        const plansQuery = query(
          collection(db, collectionPath),
          where('deleted', '==', false),
          orderBy('createdAt', 'desc')
        );

        const unsubscribe = onSnapshot(plansQuery, (snapshot) => {
          console.log('📥 Recebidos', snapshot.docs.length, 'planos de corte do Firestore');

          const plans = snapshot.docs.map(doc => ({
            id: doc.id,
            ...doc.data()
          })) as CuttingPlan[];

          setLoadedPlans(plans);

          if (plans.length > 0) {
            const maxNumber = plans.reduce((max, plan) => {
              const match = plan.traceabilityCode?.match(/PC-(\d+)/);
              if (match && match[1]) {
                const num = parseInt(match[1], 10);
                return isNaN(num) ? max : Math.max(max, num);
              }
              return max;
            }, 0);

            setPlanCounter(maxNumber + 1);
            console.log('🔢 Próximo número do plano:', maxNumber + 1);
          }
        }, (error) => {
          console.error('❌ Erro no listener de planos de corte:', error);
        });

        unsubscribeRef.current = unsubscribe;
      } catch (error) {
        console.error('❌ Error loading cutting plans:', error);
      }
    };

    loadPlans();

    // Cleanup listener on unmount
    return () => {
      if (unsubscribeRef.current) {
        unsubscribeRef.current();
      }
    };
  }, [companyId]);

  // ... (restante do código permanece igual)

  // Salvar plano de corte
  const saveCuttingPlan = async () => {
    if (!cuttingPlan) {
      alert('Nenhum plano de corte para salvar');
      return;
    }

    if (!companyId) {
      alert('❌ CompanyId não disponível. Faça login novamente.');
      console.error('❌ CompanyId não disponível');
      return;
    }

    setIsSaving(true);

    try {
      // CORREÇÃO AQUI
      const collectionPath = getCompanyCollection('cuttingPlans', companyId);
      console.log('📁 Collection path:', collectionPath);

      if (!collectionPath || typeof collectionPath !== 'string' || collectionPath.includes('invalid')) {
        throw new Error('Caminho da coleção de planos de corte inválido! Verifique a autenticação e a empresa selecionada.');
      }

      const existingPlansQuery = query(
        collection(db, collectionPath),
        where('orderId', '==', cuttingPlan.orderId),
        where('materialName', '==', cuttingPlan.materialName),
        where('deleted', '==', false)
      );

      const existingPlans = await getDocs(existingPlansQuery);
      if (!existingPlans.empty) {
        const shouldContinue = window.confirm(
          'Já existe um plano de corte para este pedido e material. Deseja criar um novo mesmo assim?'
        );
        if (!shouldContinue) {
          setIsSaving(false);
          return;
        }
      }

      // Sanitize data before saving
      const planToSave = {
        ...cuttingPlan,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        bars: cuttingPlan.bars.map(bar => ({
          ...bar,
          cuts: bar.cuts.map(cut => ({
            ...cut,
            startPosition: Number(cut.startPosition),
            endPosition: Number(cut.endPosition),
            length: Number(cut.length)
          }))
        }))
      };

      console.log('✅ Objeto final a ser salvo:', planToSave);

      await addDoc(collection(db, collectionPath), planToSave);

      setPlanCounter(prev => prev + 1);

      alert('✅ Plano de corte salvo com sucesso!');
      // Exportar PDF após salvar
      exportToPDF(cuttingPlan);

    } catch (error) {
      console.error('❌ Erro ao salvar plano de corte:', error);
      alert('❌ Erro ao salvar plano de corte: ' + (error instanceof Error ? error.message : JSON.stringify(error)));
    } finally {
      setIsSaving(false);
    }
  };

  // Excluir plano individual
  const handleDeletePlan = async (planId: string) => {
    if (!window.confirm('Tem certeza que deseja excluir este plano de corte?')) {
      return;
    }

    try {
      setIsDeleting(true);
      // CORREÇÃO AQUI
      const planRef = doc(db, getCompanyCollection('cuttingPlans', companyId), planId);

      // Check if the document exists before attempting to update it
      const docSnap = await getDoc(planRef);

      if (docSnap.exists()) {
        // Document exists, proceed with update
        await updateDoc(planRef, { deleted: true });
        alert('Plano de corte excluído com sucesso.');
      } else {
        // Document doesn't exist, just update local state
        console.log('Document does not exist, removing from local state only');
        alert('Este plano de corte já foi excluído ou não existe.');
      }

      // Update local state regardless of document existence
      setLoadedPlans(loadedPlans.filter(plan => plan.id !== planId));

    } catch (error) {
      console.error('Error marking cutting plan as deleted:', error);
      alert('Erro ao excluir plano de corte');
    } finally {
      setIsDeleting(false);
    }
  };

  // Excluir TODOS os planos
  const handleDeleteAllPlans = async () => {
    if (!window.confirm('Tem certeza que deseja excluir TODOS os planos de corte? Esta ação não pode ser desfeita.')) {
      return;
    }

    try {
      setIsDeletingAll(true);

      // CORREÇÃO AQUI
      const plansRef = collection(db, getCompanyCollection('cuttingPlans', companyId));
      const plansSnapshot = await getDocs(plansRef);

      if (plansSnapshot.empty) {
        alert('Não há planos de corte para excluir.');
        setIsDeletingAll(false);
        return;
      }

      // Use a batch to mark all plans as deleted
      const batch = writeBatch(db);

      plansSnapshot.docs.forEach(doc => {
        batch.update(doc.ref, { deleted: true });
      });

      await batch.commit();

      // Clear local state
      setLoadedPlans([]);

      setIsDeletingAll(false);
      alert(`${plansSnapshot.docs.length} planos de corte foram excluídos com sucesso.`);
    } catch (error) {
      console.error('Error deleting all cutting plans:', error);
      setIsDeletingAll(false);
      alert('Erro ao excluir planos de corte. Por favor, tente novamente.');
    }
  };

  // ... o restante do seu componente permanece igual ...
  // (todas as outras funções e o return JSX não precisam ser alterados!)

  // Lembre-se de substituir apenas as chamadas para getCompanyCollection 
  // conforme exemplificado acima!

  // Export default
};

export default CuttingPlanCalculator;
