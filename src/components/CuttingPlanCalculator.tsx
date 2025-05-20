import React, { useState, useEffect, useRef } from 'react';
import { useOrderStore } from '../store/orderStore';
import { Order, OrderItem } from '../types/kanban';
import { CuttingPlan, Bar, CutItem } from '../types/cutting-plan';
import { ArrowRight, BarChart3, Download, Info, Grape as Tape, Trash2, RefreshCw, AlertTriangle, Search } from 'lucide-react';
import { collection, addDoc, getDocs, getDoc, query, orderBy, where, deleteDoc, doc, updateDoc, writeBatch } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { jsPDF } from 'jspdf';
import 'jspdf-autotable';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { useSettingsStore } from '../store/settingsStore';

const CuttingPlanCalculator: React.FC = () => {
  const { orders } = useOrderStore();
  const { companyLogo } = useSettingsStore();
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
  const [formData, setFormData] = useState({ orderId: '' });
  const [items, setItems] = useState<Array<{ id: string; code: string; description: string }>>([]);
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [planCounter, setPlanCounter] = useState<number>(1);
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);

  // Load existing cutting plans on component mount
  useEffect(() => {
    loadExistingPlans();
  }, []);

  useEffect(() => {
    // If an order ID is selected, load its items
    if (formData.orderId) {
      const selected = orders.find(o => o.id === formData.orderId);
      if (selected) {
        setItems(selected.items.map(item => ({
          id: item.id,
          code: item.code,
          description: item.description
        })));
        setSelectedOrder(selected);
      } else {
        setItems([]);
        setSelectedOrder(null);
      }
    } else {
      setItems([]);
      setSelectedOrder(null);
    }
  }, [formData.orderId, orders]);
  
  const loadExistingPlans = async () => {
    try {
      const plansRef = collection(db, 'cuttingPlans');
      const plansQuery = query(plansRef, orderBy('createdAt', 'desc'));
      const plansSnapshot = await getDocs(plansQuery);
      const plans = plansSnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as CuttingPlan[];
      
      // Filter out any deleted plans by checking if they have a deleted field set to true
      const filteredPlans = plans.filter(plan => !plan.deleted);
      setLoadedPlans(filteredPlans);
      
      // Set plan counter to the highest existing number + 1
      if (filteredPlans.length > 0) {
        // Try to parse existing plan numbers from any plans with "PC-" prefix
        const maxNumber = filteredPlans.reduce((max, plan) => {
          // Try to parse number from the plan code (e.g., "PC-001")
          const match = plan.traceabilityCode?.match(/PC-(\d+)/);
          if (match && match[1]) {
            const num = parseInt(match[1], 10);
            return isNaN(num) ? max : Math.max(max, num);
          }
          return max;
        }, 0);
        
        setPlanCounter(maxNumber + 1);
      }
    } catch (error) {
      console.error('Error loading cutting plans:', error);
    }
  };

  // Calculate weight per meter based on material properties
  useEffect(() => {
    // This is a simplified calculation and should be replaced with proper formula
    // based on the material type, cross-section, etc.
    
    // Assuming rectangular cross-section and density of 7.85 g/cm³
    // For example, for steel, density is ~7.85 g/cm³
    if (materialName.toLowerCase().includes('aço') || materialName.toLowerCase().includes('steel')) {
      // For a 100mm x 10mm steel bar
      // Cross-sectional area = 100 x 10 = 1000 mm² = 10 cm²
      // Weight per meter = cross-sectional area (cm²) x 100 cm x density (g/cm³) / 1000 = kg/m
      // 10 cm² x 100 cm x 7.85 g/cm³ / 1000 = 7.85 kg/m
      setWeightPerMeter(7.85);
    } else if (materialName.toLowerCase().includes('alumínio') || materialName.toLowerCase().includes('aluminum')) {
      // Aluminum density is ~2.7 g/cm³
      setWeightPerMeter(2.70);
    } else if (materialName.toLowerCase().includes('bronze')) {
      // Bronze density is ~8.8 g/cm³
      setWeightPerMeter(8.80);
    } else {
      // Default: mild steel
      setWeightPerMeter(7.85);
    }
  }, [materialName]);

  // Handle selecting an order
  const handleOrderSelect = (orderId: string) => {
    setSelectedOrderId(orderId);
    setFormData(prev => ({ ...prev, orderId }));
    setCutItems([]);

    // If no order is selected, clear the selection
    if (!orderId) {
      setSelectedOrder(null);
      return;
    }

    // Get selected order
    const order = orders.find(o => o.id === orderId);
    if (order) {
      // Add items from the order as cut items
      const orderItems = order.items.map(item => ({
        id: item.id,
        drawingCode: item.code,
        itemNumber: item.itemNumber.toString(),
        length: 0, // Initial length, needs to be set by user
        quantity: item.quantity
      }));
      
      setCutItems(orderItems);
      setSelectedOrder(order);
    }
  };

  // Handle adding a new cut item
  const handleAddCutItem = () => {
    if (newCutItem.length <= 0 || newCutItem.quantity <= 0) {
      alert('Por favor, informe o comprimento e a quantidade');
      return;
    }

    setCutItems([...cutItems, newCutItem]);
    setNewCutItem({
      id: crypto.randomUUID(),
      drawingCode: '',
      itemNumber: '',
      length: 0,
      quantity: 0
    });
  };

  // Handle removing a cut item
  const handleRemoveCutItem = (id: string) => {
    setCutItems(cutItems.filter(item => item.id !== id));
  };

  // Update a cut item's properties
  const handleUpdateCutItem = (id: string, field: keyof CutItem, value: any) => {
    setCutItems(cutItems.map(item => 
      item.id === id ? { ...item, [field]: value } : item
    ));
  };

  // Calculate the optimized cutting plan
  const calculateCuttingPlan = () => {
    if (cutItems.length === 0 || barLength <= 0) {
      alert('Por favor, adicione pelo menos um item para corte e informe o comprimento da barra');
      return;
    }

    // Validate that all items have lengths
    const incompleteItems = cutItems.filter(item => !item.length || item.length <= 0);
    if (incompleteItems.length > 0) {
      alert('Por favor, informe o comprimento para todos os itens');
      return;
    }

    // Create expanded list with multiple copies based on quantity
    const expandedCuts: { id: string; drawingCode: string; itemNumber: string; length: number }[] = [];
    cutItems.forEach(item => {
      for (let i = 0; i < item.quantity; i++) {
        expandedCuts.push({
          id: item.id,
          drawingCode: item.drawingCode,
          itemNumber: item.itemNumber,
          length: item.length
        });
      }
    });

    // Sort cuts in descending order by length
    expandedCuts.sort((a, b) => b.length - a.length);

    // Initialize bars
    const bars: Bar[] = [];
    let currentBar: Bar = {
      barNumber: 1,
      totalLength: barLength,
      cuts: [],
      remainingLength: barLength
    };

    // First-Fit Decreasing algorithm for bin packing
    expandedCuts.forEach(cut => {
      // Check if current cut can fit in the current bar
      if (currentBar.remainingLength >= cut.length + cuttingThickness) {
        // Add cut to current bar
        const startPosition = barLength - currentBar.remainingLength;
        const endPosition = startPosition + cut.length;
        
        currentBar.cuts.push({
          itemId: cut.id,
          drawingCode: cut.drawingCode,
          itemNumber: cut.itemNumber,
          length: cut.length,
          startPosition,
          endPosition,
          isScrap: false
        });
        
        // Update remaining length accounting for the cutting thickness
        currentBar.remainingLength -= (cut.length + cuttingThickness);
      } else {
        // If there's some remaining space, add it as scrap
        if (currentBar.remainingLength > 0) {
          const startPosition = barLength - currentBar.remainingLength;
          const endPosition = barLength;
          
          currentBar.cuts.push({
            itemId: 'scrap',
            drawingCode: 'SOBRA',
            itemNumber: 'S',
            length: currentBar.remainingLength,
            startPosition,
            endPosition,
            isScrap: true
          });
        }
        
        // Create a new bar
        bars.push(currentBar);
        currentBar = {
          barNumber: bars.length + 1,
          totalLength: barLength,
          cuts: [],
          remainingLength: barLength
        };
        
        // Try again with the new bar
        const startPosition = barLength - currentBar.remainingLength;
        const endPosition = startPosition + cut.length;
        
        currentBar.cuts.push({
          itemId: cut.id,
          drawingCode: cut.drawingCode,
          itemNumber: cut.itemNumber,
          length: cut.length,
          startPosition,
          endPosition,
          isScrap: false
        });
        
        currentBar.remainingLength -= (cut.length + cuttingThickness);
      }
    });

    // Add the last bar if it has any cuts
    if (currentBar.cuts.length > 0) {
      // If there's some remaining space, add it as scrap
      if (currentBar.remainingLength > 0) {
        const startPosition = barLength - currentBar.remainingLength;
        const endPosition = barLength;
        
        currentBar.cuts.push({
          itemId: 'scrap',
          drawingCode: 'SOBRA',
          itemNumber: 'S',
          length: currentBar.remainingLength,
          startPosition,
          endPosition,
          isScrap: true
        });
      }
      
      bars.push(currentBar);
    }

    // Calculate statistics
    const totalBarsNeeded = bars.length;
    const totalMaterialWeight = totalBarsNeeded * (barLength / 1000) * weightPerMeter; // in kg
    
    // Calculate scrap
    let totalScrapWeight = 0;
    bars.forEach(bar => {
      bar.cuts.forEach(cut => {
        if (cut.isScrap) {
          totalScrapWeight += (cut.length / 1000) * weightPerMeter;
        }
      });
    });
    
    // Calculate utilization
    const utilizationPercentage = totalBarsNeeded > 0
      ? ((totalMaterialWeight - totalScrapWeight) / totalMaterialWeight) * 100
      : 0;

    // Create the cutting plan object
    const newCuttingPlan: CuttingPlan = {
      id: crypto.randomUUID(),
      orderId: selectedOrderId,
      orderNumber: selectedOrder?.orderNumber || 'N/A',
      materialName,
      materialDescription,
      barLength,
      weightPerMeter,
      cuttingThickness,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      createdBy: 'system', // In a real app, this would be the current user
      totalBarsNeeded,
      totalMaterialWeight,
      totalScrapWeight,
      utilizationPercentage,
      traceabilityCode: `PC-${planCounter.toString().padStart(3, '0')}`,
      bars,
      deleted: false // Add this field to track deleted status
    };

    setCuttingPlan(newCuttingPlan);
  };

  // Save the cutting plan to the database
  const saveCuttingPlan = async () => {
    if (!cuttingPlan) return;

    try {
      const docRef = await addDoc(collection(db, 'cuttingPlans'), cuttingPlan);
      alert(`Plano de corte salvo com ID: ${docRef.id}`);
      
      // Add to loaded plans
      setLoadedPlans([{...cuttingPlan, id: docRef.id}, ...loadedPlans]);
      
      // Increment plan counter for next plan
      setPlanCounter(prev => prev + 1);
      
      // Clear the form after saving
      resetForm();
      
      // Optionally, export to PDF after saving
      exportToPDF(cuttingPlan);
    } catch (error) {
      console.error('Error saving cutting plan:', error);
      alert('Erro ao salvar plano de corte');
    }
  };

  // Reset form fields after saving
  const resetForm = () => {
    setSelectedOrderId('');
    setFormData({ orderId: '' });
    setMaterialName('');
    setMaterialDescription('');
    setBarLength(6000);
    setCuttingThickness(3);
    setWeightPerMeter(0);
    setCutItems([]);
    setCuttingPlan(null);
    setNewCutItem({
      id: crypto.randomUUID(),
      drawingCode: '',
      itemNumber: '',
      length: 0,
      quantity: 0
    });
  };

  // Handle deleting a cutting plan
  const handleDeletePlan = async (planId: string) => {
    if (!window.confirm('Tem certeza que deseja excluir este plano de corte?')) {
      return;
    }

    try {
      setIsDeleting(true);
      const planRef = doc(db, 'cuttingPlans', planId);
      
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

  // Handle deleting all cutting plans
  const handleDeleteAllPlans = async () => {
    if (!window.confirm('Tem certeza que deseja excluir TODOS os planos de corte? Esta ação não pode ser desfeita.')) {
      return;
    }

    try {
      setIsDeletingAll(true);
      
      // Get all cutting plans
      const plansRef = collection(db, 'cuttingPlans');
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

  // Export the cutting plan to PDF
  const exportToPDF = (plan: CuttingPlan) => {
    if (!plan) return;
    
    // Create PDF in landscape orientation
    const doc = new jsPDF({
      orientation: 'landscape',
      unit: 'mm'
    });
    
    // Get page dimensions (now landscape)
    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    
    // Get selected order for OS information
    const selectedOrder = orders.find(o => o.id === plan.orderId);
    
    let y = 20;
    
    // Add logo if available
    if (companyLogo) {
      doc.addImage(companyLogo, 'JPEG', 15, 10, 40, 20);
      y = 40;
    }
    
    // Add title
    doc.setFontSize(18);
    doc.setFont(undefined, 'bold');
    doc.text('PLANO DE CORTE', pageWidth / 2, 20, { align: 'center' });
    
    // Add subtitle with plan number
    doc.setFontSize(14);
    doc.text(`Plano Nº: ${plan.traceabilityCode} - Material: ${plan.materialName}`, pageWidth / 2, 30, { align: 'center' });
    
    // Add OS Interna and customer name
    if (selectedOrder) {
      doc.text(`OS Interna: ${selectedOrder.internalOrderNumber}`, pageWidth / 2, 40, { align: 'center' });
      doc.text(`Cliente: ${selectedOrder.customer}`, pageWidth / 2, 50, { align: 'center' });
    }
    
    // Add material description if available
    if (plan.materialDescription) {
      doc.text(`Descrição: ${plan.materialDescription}`, pageWidth / 2, 60, { align: 'center' });
      y = 70;
    } else {
      y = 60;
    }
    
    // Add date
    doc.setFontSize(10);
    doc.setFont(undefined, 'normal');
    doc.text(`Data: ${format(new Date(), 'dd/MM/yyyy', { locale: ptBR })}`, 15, y);
    y += 10;
    
    // Add summary
    doc.setFontSize(12);
    doc.setFont(undefined, 'bold');
    doc.text('Resumo', 15, y);
    y += 10;
    
    doc.setFontSize(10);
    doc.setFont(undefined, 'normal');
    doc.text(`Comprimento da Barra: ${plan.barLength} mm`, 15, y);
    y += 8;
    doc.text(`Espessura do Corte: ${plan.cuttingThickness} mm`, 15, y);
    y += 8;
    doc.text(`Peso Específico: ${plan.weightPerMeter.toFixed(2)} kg/m`, 15, y);
    y += 8;
    doc.text(`Total de Barras: ${plan.totalBarsNeeded}`, 15, y);
    y += 8;
    doc.text(`Peso Total de Material: ${plan.totalMaterialWeight.toFixed(2)} kg`, 15, y);
    y += 8;
    doc.text(`Peso Total de Sobra: ${plan.totalScrapWeight.toFixed(2)} kg`, 15, y);
    y += 8;
    doc.text(`Aproveitamento: ${plan.utilizationPercentage.toFixed(2)}%`, 15, y);
    y += 12;
    
    // Add cutting details
    doc.setFontSize(14);
    doc.setFont(undefined, 'bold');
    doc.text('Detalhes do Corte', 15, y);
    y += 10;
    
    // Add table with cutting details
    const tableData = [];
    for (const bar of plan.bars) {
      // Add bar header
      tableData.push([
        `Barra ${bar.barNumber}`,
        `Comprimento: ${bar.totalLength} mm`,
        `Cortes: ${bar.cuts.length}`,
        `Sobra: ${bar.remainingLength} mm`,
        ''
      ]);
      
      // Add cuts
      for (const cut of bar.cuts) {
        tableData.push([
          cut.isScrap ? 'SOBRA' : cut.drawingCode,
          `Item ${cut.itemNumber}`,
          `${cut.length} mm`,
          `Posição: ${cut.startPosition} - ${cut.endPosition}`,
          cut.isScrap ? 'REAPROVEITAMENTO' : ''
        ]);
      }
      
      // Add spacer
      tableData.push(['', '', '', '', '']);
    }
    
    (doc as any).autoTable({
      startY: y,
      head: [['Código', 'Item', 'Comprimento', 'Posição', 'Observações']],
      body: tableData,
      theme: 'striped',
      headStyles: {
        fillColor: [59, 130, 246],
        textColor: [255, 255, 255],
        fontStyle: 'bold'
      },
      styles: {
        overflow: 'linebreak',
        cellPadding: 2
      },
      columnStyles: {
        0: { cellWidth: 40 },
        1: { cellWidth: 30 },
        2: { cellWidth: 30 },
        3: { cellWidth: 'auto' },
        4: { cellWidth: 40 }
      },
      didParseCell: function(data: any) {
        // Color the scrap rows with a darker color for better visibility in B&W printing
        if (data.section === 'body' && data.row.raw[0] === 'SOBRA') {
          data.cell.styles.fillColor = [200, 200, 170]; // Darker yellow for scrap
          data.cell.styles.fontStyle = 'bold';
        }
        
        // Color the bar headers
        if (data.section === 'body' && data.row.raw[0].startsWith('Barra')) {
          data.cell.styles.fillColor = [220, 230, 241]; // Light blue for bar headers
          data.cell.styles.fontStyle = 'bold';
        }
      }
    });
    
    // Add footer with page number and date
    const totalPages = doc.getNumberOfPages();
    for (let i = 1; i <= totalPages; i++) {
      doc.setPage(i);
      doc.setFontSize(8);
      doc.setTextColor(128, 128, 128);
      
      // Add page number at bottom right
      doc.text(
        `Página ${i} de ${totalPages}`,
        pageWidth - 20, 
        pageHeight - 10, 
        { align: 'right' }
      );
      
      // Add date at bottom left
      doc.text(
        `Gerado em: ${format(new Date(), 'dd/MM/yyyy HH:mm', { locale: ptBR })}`,
        20, 
        pageHeight - 10
      );
      
      // Reset text color
      doc.setTextColor(0, 0, 0);
    }
    
    // Save the PDF
    doc.save(`plano-corte-${plan.traceabilityCode}.pdf`);
  };

  // Select a previously generated plan
  const selectPlan = (plan: CuttingPlan) => {
    setCuttingPlan(plan);
    setSelectedOrderId(plan.orderId);
    setFormData({ orderId: plan.orderId });
    setMaterialName(plan.materialName);
    setMaterialDescription(plan.materialDescription || '');
    setBarLength(plan.barLength);
    setCuttingThickness(plan.cuttingThickness);
    setWeightPerMeter(plan.weightPerMeter);
    
    // Recreate cut items from the plan
    const itemMap = new Map<string, { count: number, item: CutItem }>();
    
    plan.bars.forEach(bar => {
      bar.cuts.forEach(cut => {
        if (!cut.isScrap) {
          const key = `${cut.drawingCode}-${cut.length}`;
          if (itemMap.has(key)) {
            const existing = itemMap.get(key)!;
            existing.count += 1;
          } else {
            itemMap.set(key, {
              count: 1,
              item: {
                id: cut.itemId,
                drawingCode: cut.drawingCode,
                itemNumber: cut.itemNumber,
                length: cut.length,
                quantity: 1 // Will be summed up
              }
            });
          }
        }
      });
    });
    
    // Convert to array and update quantities
    const items: CutItem[] = Array.from(itemMap.values()).map(({ count, item }) => ({
      ...item,
      quantity: count
    }));
    
    setCutItems(items);
  };

  // Filter plans based on search term
  const filteredPlans = loadedPlans.filter(plan => {
    if (!searchTerm) return true;
    
    const term = searchTerm.toLowerCase();
    return (
      plan.materialName.toLowerCase().includes(term) ||
      plan.materialDescription?.toLowerCase().includes(term) ||
      plan.orderNumber.toLowerCase().includes(term) ||
      plan.traceabilityCode.toLowerCase().includes(term)
    );
  });

  return (
    <div className="space-y-6">
      <div className="p-4 bg-blue-50 rounded-lg border-l-4 border-blue-500">
        <div className="flex items-start">
          <Info className="h-5 w-5 text-blue-600 mr-3 mt-0.5" />
          <div>
            <h3 className="font-medium text-lg text-blue-800">Calculadora de Plano de Corte</h3>
            <p className="mt-1 text-blue-700">
              Otimize o aproveitamento de material determinando a melhor forma de cortar barras
              para minimizar o desperdício de material.
            </p>
          </div>
        </div>
      </div>

      {/* Order selection */}
      <div className="bg-white p-6 rounded-lg shadow border">
        <h3 className="text-lg font-medium mb-4">Pedido e Material</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Selecionar Pedido
            </label>
            <select
              value={selectedOrderId}
              onChange={(e) => handleOrderSelect(e.target.value)}
              className="w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring focus:ring-blue-200"
            >
              <option value="">Selecione um pedido</option>
              {orders
                .filter(order => !order.deleted)
                .sort((a, b) => a.orderNumber.localeCompare(b.orderNumber))
                .map(order => (
                  <option key={order.id} value={order.id}>
                    OS: {order.internalOrderNumber} - #{order.orderNumber} - {order.customer}
                  </option>
                ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Material
            </label>
            <input
              type="text"
              value={materialName}
              onChange={(e) => setMaterialName(e.target.value)}
              className="w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring focus:ring-blue-200"
              placeholder="Ex: Aço Carbono, Inox, Alumínio"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Descrição do Material
            </label>
            <input
              type="text"
              value={materialDescription}
              onChange={(e) => setMaterialDescription(e.target.value)}
              className="w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring focus:ring-blue-200"
              placeholder='Ex: Cantoneira 2" x 3/16"'
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Comprimento da Barra (mm)
            </label>
            <input
              type="number"
              value={barLength}
              onChange={(e) => setBarLength(parseInt(e.target.value))}
              className="w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring focus:ring-blue-200"
              min="1"
            />
            <p className="text-xs text-gray-500 mt-1">Comprimento padrão da barra em milímetros</p>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Espessura do Corte (mm)
            </label>
            <input
              type="number"
              value={cuttingThickness}
              onChange={(e) => setCuttingThickness(parseInt(e.target.value))}
              className="w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring focus:ring-blue-200"
              min="1"
            />
            <p className="text-xs text-gray-500 mt-1">Espessura da lâmina ou perda por corte</p>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Peso por Metro (kg/m)
            </label>
            <input
              type="number"
              value={weightPerMeter}
              onChange={(e) => setWeightPerMeter(parseFloat(e.target.value))}
              className="w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring focus:ring-blue-200"
              min="0.01"
              step="0.01"
              placeholder="Ex: 7.85 para aço"
            />
            <p className="text-xs text-gray-500 mt-1">Peso específico do material em kg/m</p>
          </div>
        </div>
        
        <div className="mt-6">
          <h4 className="font-medium mb-4">Itens para Corte</h4>
          <table className="min-w-full divide-y divide-gray-200 mb-4">
            <thead className="bg-gray-50">
              <tr>
                <th scope="col" className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Código
                </th>
                <th scope="col" className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Item
                </th>
                <th scope="col" className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Comprimento (mm)
                </th>
                <th scope="col" className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Quantidade
                </th>
                <th scope="col" className="px-3 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Ações
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {cutItems.map(item => (
                <tr key={item.id}>
                  <td className="px-3 py-2 whitespace-nowrap text-sm">
                    <input
                      type="text"
                      value={item.drawingCode}
                      onChange={(e) => handleUpdateCutItem(item.id, 'drawingCode', e.target.value)}
                      className="w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring focus:ring-blue-200 text-sm"
                    />
                  </td>
                  <td className="px-3 py-2 whitespace-nowrap text-sm">
                    <input
                      type="text"
                      value={item.itemNumber}
                      onChange={(e) => handleUpdateCutItem(item.id, 'itemNumber', e.target.value)}
                      className="w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring focus:ring-blue-200 text-sm"
                    />
                  </td>
                  <td className="px-3 py-2 whitespace-nowrap text-sm">
                    <input
                      type="number"
                      value={item.length || ''}
                      onChange={(e) => handleUpdateCutItem(item.id, 'length', parseInt(e.target.value))}
                      className="w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring focus:ring-blue-200 text-sm"
                      min="1"
                    />
                  </td>
                  <td className="px-3 py-2 whitespace-nowrap text-sm">
                    <input
                      type="number"
                      value={item.quantity}
                      onChange={(e) => handleUpdateCutItem(item.id, 'quantity', parseInt(e.target.value))}
                      className="w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring focus:ring-blue-200 text-sm"
                      min="1"
                    />
                  </td>
                  <td className="px-3 py-2 whitespace-nowrap text-sm text-center">
                    <button
                      type="button"
                      onClick={() => handleRemoveCutItem(item.id)}
                      className="text-red-600 hover:text-red-800"
                    >
                      <Trash2 className="h-5 w-5" />
                    </button>
                  </td>
                </tr>
              ))}
              <tr>
                <td className="px-3 py-2 whitespace-nowrap text-sm">
                  <input
                    type="text"
                    value={newCutItem.drawingCode}
                    onChange={(e) => setNewCutItem({...newCutItem, drawingCode: e.target.value})}
                    placeholder="Código/Desenho"
                    className="w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring focus:ring-blue-200 text-sm"
                  />
                </td>
                <td className="px-3 py-2 whitespace-nowrap text-sm">
                  <input
                    type="text"
                    value={newCutItem.itemNumber}
                    onChange={(e) => setNewCutItem({...newCutItem, itemNumber: e.target.value})}
                    placeholder="Item"
                    className="w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring focus:ring-blue-200 text-sm"
                  />
                </td>
                <td className="px-3 py-2 whitespace-nowrap text-sm">
                  <input
                    type="number"
                    value={newCutItem.length || ''}
                    onChange={(e) => setNewCutItem({...newCutItem, length: parseInt(e.target.value)})}
                    placeholder="Comprimento"
                    className="w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring focus:ring-blue-200 text-sm"
                    min="1"
                  />
                </td>
                <td className="px-3 py-2 whitespace-nowrap text-sm">
                  <input
                    type="number"
                    value={newCutItem.quantity || ''}
                    onChange={(e) => setNewCutItem({...newCutItem, quantity: parseInt(e.target.value)})}
                    placeholder="Quantidade"
                    className="w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring focus:ring-blue-200 text-sm"
                    min="1"
                  />
                </td>
                <td className="px-3 py-2 whitespace-nowrap text-sm text-center">
                  <button
                    type="button"
                    onClick={handleAddCutItem}
                    className="text-blue-600 hover:text-blue-800"
                    title="Adicionar Item"
                  >
                    <Plus className="h-5 w-5" />
                  </button>
                </td>
              </tr>
            </tbody>
          </table>
          
          <div className="flex justify-end space-x-4">
            <button
              type="button"
              onClick={resetForm}
              className="px-4 py-2 border border-gray-300 rounded-md hover:bg-gray-50 flex items-center"
            >
              <RefreshCw className="h-5 w-5 mr-2" />
              Limpar Dados
            </button>
            <button
              type="button"
              onClick={calculateCuttingPlan}
              className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 flex items-center"
              disabled={cutItems.length === 0}
            >
              <Scissors className="h-5 w-5 mr-2" />
              Calcular Plano de Corte
            </button>
          </div>
        </div>
      </div>

      {/* Previous cutting plans */}
      <div className="bg-white p-6 rounded-lg shadow border">
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-lg font-medium">Planos de Corte Anteriores</h3>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Buscar planos de corte..."
              className="pl-10 w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring focus:ring-blue-200 text-sm"
            />
          </div>
        </div>
        
        <div className="flex justify-end mb-4">
          <button
            onClick={handleDeleteAllPlans}
            className={`flex items-center px-4 py-2 ${loadedPlans.length > 0 ? 'bg-red-600 text-white' : 'bg-gray-300 text-gray-500 cursor-not-allowed'} rounded-lg hover:bg-red-700`}
            disabled={loadedPlans.length === 0 || isDeletingAll}
          >
            {isDeletingAll ? (
              <>
                <span className="mr-2">Excluindo...</span>
                <div className="animate-spin h-4 w-4 border-2 border-white rounded-full border-t-transparent"></div>
              </>
            ) : (
              <>
                <Trash2 className="h-5 w-5 mr-2" />
                Limpar Todos os Planos
              </>
            )}
          </button>
        </div>
        
        {filteredPlans.length === 0 ? (
          <div className="text-center py-8 bg-gray-50 rounded-lg">
            <p className="text-gray-500">{searchTerm ? 'Nenhum plano de corte encontrado para esta busca.' : 'Nenhum plano de corte salvo.'}</p>
          </div>
        ) : (
          <div className="space-y-3 max-h-[400px] overflow-y-auto pr-1">
            {filteredPlans.map(plan => {
              // Get the corresponding order for this plan
              const planOrder = orders.find(o => o.id === plan.orderId);
              
              return (
                <div 
                  key={plan.id}
                  className="p-4 border rounded-lg hover:bg-gray-50 cursor-pointer relative group"
                  onClick={() => selectPlan(plan)}
                >
                  <div className="flex justify-between items-start">
                    <div>
                      <h4 className="font-medium">{plan.materialName}</h4>
                      {plan.materialDescription && (
                        <p className="text-sm text-gray-600">
                          {plan.materialDescription}
                        </p>
                      )}
                      <p className="text-sm text-gray-500">
                        <span className="font-semibold mr-1">OS Interna: {planOrder?.internalOrderNumber}</span> | 
                        Plano Nº: {plan.traceabilityCode} | Pedido #{plan.orderNumber} | {format(new Date(plan.createdAt), 'dd/MM/yyyy', { locale: ptBR })}
                      </p>
                      <p className="text-sm text-gray-500">
                        Barras: {plan.totalBarsNeeded} | Aproveitamento: {plan.utilizationPercentage.toFixed(2)}%
                      </p>
                    </div>
                    <div className="flex space-x-2">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          exportToPDF(plan);
                        }}
                        className="p-2 text-gray-600 hover:bg-gray-200 rounded-full"
                        title="Exportar PDF"
                      >
                        <Download className="h-5 w-5" />
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDeletePlan(plan.id);
                        }}
                        className="p-2 text-red-600 hover:bg-red-100 rounded-full opacity-0 group-hover:opacity-100 transition-opacity"
                        title="Excluir Plano"
                        disabled={isDeleting}
                      >
                        <Trash2 className="h-5 w-5" />
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Results section */}
      {cuttingPlan && (
        <div className="bg-white p-6 rounded-lg shadow border">
          <div className="flex justify-between items-center mb-6">
            <h3 className="text-lg font-medium">Resultados do Plano de Corte</h3>
            <div className="flex space-x-4">
              <button
                type="button"
                onClick={saveCuttingPlan}
                className="px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 flex items-center"
              >
                <Save className="h-5 w-5 mr-2" />
                Salvar Plano
              </button>
              <button
                type="button"
                onClick={() => exportToPDF(cuttingPlan)}
                className="px-4 py-2 bg-gray-600 text-white rounded-md hover:bg-gray-700 flex items-center"
              >
                <Download className="h-5 w-5 mr-2" />
                Exportar PDF
              </button>
            </div>
          </div>

          <div className="bg-blue-50 p-4 rounded-lg mb-6">
            <h4 className="font-medium flex items-center">
              <Tape className="h-5 w-5 mr-2 text-blue-600" />
              Resumo do Plano
            </h4>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-4">
              <div className="bg-white p-3 rounded border border-blue-200">
                <div className="text-sm text-gray-500">Material</div>
                <div className="font-medium">{cuttingPlan.materialName}</div>
                {cuttingPlan.materialDescription && (
                  <div className="text-sm text-gray-500">{cuttingPlan.materialDescription}</div>
                )}
              </div>
              <div className="bg-white p-3 rounded border border-blue-200">
                <div className="text-sm text-gray-500">Comprimento da Barra</div>
                <div className="font-medium">{cuttingPlan.barLength} mm</div>
              </div>
              <div className="bg-white p-3 rounded border border-blue-200">
                <div className="text-sm text-gray-500">Espessura do Corte</div>
                <div className="font-medium">{cuttingPlan.cuttingThickness} mm</div>
              </div>
              <div className="bg-white p-3 rounded border border-blue-200">
                <div className="text-sm text-gray-500">Barras Necessárias</div>
                <div className="font-medium">{cuttingPlan.totalBarsNeeded}</div>
              </div>
              <div className="bg-white p-3 rounded border border-blue-200">
                <div className="text-sm text-gray-500">Peso Total de Material</div>
                <div className="font-medium">{cuttingPlan.totalMaterialWeight.toFixed(2)} kg</div>
              </div>
              <div className="bg-white p-3 rounded border border-blue-200">
                <div className="text-sm text-gray-500">Aproveitamento</div>
                <div className="font-medium">{cuttingPlan.utilizationPercentage.toFixed(2)}%</div>
              </div>
            </div>
          </div>

          <div className="space-y-6">
            {cuttingPlan.bars.map(bar => (
              <div key={bar.barNumber} className="border rounded-lg p-4">
                <div className="flex justify-between items-center mb-4">
                  <h4 className="font-medium">Barra {bar.barNumber}</h4>
                  <div className="text-sm text-gray-500">
                    Sobra: {bar.remainingLength} mm ({((bar.remainingLength / bar.totalLength) * 100).toFixed(1)}%)
                  </div>
                </div>
                
                {/* Visual representation of cuts */}
                <div className="relative h-12 bg-gray-100 rounded mb-4 overflow-hidden">
                  {bar.cuts.map((cut, index) => {
                    const widthPercent = (cut.length / bar.totalLength) * 100;
                    const leftPercent = (cut.startPosition / bar.totalLength) * 100;
                    
                    return (
                      <div
                        key={index}
                        className={`absolute top-0 bottom-0 flex items-center justify-center text-xs font-medium ${
                          cut.isScrap 
                            ? 'bg-yellow-600 text-white' // Darker yellow for SOBRA to be visible in B&W printing
                            : 'bg-blue-500 text-white'
                        }`}
                        style={{
                          left: `${leftPercent}%`,
                          width: `${widthPercent}%`,
                        }}
                        title={`${cut.drawingCode}: ${cut.length}mm`}
                      >
                        {widthPercent > 5 && (
                          cut.isScrap 
                            ? 'SOBRA' 
                            : `${cut.itemNumber}: ${cut.length}`
                        )}
                      </div>
                    );
                  })}
                </div>
                
                {/* Cut details table */}
                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-gray-200">
                    <thead className="bg-gray-50">
                      <tr>
                        <th scope="col" className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Item
                        </th>
                        <th scope="col" className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Código
                        </th>
                        <th scope="col" className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Comprimento
                        </th>
                        <th scope="col" className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Posição
                        </th>
                      </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                      {bar.cuts.map((cut, index) => (
                        <tr key={index} className={cut.isScrap ? 'bg-yellow-50 font-medium' : ''}>
                          <td className="px-3 py-2 whitespace-nowrap text-sm">
                            {cut.isScrap ? 'SOBRA' : cut.itemNumber}
                          </td>
                          <td className="px-3 py-2 whitespace-nowrap text-sm">
                            {cut.drawingCode}
                          </td>
                          <td className="px-3 py-2 whitespace-nowrap text-sm">
                            {cut.length} mm
                          </td>
                          <td className="px-3 py-2 whitespace-nowrap text-sm">
                            {cut.startPosition} - {cut.endPosition} mm
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* System info footer */}
      <div className="text-left text-sm text-gray-500 mt-10">
        <p>Sistema Orbit</p>
        <p>Versão 1.0</p>
        <p>Desenvolvido por Paulo Henrique Nascimento Ribeiro</p>
        <p>© 2025 - Todos os direitos reservados</p>
      </div>
    </div>
  );
};

// Save icon component
function Save(props: any) {
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
      <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z" />
      <polyline points="17 21 17 13 7 13 7 21" />
      <polyline points="7 3 7 8 15 8" />
    </svg>
  )
}

// Plus icon component
function Plus(props: any) {
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
      <path d="M12 5v14" />
      <path d="M5 12h14" />
    </svg>
  )
}

// Scissors icon component
function Scissors(props: any) {
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
      <circle cx="6" cy="6" r="3" />
      <circle cx="6" cy="18" r="3" />
      <line x1="20" x2="8.12" y1="4" y2="15.88" />
      <line x1="14.47" x2="20" y1="14.48" y2="20" />
      <line x1="8.12" x2="12" y1="8.12" y2="12" />
    </svg>
  )
}

export default CuttingPlanCalculator;