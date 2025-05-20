import React, { useState, useEffect } from 'react';
import { X, Plus, Trash2, ChevronLeft, Download } from 'lucide-react';
import { NonConformity } from '../types/quality';
import { Order } from '../types/kanban';
import FiveWhysForm, { FiveWhyAnalysis } from './FiveWhysForm';
import { jsPDF } from 'jspdf';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { useSettingsStore } from '../store/settingsStore';

interface NonConformityFormProps {
  nonConformity: NonConformity | null;
  order: Order | null;
  onSave: (nonConformity: NonConformity) => void;
  onCancel: () => void;
}

const NonConformityForm: React.FC<NonConformityFormProps> = ({
  nonConformity,
  order,
  onSave,
  onCancel,
}) => {
  const { companyLogo, companyName } = useSettingsStore();
  const [formData, setFormData] = useState<NonConformity>({
    id: nonConformity?.id || 'new',
    orderId: nonConformity?.orderId || order?.id || '',
    itemId: nonConformity?.itemId || order?.items[0]?.id || '',
    title: nonConformity?.title || '',
    description: nonConformity?.description || '',
    severity: nonConformity?.severity || 'medium',
    status: nonConformity?.status || 'open',
    createdAt: nonConformity?.createdAt || new Date().toISOString(),
    createdBy: nonConformity?.createdBy || '',
    assignedTo: nonConformity?.assignedTo || '',
    resolvedAt: nonConformity?.resolvedAt || '',
    resolvedBy: nonConformity?.resolvedBy || '',
    resolutionDescription: nonConformity?.resolutionDescription || '',
    followUpRequired: nonConformity?.followUpRequired || false,
    followUpDate: nonConformity?.followUpDate || '',
    impactedAreas: nonConformity?.impactedAreas || [],
    rootCause: nonConformity?.rootCause || '',
    preventiveAction: nonConformity?.preventiveAction || '',
    costImpact: nonConformity?.costImpact || 0,
    fiveWhys: nonConformity?.fiveWhys || null,
  });

  const [newImpactedArea, setNewImpactedArea] = useState('');
  const [showFiveWhys, setShowFiveWhys] = useState(!!formData.fiveWhys);

  const handleAddImpactedArea = () => {
    if (!newImpactedArea.trim()) return;
    setFormData({
      ...formData,
      impactedAreas: [...(formData.impactedAreas || []), newImpactedArea.trim()],
    });
    setNewImpactedArea('');
  };

  const handleRemoveImpactedArea = (index: number) => {
    const updatedAreas = [...(formData.impactedAreas || [])];
    updatedAreas.splice(index, 1);
    setFormData({
      ...formData,
      impactedAreas: updatedAreas,
    });
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    // Add resolution date if status is resolved or closed
    const updatedData = { ...formData };
    if ((formData.status === 'resolved' || formData.status === 'closed') && !formData.resolvedAt) {
      updatedData.resolvedAt = new Date().toISOString();
    }
    
    onSave(updatedData);
  };
  
  const handleSaveFiveWhys = (data: FiveWhyAnalysis) => {
    setFormData({
      ...formData,
      fiveWhys: data,
      // Also update root cause in the main form based on 5 whys analysis
      rootCause: data.rootCause,
      // Update preventive action too if it's empty
      preventiveAction: formData.preventiveAction || data.correctionPlan
    });
    setShowFiveWhys(false);
  };

  const handleExportNonConformity = () => {
    const doc = new jsPDF();
    
    let y = 20;
    
    // Add logo if available
    if (companyLogo) {
      doc.addImage(companyLogo, 'JPEG', 15, 10, 40, 20);
      y = 40;
    }
    
    // Add title
    doc.setFontSize(18);
    doc.setFont(undefined, 'bold');
    doc.text('REGISTRO DE NÃO CONFORMIDADE', 105, y, { align: 'center' });
    y += 10;
    
    if (companyName) {
      doc.setFontSize(14);
      doc.setFont(undefined, 'normal');
      doc.text(companyName, 105, y, { align: 'center' });
      y += 10;
    }
    
    // Order details
    if (order) {
      doc.setFontSize(12);
      doc.setFont(undefined, 'bold');
      doc.text(`Pedido: #${order.orderNumber} - ${order.customer}`, 15, y);
      y += 10;
    }
    
    // NC details
    doc.setFontSize(14);
    doc.setFont(undefined, 'bold');
    doc.text('1. Informações da Não Conformidade', 15, y);
    y += 10;
    
    doc.setFontSize(12);
    doc.setFont(undefined, 'bold');
    doc.text('Título:', 15, y);
    doc.setFont(undefined, 'normal');
    doc.text(formData.title, 60, y);
    y += 10;
    
    doc.setFontSize(12);
    doc.setFont(undefined, 'bold');
    doc.text('Data de Criação:', 15, y);
    doc.setFont(undefined, 'normal');
    doc.text(format(new Date(formData.createdAt), 'dd/MM/yyyy', { locale: ptBR }), 60, y);
    y += 10;
    
    doc.setFontSize(12);
    doc.setFont(undefined, 'bold');
    doc.text('Severidade:', 15, y);
    doc.setFont(undefined, 'normal');
    doc.text(
      formData.severity === 'low' ? 'Baixa' :
      formData.severity === 'medium' ? 'Média' :
      formData.severity === 'high' ? 'Alta' : 'Crítica',
      60, y
    );
    y += 10;
    
    doc.setFontSize(12);
    doc.setFont(undefined, 'bold');
    doc.text('Status:', 15, y);
    doc.setFont(undefined, 'normal');
    doc.text(
      formData.status === 'open' ? 'Aberta' :
      formData.status === 'in-progress' ? 'Em Andamento' :
      formData.status === 'resolved' ? 'Resolvida' : 'Fechada',
      60, y
    );
    y += 10;
    
    // Description
    doc.setFontSize(14);
    doc.setFont(undefined, 'bold');
    doc.text('2. Descrição', 15, y);
    y += 10;
    
    doc.setFontSize(11);
    doc.setFont(undefined, 'normal');
    const descLines = doc.splitTextToSize(formData.description, 180);
    doc.text(descLines, 15, y);
    y += descLines.length * 7;
    
    // Root Cause
    if (formData.rootCause) {
      y += 5;
      doc.setFontSize(14);
      doc.setFont(undefined, 'bold');
      doc.text('3. Causa Raiz', 15, y);
      y += 10;
      
      doc.setFontSize(11);
      doc.setFont(undefined, 'normal');
      const rootCauseLines = doc.splitTextToSize(formData.rootCause, 180);
      doc.text(rootCauseLines, 15, y);
      y += rootCauseLines.length * 7;
    }
    
    // Preventive Action
    if (formData.preventiveAction) {
      y += 5;
      doc.setFontSize(14);
      doc.setFont(undefined, 'bold');
      doc.text('4. Ação Preventiva', 15, y);
      y += 10;
      
      doc.setFontSize(11);
      doc.setFont(undefined, 'normal');
      const preventiveLines = doc.splitTextToSize(formData.preventiveAction, 180);
      doc.text(preventiveLines, 15, y);
      y += preventiveLines.length * 7;
    }
    
    // Add 5 Whys analysis if available
    if (formData.fiveWhys) {
      y += 5;
      doc.setFontSize(14);
      doc.setFont(undefined, 'bold');
      doc.text('5. Análise 5 Porquês', 15, y);
      y += 10;
      
      doc.setFontSize(11);
      doc.text('Problema:', 15, y);
      y += 7;
      
      doc.setFont(undefined, 'normal');
      const problemLines = doc.splitTextToSize(formData.fiveWhys.problem, 180);
      doc.text(problemLines, 15, y);
      y += problemLines.length * 7 + 5;
      
      formData.fiveWhys.whys.forEach((why, index) => {
        if (!why) return;
        
        doc.setFont(undefined, 'bold');
        doc.text(`Por quê ${index + 1}:`, 15, y);
        y += 7;
        
        doc.setFont(undefined, 'normal');
        const whyLines = doc.splitTextToSize(why, 180);
        doc.text(whyLines, 15, y);
        y += whyLines.length * 7 + 3;
      });
      
      doc.setFont(undefined, 'bold');
      doc.text('Causa Raiz:', 15, y);
      y += 7;
      
      doc.setFont(undefined, 'normal');
      const rootCauseLines = doc.splitTextToSize(formData.fiveWhys.rootCause, 180);
      doc.text(rootCauseLines, 15, y);
      y += rootCauseLines.length * 7 + 5;
      
      doc.setFont(undefined, 'bold');
      doc.text('Plano de Ação Corretiva:', 15, y);
      y += 7;
      
      doc.setFont(undefined, 'normal');
      const planLines = doc.splitTextToSize(formData.fiveWhys.correctionPlan, 180);
      doc.text(planLines, 15, y);
      y += planLines.length * 7;
    }
    
    // Impacted Areas
    if (formData.impactedAreas && formData.impactedAreas.length > 0) {
      y += 5;
      doc.setFontSize(14);
      doc.setFont(undefined, 'bold');
      doc.text('6. Áreas Impactadas', 15, y);
      y += 10;
      
      doc.setFontSize(11);
      doc.setFont(undefined, 'normal');
      formData.impactedAreas.forEach((area, index) => {
        doc.text(`• ${area}`, 15, y);
        y += 7;
      });
    }
    
    // Resolution
    if (formData.status === 'resolved' || formData.status === 'closed') {
      y += 5;
      doc.setFontSize(14);
      doc.setFont(undefined, 'bold');
      doc.text('7. Resolução', 15, y);
      y += 10;
      
      doc.setFontSize(11);
      doc.setFont(undefined, 'bold');
      doc.text('Data de Resolução:', 15, y);
      doc.setFont(undefined, 'normal');
      doc.text(format(new Date(formData.resolvedAt || new Date()), 'dd/MM/yyyy', { locale: ptBR }), 100, y);
      y += 7;
      
      doc.setFont(undefined, 'bold');
      doc.text('Resolvido por:', 15, y);
      doc.setFont(undefined, 'normal');
      doc.text(formData.resolvedBy || '-', 100, y);
      y += 10;
      
      doc.setFont(undefined, 'bold');
      doc.text('Descrição da Solução:', 15, y);
      y += 7;
      
      doc.setFont(undefined, 'normal');
      const resolutionLines = doc.splitTextToSize(formData.resolutionDescription || '', 180);
      doc.text(resolutionLines, 15, y);
      y += resolutionLines.length * 7;
    }
    
    // Add page numbers
    const pageCount = doc.getNumberOfPages();
    for (let i = 1; i <= pageCount; i++) {
      doc.setPage(i);
      doc.setFontSize(8);
      doc.setTextColor(100, 100, 100);
      doc.text(
        `Gerado em ${format(new Date(), 'dd/MM/yyyy HH:mm', { locale: ptBR })} - Página ${i} de ${pageCount}`,
        105, 
        287, 
        { align: 'center' }
      );
      // Reset text color for next page
      doc.setTextColor(0, 0, 0);
    }
    
    // Save the PDF
    doc.save(`nao-conformidade-${formData.id === 'new' ? 'nova' : formData.id}.pdf`);
  };

  const handleExportFiveWhys = () => {
    if (!formData.fiveWhys) return;
    
    const doc = new jsPDF();
    
    let y = 20;
    
    // Add logo if available
    if (companyLogo) {
      doc.addImage(companyLogo, 'JPEG', 15, 10, 40, 20);
      y = 40;
    }
    
    // Add title
    doc.setFontSize(18);
    doc.setFont(undefined, 'bold');
    doc.text('ANÁLISE 5 PORQUÊS', 105, y, { align: 'center' });
    y += 10;
    
    if (companyName) {
      doc.setFontSize(14);
      doc.setFont(undefined, 'normal');
      doc.text(companyName, 105, y, { align: 'center' });
      y += 10;
    }
    
    // Order details
    if (order) {
      doc.setFontSize(12);
      doc.setFont(undefined, 'bold');
      doc.text(`Pedido: #${order.orderNumber} - ${order.customer}`, 15, y);
      y += 10;
    }
    
    // NC Title
    doc.setFontSize(14);
    doc.setFont(undefined, 'bold');
    doc.text(`Não Conformidade: ${formData.title}`, 15, y);
    y += 10;
    
    doc.setFontSize(12);
    doc.setFont(undefined, 'bold');
    doc.text('Data:', 15, y);
    doc.setFont(undefined, 'normal');
    doc.text(format(new Date(), 'dd/MM/yyyy', { locale: ptBR }), 50, y);
    y += 15;
    
    // 5 Whys content
    doc.setFontSize(14);
    doc.setFont(undefined, 'bold');
    doc.text('1. Problema Identificado', 15, y);
    y += 10;
    
    doc.setFontSize(11);
    doc.setFont(undefined, 'normal');
    const problemLines = doc.splitTextToSize(formData.fiveWhys.problem, 180);
    doc.text(problemLines, 15, y);
    y += problemLines.length * 7 + 10;
    
    doc.setFontSize(14);
    doc.setFont(undefined, 'bold');
    doc.text('2. Análise 5 Porquês', 15, y);
    y += 10;
    
    formData.fiveWhys.whys.forEach((why, index) => {
      if (!why) return;
      
      doc.setFontSize(12);
      doc.setFont(undefined, 'bold');
      doc.text(`Por quê ${index + 1}:`, 15, y);
      y += 7;
      
      doc.setFont(undefined, 'normal');
      const whyLines = doc.splitTextToSize(why, 180);
      doc.text(whyLines, 15, y);
      y += whyLines.length * 7 + 5;
    });
    
    y += 5;
    
    doc.setFontSize(14);
    doc.setFont(undefined, 'bold');
    doc.text('3. Causa Raiz Identificada', 15, y);
    y += 10;
    
    doc.setFontSize(11);
    doc.setFont(undefined, 'normal');
    const rootCauseLines = doc.splitTextToSize(formData.fiveWhys.rootCause, 180);
    doc.text(rootCauseLines, 15, y);
    y += rootCauseLines.length * 7 + 10;
    
    doc.setFontSize(14);
    doc.setFont(undefined, 'bold');
    doc.text('4. Plano de Ação Corretiva', 15, y);
    y += 10;
    
    doc.setFontSize(11);
    doc.setFont(undefined, 'normal');
    const planLines = doc.splitTextToSize(formData.fiveWhys.correctionPlan, 180);
    doc.text(planLines, 15, y);
    
    // Add page numbers
    const pageCount = doc.getNumberOfPages();
    for (let i = 1; i <= pageCount; i++) {
      doc.setPage(i);
      doc.setFontSize(8);
      doc.setTextColor(100, 100, 100);
      doc.text(
        `Gerado em ${format(new Date(), 'dd/MM/yyyy HH:mm', { locale: ptBR })} - Página ${i} de ${pageCount}`,
        105, 
        287, 
        { align: 'center' }
      );
      // Reset text color for next page
      doc.setTextColor(0, 0, 0);
    }
    
    // Save the PDF
    doc.save(`analise-5-porques-${formData.title.replace(/\s+/g, '-')}.pdf`);
  };

  return (
    <div className="bg-white rounded-lg shadow-lg p-6">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h3 className="text-xl font-bold">
            {nonConformity?.id === 'new' || !nonConformity
              ? 'Nova Não Conformidade'
              : 'Editar Não Conformidade'}
          </h3>
          {order && (
            <p className="text-gray-600">
              Pedido #{order.orderNumber} - {order.customer}
            </p>
          )}
        </div>
        <div className="flex space-x-3">
          {formData.id !== 'new' && (
            <button
              onClick={handleExportNonConformity}
              className="flex items-center px-3 py-1.5 bg-green-100 text-green-800 rounded-md hover:bg-green-200"
            >
              <Download className="h-4 w-4 mr-1" />
              Exportar NC
            </button>
          )}
          {formData.fiveWhys && (
            <button
              onClick={handleExportFiveWhys}
              className="flex items-center px-3 py-1.5 bg-indigo-100 text-indigo-800 rounded-md hover:bg-indigo-200"
            >
              <Download className="h-4 w-4 mr-1" />
              Exportar 5 Porquês
            </button>
          )}
          <button
            onClick={onCancel}
            className="flex items-center px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50"
          >
            <ChevronLeft className="h-5 w-5 mr-1" />
            Voltar
          </button>
        </div>
      </div>
      
      {/* Five Whys Analysis Tool */}
      {!showFiveWhys && formData.fiveWhys && (
        <div className="mb-6 bg-indigo-50 p-4 rounded-lg border border-indigo-200">
          <div className="flex justify-between items-start">
            <div>
              <h3 className="font-medium text-indigo-700 flex items-center">
                <span className="mr-2">Análise 5 Porquês Aplicada</span>
                <span className="bg-indigo-100 text-indigo-800 text-xs font-semibold px-2.5 py-0.5 rounded">
                  {formData.fiveWhys.whys.length} níveis
                </span>
              </h3>
              <p className="text-indigo-600 text-sm mt-2">
                Uma análise detalhada dos 5 Porquês foi aplicada para identificar a causa raiz deste problema.
              </p>
            </div>
            <div className="flex space-x-2">
              <button
                onClick={() => setShowFiveWhys(true)}
                className="text-indigo-600 hover:text-indigo-800 text-sm"
              >
                Editar Análise
              </button>
            </div>
          </div>
        </div>
      )}
      
      {showFiveWhys ? (
        <FiveWhysForm
          initialData={formData.fiveWhys || { 
            problem: formData.description || '', 
            whys: ['', '', '', '', ''],
            rootCause: formData.rootCause || '',
            correctionPlan: formData.preventiveAction || ''
          }}
          onSave={handleSaveFiveWhys}
          onCancel={() => setShowFiveWhys(false)}
        />
      ) : (
        <div className="mb-6">
          <button
            onClick={() => setShowFiveWhys(true)}
            className="px-4 py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-700 inline-block"
          >
            {formData.fiveWhys ? 'Editar Análise 5 Porquês' : 'Iniciar Análise 5 Porquês'}
          </button>
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Título
            </label>
            <input
              type="text"
              value={formData.title}
              onChange={(e) => setFormData({ ...formData, title: e.target.value })}
              className="w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring focus:ring-blue-200"
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Item Relacionado
            </label>
            <select
              value={formData.itemId}
              onChange={(e) => setFormData({ ...formData, itemId: e.target.value })}
              className="w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring focus:ring-blue-200"
              required
            >
              <option value="">Selecione um item</option>
              {order?.items.map((item) => (
                <option key={item.id} value={item.id}>
                  Item {item.itemNumber}: {item.code} - {item.description}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Severidade
            </label>
            <select
              value={formData.severity}
              onChange={(e) => setFormData({ ...formData, severity: e.target.value as any })}
              className="w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring focus:ring-blue-200"
              required
            >
              <option value="low">Baixa</option>
              <option value="medium">Média</option>
              <option value="high">Alta</option>
              <option value="critical">Crítica</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Status
            </label>
            <select
              value={formData.status}
              onChange={(e) => setFormData({ ...formData, status: e.target.value as any })}
              className="w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring focus:ring-blue-200"
              required
            >
              <option value="open">Aberta</option>
              <option value="in-progress">Em Andamento</option>
              <option value="resolved">Resolvida</option>
              <option value="closed">Fechada</option>
            </select>
          </div>

          <div className="md:col-span-2">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Descrição
            </label>
            <textarea
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              className="w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring focus:ring-blue-200"
              rows={4}
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Responsável pela Correção
            </label>
            <input
              type="email"
              value={formData.assignedTo || ''}
              onChange={(e) => setFormData({ ...formData, assignedTo: e.target.value })}
              className="w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring focus:ring-blue-200"
              placeholder="email@exemplo.com"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Criador
            </label>
            <input
              type="email"
              value={formData.createdBy}
              onChange={(e) => setFormData({ ...formData, createdBy: e.target.value })}
              className="w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring focus:ring-blue-200"
              placeholder="email@exemplo.com"
              required
            />
          </div>
        </div>

        <div className="space-y-4">
          <div className="flex items-center">
            <input
              type="checkbox"
              id="followUpRequired"
              checked={formData.followUpRequired}
              onChange={(e) => setFormData({ ...formData, followUpRequired: e.target.checked })}
              className="h-4 w-4 text-blue-600 rounded focus:ring-blue-500"
            />
            <label htmlFor="followUpRequired" className="ml-2 text-sm text-gray-700">
              Requer acompanhamento posterior
            </label>
          </div>

          {formData.followUpRequired && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Data de acompanhamento
              </label>
              <input
                type="date"
                value={formData.followUpDate ? formData.followUpDate.split('T')[0] : ''}
                onChange={(e) => setFormData({ ...formData, followUpDate: e.target.value })}
                className="w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring focus:ring-blue-200"
              />
            </div>
          )}
        </div>

        {(formData.status === 'resolved' || formData.status === 'closed') && (
          <div className="space-y-4 p-4 border rounded-lg bg-green-50">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Quem resolveu
              </label>
              <input
                type="email"
                value={formData.resolvedBy || ''}
                onChange={(e) => setFormData({ ...formData, resolvedBy: e.target.value })}
                className="w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring focus:ring-blue-200"
                placeholder="email@exemplo.com"
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Descrição da solução
              </label>
              <textarea
                value={formData.resolutionDescription || ''}
                onChange={(e) => setFormData({ ...formData, resolutionDescription: e.target.value })}
                className="w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring focus:ring-blue-200"
                rows={3}
                required
              />
            </div>
          </div>
        )}

        <div className="space-y-4 p-4 border rounded-lg">
          <h4 className="font-medium">Análise de Causa</h4>
          
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Causa Raiz
            </label>
            <textarea
              value={formData.rootCause || ''}
              onChange={(e) => setFormData({ ...formData, rootCause: e.target.value })}
              className="w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring focus:ring-blue-200"
              rows={2}
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Ação Preventiva
            </label>
            <textarea
              value={formData.preventiveAction || ''}
              onChange={(e) => setFormData({ ...formData, preventiveAction: e.target.value })}
              className="w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring focus:ring-blue-200"
              rows={2}
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Impacto Financeiro (R$)
            </label>
            <input
              type="number"
              value={formData.costImpact || 0}
              onChange={(e) => setFormData({ ...formData, costImpact: parseFloat(e.target.value) })}
              className="w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring focus:ring-blue-200"
              min="0"
              step="0.01"
            />
          </div>
        </div>

        <div className="space-y-4 p-4 border rounded-lg">
          <h4 className="font-medium">Áreas Impactadas</h4>
          
          <div className="flex space-x-2">
            <input
              type="text"
              value={newImpactedArea}
              onChange={(e) => setNewImpactedArea(e.target.value)}
              className="flex-1 rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring focus:ring-blue-200"
              placeholder="Ex: Produção, Qualidade, etc."
            />
            <button
              type="button"
              onClick={handleAddImpactedArea}
              className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
            >
              <Plus className="h-5 w-5" />
            </button>
          </div>
          
          <div className="flex flex-wrap gap-2 mt-2">
            {formData.impactedAreas?.map((area, index) => (
              <div 
                key={index}
                className="flex items-center bg-gray-100 px-3 py-1 rounded-full"
              >
                <span className="text-sm">{area}</span>
                <button
                  type="button"
                  onClick={() => handleRemoveImpactedArea(index)}
                  className="ml-2 text-gray-500 hover:text-red-500"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            ))}
          </div>
        </div>

        <div className="flex justify-end space-x-4">
          <button
            type="button"
            onClick={onCancel}
            className="px-4 py-2 border border-gray-300 rounded-md hover:bg-gray-50"
          >
            Cancelar
          </button>
          <button
            type="submit"
            className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
          >
            Salvar
          </button>
        </div>
      </form>
    </div>
  );
};

export default NonConformityForm;