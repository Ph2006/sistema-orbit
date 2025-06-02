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

  // Carregar planos de corte existentes ao montar o componente
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

        const collectionPath = getCompanyCollection('cuttingPlans', companyId);
        console.log('📁 Collection path:', collectionPath);

        if (collectionPath.includes('invalid')) {
          console.error('❌ Caminho de coleção inválido:', collectionPath);
          return;
        }

        // CORREÇÃO: Remover orderBy para evitar erro de índice composto
        const plansQuery = query(
          collection(db, collectionPath),
          where('deleted', '==', false)
          // orderBy removido temporariamente para evitar erro de índice
        );

        const unsubscribe = onSnapshot(plansQuery, (snapshot) => {
          console.log('📥 Recebidos', snapshot.docs.length, 'planos de corte do Firestore');

          const plans = snapshot.docs.map(doc => ({
            id: doc.id,
            ...doc.data()
          })) as CuttingPlan[];

          // Ordenar manualmente no JavaScript (mais recente primeiro)
          const sortedPlans = plans.sort((a, b) => {
            const dateA = new Date(a.createdAt || 0).getTime();
            const dateB = new Date(b.createdAt || 0).getTime();
            return dateB - dateA; // ordem decrescente
          });

          setLoadedPlans(sortedPlans);

          if (sortedPlans.length > 0) {
            const maxNumber = sortedPlans.reduce((max, plan) => {
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

    // Cleanup listener no unmount
    return () => {
      if (unsubscribeRef.current) {
        unsubscribeRef.current();
      }
    };
  }, [companyId]);

  // Função para adicionar novo item de corte
  const addCutItem = () => {
    if (newCutItem.length <= 0 || newCutItem.quantity <= 0) {
      alert('Por favor, preencha o comprimento e quantidade válidos');
      return;
    }

    setCutItems([...cutItems, { ...newCutItem }]);
    setNewCutItem({
      id: crypto.randomUUID(),
      drawingCode: '',
      itemNumber: '',
      length: 0,
      quantity: 0
    });
  };

  // Função para remover item de corte
  const removeCutItem = (id: string) => {
    setCutItems(cutItems.filter(item => item.id !== id));
  };

  // Algoritmo de otimização de corte (First Fit Decreasing)
  const calculateCuttingPlan = () => {
    if (cutItems.length === 0) {
      alert('Adicione pelo menos um item para calcular o plano de corte');
      return;
    }

    // Expandir itens com quantidade
    const expandedItems: CutItem[] = [];
    cutItems.forEach(item => {
      for (let i = 0; i < item.quantity; i++) {
        expandedItems.push({
          ...item,
          id: `${item.id}-${i}`,
          quantity: 1
        });
      }
    });

    // Ordenar por comprimento decrescente (First Fit Decreasing)
    expandedItems.sort((a, b) => b.length - a.length);

    const bars: Bar[] = [];
    let barCounter = 1;

    expandedItems.forEach(item => {
      const requiredLength = item.length + cuttingThickness;
      let placed = false;

      // Tentar colocar em uma barra existente
      for (let bar of bars) {
        if (bar.remainingLength >= requiredLength) {
          const startPosition = barLength - bar.remainingLength;
          const endPosition = startPosition + item.length;

          bar.cuts.push({
            id: item.id,
            drawingCode: item.drawingCode,
            itemNumber: item.itemNumber,
            length: item.length,
            startPosition,
            endPosition
          });

          bar.remainingLength -= requiredLength;
          bar.usedLength += requiredLength;
          bar.efficiency = (bar.usedLength / barLength) * 100;
          placed = true;
          break;
        }
      }

      // Se não couber em nenhuma barra existente, criar nova
      if (!placed) {
        if (bars.length >= maxBars) {
          alert(`Limite máximo de ${maxBars} barras atingido`);
          return;
        }

        const newBar: Bar = {
          id: barCounter++,
          length: barLength,
          cuts: [{
            id: item.id,
            drawingCode: item.drawingCode,
            itemNumber: item.itemNumber,
            length: item.length,
            startPosition: 0,
            endPosition: item.length
          }],
          remainingLength: barLength - (item.length + cuttingThickness),
          usedLength: item.length + cuttingThickness,
          efficiency: ((item.length + cuttingThickness) / barLength) * 100
        };

        bars.push(newBar);
      }
    });

    // Calcular estatísticas
    const totalUsedLength = bars.reduce((sum, bar) => sum + bar.usedLength, 0);
    const totalAvailableLength = bars.length * barLength;
    const totalWaste = totalAvailableLength - totalUsedLength;
    const overallEfficiency = (totalUsedLength / totalAvailableLength) * 100;
    const totalWeight = totalUsedLength * (weightPerMeter / 1000); // converter para kg

    const plan: CuttingPlan = {
      id: crypto.randomUUID(),
      orderId: selectedOrderId,
      materialName,
      materialDescription,
      barLength,
      cuttingThickness,
      weightPerMeter,
      bars,
      totalBars: bars.length,
      totalUsedLength,
      totalWaste,
      overallEfficiency,
      totalWeight,
      traceabilityCode: `PC-${planCounter.toString().padStart(3, '0')}`,
      createdAt: new Date().toISOString(),
      deleted: false
    };

    setCuttingPlan(plan);
  };

  // Exportar para PDF
  const exportToPDF = (plan: CuttingPlan) => {
    const pdf = new jsPDF();
    const pageWidth = pdf.internal.pageSize.width;
    const margin = 20;

    // Cabeçalho
    pdf.setFontSize(18);
    pdf.text('PLANO DE CORTE', pageWidth / 2, 30, { align: 'center' });
    
    pdf.setFontSize(12);
    pdf.text(`Código: ${plan.traceabilityCode}`, margin, 50);
    pdf.text(`Data: ${format(new Date(plan.createdAt), 'dd/MM/yyyy HH:mm', { locale: ptBR })}`, margin, 60);
    pdf.text(`Material: ${plan.materialName}`, margin, 70);
    pdf.text(`Descrição: ${plan.materialDescription}`, margin, 80);

    // Estatísticas
    pdf.text(`Total de Barras: ${plan.totalBars}`, margin, 100);
    pdf.text(`Comprimento da Barra: ${plan.barLength}mm`, margin, 110);
    pdf.text(`Eficiência Geral: ${plan.overallEfficiency.toFixed(2)}%`, margin, 120);
    pdf.text(`Peso Total: ${plan.totalWeight.toFixed(2)}kg`, margin, 130);

    // Tabela de barras
    let yPos = 150;
    plan.bars.forEach((bar, index) => {
      if (yPos > 250) {
        pdf.addPage();
        yPos = 30;
      }

      pdf.setFontSize(14);
      pdf.text(`Barra ${bar.id} - Eficiência: ${bar.efficiency.toFixed(2)}%`, margin, yPos);
      yPos += 10;

      const tableData = bar.cuts.map(cut => [
        cut.drawingCode,
        cut.itemNumber,
        `${cut.length}mm`,
        `${cut.startPosition}mm`,
        `${cut.endPosition}mm`
      ]);

      (pdf as any).autoTable({
        head: [['Código Desenho', 'Nº Item', 'Comprimento', 'Início', 'Fim']],
        body: tableData,
        startY: yPos,
        margin: { left: margin, right: margin },
        styles: { fontSize: 10 }
      });

      yPos = (pdf as any).lastAutoTable.finalY + 20;
    });

    pdf.save(`plano-corte-${plan.traceabilityCode}.pdf`);
  };

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

      // Limpar dados antes de salvar
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
      const planRef = doc(db, getCompanyCollection('cuttingPlans', companyId), planId);

      // Verificar se o documento existe antes de tentar atualizá-lo
      const docSnap = await getDoc(planRef);

      if (docSnap.exists()) {
        // Documento existe, proceder com atualização
        await updateDoc(planRef, { deleted: true });
        alert('Plano de corte excluído com sucesso.');
      } else {
        // Documento não existe, apenas atualizar estado local
        console.log('Document does not exist, removing from local state only');
        alert('Este plano de corte já foi excluído ou não existe.');
      }

      // Atualizar estado local independentemente da existência do documento
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

      const plansRef = collection(db, getCompanyCollection('cuttingPlans', companyId));
      const plansSnapshot = await getDocs(plansRef);

      if (plansSnapshot.empty) {
        alert('Não há planos de corte para excluir.');
        setIsDeletingAll(false);
        return;
      }

      // Usar batch para marcar todos os planos como excluídos
      const batch = writeBatch(db);

      plansSnapshot.docs.forEach(doc => {
        batch.update(doc.ref, { deleted: true });
      });

      await batch.commit();

      // Limpar estado local
      setLoadedPlans([]);

      setIsDeletingAll(false);
      alert(`${plansSnapshot.docs.length} planos de corte foram excluídos com sucesso.`);
    } catch (error) {
      console.error('Error deleting all cutting plans:', error);
      setIsDeletingAll(false);
      alert('Erro ao excluir planos de corte. Por favor, tente novamente.');
    }
  };

  // Filtrar pedidos ativos
  const activeOrders = orders.filter(order => !order.deleted);

  // Filtrar planos carregados
  const filteredPlans = loadedPlans.filter(plan => {
    if (!searchTerm) return true;
    return (
      plan.traceabilityCode?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      plan.materialName?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      plan.materialDescription?.toLowerCase().includes(searchTerm.toLowerCase())
    );
  });

  return (
    <div className="space-y-6">
      {/* Formulário de Entrada */}
      <div className="bg-white rounded-lg shadow-md p-6">
        <h3 className="text-lg font-semibold mb-4">Configuração do Plano de Corte</h3>
        
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-6">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Pedido
            </label>
            <select
              value={selectedOrderId}
              onChange={(e) => {
                setSelectedOrderId(e.target.value);
                const order = activeOrders.find(o => o.id === e.target.value);
                setSelectedOrder(order || null);
              }}
              className="w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">Selecione um pedido</option>
              {activeOrders.map(order => (
                <option key={order.id} value={order.id}>
                  #{order.orderNumber} - {order.customer}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Nome do Material
            </label>
            <input
              type="text"
              value={materialName}
              onChange={(e) => setMaterialName(e.target.value)}
              placeholder="Ex: Aço 1020"
              className="w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Descrição do Material
            </label>
            <input
              type="text"
              value={materialDescription}
              onChange={(e) => setMaterialDescription(e.target.value)}
              placeholder="Ex: Barra chata 50x6mm"
              className="w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Comprimento da Barra (mm)
            </label>
            <input
              type="number"
              value={barLength}
              onChange={(e) => setBarLength(Number(e.target.value))}
              className="w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Espessura de Corte (mm)
            </label>
            <input
              type="number"
              value={cuttingThickness}
              onChange={(e) => setCuttingThickness(Number(e.target.value))}
              className="w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Peso por Metro (g/m)
            </label>
            <input
              type="number"
              value={weightPerMeter}
              onChange={(e) => setWeightPerMeter(Number(e.target.value))}
              placeholder="Ex: 2355"
              className="w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
        </div>

        {/* Adicionar Itens de Corte */}
        <div className="border-t pt-6">
          <h4 className="text-md font-semibold mb-4">Itens para Corte</h4>
          
          <div className="grid grid-cols-1 md:grid-cols-5 gap-4 mb-4">
            <input
              type="text"
              value={newCutItem.drawingCode}
              onChange={(e) => setNewCutItem({...newCutItem, drawingCode: e.target.value})}
              placeholder="Código do Desenho"
              className="border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <input
              type="text"
              value={newCutItem.itemNumber}
              onChange={(e) => setNewCutItem({...newCutItem, itemNumber: e.target.value})}
              placeholder="Nº do Item"
              className="border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <input
              type="number"
              value={newCutItem.length || ''}
              onChange={(e) => setNewCutItem({...newCutItem, length: Number(e.target.value)})}
              placeholder="Comprimento (mm)"
              className="border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <input
              type="number"
              value={newCutItem.quantity || ''}
              onChange={(e) => setNewCutItem({...newCutItem, quantity: Number(e.target.value)})}
              placeholder="Quantidade"
              className="border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <button
              onClick={addCutItem}
              className="bg-blue-600 text-white px-4 py-2 rounded-md hover:bg-blue-700 transition-colors"
            >
              Adicionar
            </button>
          </div>

          {cutItems.length > 0 && (
            <div className="overflow-x-auto">
              <table className="min-w-full bg-white border border-gray-200 rounded-lg">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Código</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Item</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Comprimento</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Quantidade</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Ações</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {cutItems.map(item => (
                    <tr key={item.id}>
                      <td className="px-4 py-3 text-sm">{item.drawingCode}</td>
                      <td className="px-4 py-3 text-sm">{item.itemNumber}</td>
                      <td className="px-4 py-3 text-sm">{item.length}mm</td>
                      <td className="px-4 py-3 text-sm">{item.quantity}</td>
                      <td className="px-4 py-3 text-sm">
                        <button
                          onClick={() => removeCutItem(item.id)}
                          className="text-red-600 hover:text-red-800"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div className="flex gap-4 mt-6">
          <button
            onClick={calculateCuttingPlan}
            disabled={cutItems.length === 0}
            className="bg-green-600 text-white px-6 py-2 rounded-md hover:bg-green-700 disabled:bg-gray-400 transition-colors"
          >
            <BarChart3 className="h-4 w-4 inline-block mr-2" />
            Calcular Plano
          </button>

          {cuttingPlan && (
            <>
              <button
                onClick={saveCuttingPlan}
                disabled={isSaving}
                className="bg-blue-600 text-white px-6 py-2 rounded-md hover:bg-blue-700 disabled:bg-gray-400 transition-colors"
              >
                {isSaving ? 'Salvando...' : 'Salvar Plano'}
              </button>

              <button
                onClick={() => exportToPDF(cuttingPlan)}
                className="bg-purple-600 text-white px-6 py-2 rounded-md hover:bg-purple-700 transition-colors"
              >
                <Download className="h-4 w-4 inline-block mr-2" />
                Exportar PDF
              </button>
            </>
          )}
        </div>
      </div>

      {/* Resultado do Plano de Corte */}
      {cuttingPlan && (
        <div className="bg-white rounded-lg shadow-md p-6">
          <h3 className="text-lg font-semibold mb-4">Resultado do Plano de Corte</h3>
          
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
            <div className="bg-blue-50 p-4 rounded-lg">
              <div className="text-2xl font-bold text-blue-600">{cuttingPlan.totalBars}</div>
              <div className="text-sm text-blue-800">Total de Barras</div>
            </div>
            <div className="bg-green-50 p-4 rounded-lg">
              <div className="text-2xl font-bold text-green-600">{cuttingPlan.overallEfficiency.toFixed(1)}%</div>
              <div className="text-sm text-green-800">Eficiência Geral</div>
            </div>
            <div className="bg-yellow-50 p-4 rounded-lg">
              <div className="text-2xl font-bold text-yellow-600">{cuttingPlan.totalWaste.toLocaleString()}mm</div>
              <div className="text-sm text-yellow-800">Sobra Total</div>
            </div>
            <div className="bg-purple-50 p-4 rounded-lg">
              <div className="text-2xl font-bold text-purple-600">{cuttingPlan.totalWeight.toFixed(2)}kg</div>
              <div className="text-sm text-purple-800">Peso Total</div>
            </div>
          </div>

          <div className="space-y-4">
            {cuttingPlan.bars.map(bar => (
              <div key={bar.id} className="border border-gray-200 rounded-lg p-4">
                <div className="flex justify-between items-center mb-3">
                  <h4 className="font-semibold">Barra {bar.id}</h4>
                  <div className="text-sm text-gray-600">
                    Eficiência: {bar.efficiency.toFixed(1)}% | 
                    Sobra: {bar.remainingLength}mm
                  </div>
                </div>
                
                <div className="overflow-x-auto">
                  <table className="min-w-full bg-gray-50 rounded">
                    <thead>
                      <tr className="text-xs text-gray-500">
                        <th className="px-3 py-2 text-left">Código</th>
                        <th className="px-3 py-2 text-left">Item</th>
                        <th className="px-3 py-2 text-left">Comprimento</th>
                        <th className="px-3 py-2 text-left">Início</th>
                        <th className="px-3 py-2 text-left">Fim</th>
                      </tr>
                    </thead>
                    <tbody>
                      {bar.cuts.map(cut => (
                        <tr key={cut.id} className="text-sm">
                          <td className="px-3 py-2">{cut.drawingCode}</td>
                          <td className="px-3 py-2">{cut.itemNumber}</td>
                          <td className="px-3 py-2">{cut.length}mm</td>
                          <td className="px-3 py-2">{cut.startPosition}mm</td>
                          <td className="px-3 py-2">{cut.endPosition}mm</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                
                {/* Visualização gráfica da barra */}
                <div className="mt-3">
                  <div className="relative bg-gray-200 h-8 rounded">
                    {bar.cuts.map(cut => (
                      <div
                        key={cut.id}
                        className="absolute h-8 bg-blue-500 border-r-2 border-white rounded-l"
                        style={{
                          left: `${(cut.startPosition / barLength) * 100}%`,
                          width: `${(cut.length / barLength) * 100}%`
                        }}
                        title={`${cut.drawingCode} - ${cut.length}mm`}
                      />
                    ))}
                    <div className="absolute inset-0 flex items-center justify-center text-xs font-medium text-gray-700">
                      {barLength}mm
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Lista de Planos Salvos */}
      <div className="bg-white rounded-lg shadow-md p-6">
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-lg font-semibold">Planos de Corte Salvos</h3>
          <div className="flex gap-2">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Buscar planos..."
                className="pl-10 pr-4 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            {loadedPlans.length > 0 && (
              <button
                onClick={handleDeleteAllPlans}
                disabled={isDeletingAll}
                className="bg-red-600 text-white px-4 py-2 rounded-md hover:bg-red-700 disabled:bg-gray-400 transition-colors"
              >
                {isDeletingAll ? (
                  <RefreshCw className="h-4 w-4 animate-spin" />
                ) : (
                  <Trash2 className="h-4 w-4" />
                )}
                {isDeletingAll ? 'Excluindo...' : 'Excluir Todos'}
              </button>
            )}
          </div>
        </div>

        {filteredPlans.length === 0 ? (
          <div className="text-center py-12 text-gray-500">
            {loadedPlans.length === 0 ? (
              <>
                <BarChart3 className="h-12 w-12 mx-auto mb-4 text-gray-300" />
                <p>Nenhum plano de corte salvo ainda.</p>
                <p className="text-sm">Crie seu primeiro plano de corte acima.</p>
              </>
            ) : (
              <>
                <Search className="h-12 w-12 mx-auto mb-4 text-gray-300" />
                <p>Nenhum plano encontrado com o termo "{searchTerm}".</p>
              </>
            )}
          </div>
        ) : (
          <div className="space-y-4">
            {filteredPlans.map(plan => (
              <div key={plan.id} className="border border-gray-200 rounded-lg p-4 hover:shadow-md transition-shadow">
                <div className="flex justify-between items-start">
                  <div className="flex-1">
                    <div className="flex items-center gap-4 mb-2">
                      <h4 className="font-semibold text-lg">{plan.traceabilityCode}</h4>
                      <span className="px-2 py-1 bg-blue-100 text-blue-800 text-xs rounded-full">
                        {plan.totalBars} barras
                      </span>
                      <span className="px-2 py-1 bg-green-100 text-green-800 text-xs rounded-full">
                        {plan.overallEfficiency.toFixed(1)}% eficiência
                      </span>
                    </div>
                    
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm text-gray-600">
                      <div>
                        <strong>Material:</strong> {plan.materialName}
                        {plan.materialDescription && (
                          <div className="text-xs text-gray-500">{plan.materialDescription}</div>
                        )}
                      </div>
                      <div>
                        <strong>Criado em:</strong> {format(new Date(plan.createdAt), 'dd/MM/yyyy HH:mm', { locale: ptBR })}
                      </div>
                      <div>
                        <strong>Peso Total:</strong> {plan.totalWeight.toFixed(2)}kg
                      </div>
                      <div>
                        <strong>Sobra Total:</strong> {plan.totalWaste.toLocaleString()}mm
                      </div>
                    </div>
                  </div>
                  
                  <div className="flex gap-2 ml-4">
                    <button
                      onClick={() => exportToPDF(plan)}
                      className="bg-purple-600 text-white px-3 py-1 rounded text-sm hover:bg-purple-700 transition-colors"
                      title="Exportar PDF"
                    >
                      <Download className="h-4 w-4" />
                    </button>
                    <button
                      onClick={() => handleDeletePlan(plan.id)}
                      disabled={isDeleting}
                      className="bg-red-600 text-white px-3 py-1 rounded text-sm hover:bg-red-700 disabled:bg-gray-400 transition-colors"
                      title="Excluir Plano"
                    >
                      {isDeleting ? (
                        <RefreshCw className="h-4 w-4 animate-spin" />
                      ) : (
                        <Trash2 className="h-4 w-4" />
                      )}
                    </button>
                  </div>
                </div>

                {/* Resumo das barras */}
                <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2">
                  {plan.bars.slice(0, 4).map(bar => (
                    <div key={bar.id} className="bg-gray-50 p-2 rounded text-xs">
                      <div className="font-medium">Barra {bar.id}</div>
                      <div className="text-gray-600">
                        {bar.cuts.length} cortes | {bar.efficiency.toFixed(1)}% efic.
                      </div>
                    </div>
                  ))}
                  {plan.bars.length > 4 && (
                    <div className="bg-gray-50 p-2 rounded text-xs flex items-center justify-center text-gray-500">
                      +{plan.bars.length - 4} barras
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default CuttingPlanCalculator;
