import React, { useState } from 'react';
import { ChevronDown, ChevronUp, X, HelpCircle, PlusCircle, Trash2, Download } from 'lucide-react';
import { jsPDF } from 'jspdf';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { useSettingsStore } from '../store/settingsStore';

export interface FiveWhyAnalysis {
  problem: string;
  whys: string[];
  rootCause: string;
  correctionPlan: string;
}

interface FiveWhysFormProps {
  initialData?: FiveWhyAnalysis;
  onSave: (data: FiveWhyAnalysis) => void;
  onCancel: () => void;
}

const FiveWhysForm: React.FC<FiveWhysFormProps> = ({ initialData, onSave, onCancel }) => {
  const { companyLogo, companyName } = useSettingsStore();
  const [formData, setFormData] = useState<FiveWhyAnalysis>(initialData || {
    problem: '',
    whys: ['', '', '', '', ''],
    rootCause: '',
    correctionPlan: ''
  });
  
  const [isExpanded, setIsExpanded] = useState(true);
  
  const handleWhyChange = (index: number, value: string) => {
    const newWhys = [...formData.whys];
    newWhys[index] = value;
    setFormData({ ...formData, whys: newWhys });
  };
  
  const addWhy = () => {
    if (formData.whys.length < 10) {
      setFormData({ ...formData, whys: [...formData.whys, ''] });
    }
  };
  
  const removeWhy = (index: number) => {
    if (formData.whys.length <= 1) return;
    
    const newWhys = [...formData.whys];
    newWhys.splice(index, 1);
    setFormData({ ...formData, whys: newWhys });
  };
  
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    // Filter out empty whys before saving
    const filteredWhys = formData.whys.filter(why => why.trim() !== '');
    onSave({
      ...formData,
      whys: filteredWhys
    });
  };
  
  const handleExportPDF = () => {
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
    
    // Add company name if available
    if (companyName) {
      doc.setFontSize(14);
      doc.setFont(undefined, 'normal');
      doc.text(companyName, 105, y, { align: 'center' });
      y += 10;
    }
    
    // Add date
    doc.setFontSize(12);
    doc.setFont(undefined, 'normal');
    doc.text(`Data: ${format(new Date(), 'dd/MM/yyyy', { locale: ptBR })}`, 15, y);
    y += 15;
    
    // Section 1: Problem
    doc.setFontSize(14);
    doc.setFont(undefined, 'bold');
    doc.text('1. PROBLEMA IDENTIFICADO', 15, y);
    y += 10;
    
    doc.setFontSize(11);
    doc.setFont(undefined, 'normal');
    const problemLines = doc.splitTextToSize(formData.problem, 180);
    doc.text(problemLines, 15, y);
    y += problemLines.length * 7 + 10;
    
    // Section 2: Five Whys
    doc.setFontSize(14);
    doc.setFont(undefined, 'bold');
    doc.text('2. ANÁLISE 5 PORQUÊS', 15, y);
    y += 10;
    
    const filteredWhys = formData.whys.filter(why => why.trim() !== '');
    
    filteredWhys.forEach((why, index) => {
      doc.setFontSize(12);
      doc.setFont(undefined, 'bold');
      doc.text(`Por quê ${index + 1}:`, 15, y);
      y += 7;
      
      doc.setFontSize(11);
      doc.setFont(undefined, 'normal');
      const whyLines = doc.splitTextToSize(why, 180);
      doc.text(whyLines, 15, y);
      y += whyLines.length * 7 + 5;
      
      // Draw arrow if not the last why
      if (index < filteredWhys.length - 1) {
        doc.setDrawColor(100, 100, 100);
        doc.line(25, y - 2, 25, y + 5); // Vertical line
        doc.line(25, y + 5, 30, y + 5); // Horizontal line
        doc.line(27, y + 3, 30, y + 5); // Arrow head top
        doc.line(27, y + 7, 30, y + 5); // Arrow head bottom
        y += 10;
      }
    });
    
    y += 5;
    
    // Section 3: Root Cause
    doc.setFontSize(14);
    doc.setFont(undefined, 'bold');
    doc.text('3. CAUSA RAIZ IDENTIFICADA', 15, y);
    y += 10;
    
    doc.setFontSize(11);
    doc.setFont(undefined, 'normal');
    const rootCauseLines = doc.splitTextToSize(formData.rootCause, 180);
    doc.text(rootCauseLines, 15, y);
    y += rootCauseLines.length * 7 + 10;
    
    // Section 4: Correction Plan
    doc.setFontSize(14);
    doc.setFont(undefined, 'bold');
    doc.text('4. PLANO DE AÇÃO CORRETIVA', 15, y);
    y += 10;
    
    doc.setFontSize(11);
    doc.setFont(undefined, 'normal');
    const planLines = doc.splitTextToSize(formData.correctionPlan, 180);
    doc.text(planLines, 15, y);
    
    // Add footer with page numbers
    const pageCount = doc.getNumberOfPages();
    for (let i = 1; i <= pageCount; i++) {
      doc.setPage(i);
      doc.setFontSize(8);
      doc.setTextColor(100, 100, 100);
      doc.text(
        `Gerado em ${format(new Date(), 'dd/MM/yyyy HH:mm', { locale: ptBR })} - Página ${i} de ${pageCount}`,
        105, 
        285, 
        { align: 'center' }
      );
      // Reset text color
      doc.setTextColor(0, 0, 0);
    }
    
    // Save the PDF
    doc.save(`analise-5-porques-${new Date().toISOString().split('T')[0]}.pdf`);
  };
  
  return (
    <div className="bg-white rounded-lg shadow-md border border-gray-200 overflow-hidden">
      <div className="bg-gradient-to-r from-indigo-500 to-indigo-600 px-4 py-4 flex justify-between items-center">
        <h3 className="text-lg font-bold text-white flex items-center">
          <HelpCircle className="h-5 w-5 mr-2" />
          Análise 5 Porquês
        </h3>
        <div className="flex space-x-2">
          <button 
            onClick={handleExportPDF}
            className="text-white bg-indigo-700 hover:bg-indigo-800 rounded-md px-3 py-1 text-sm flex items-center"
          >
            <Download className="h-4 w-4 mr-1" />
            Exportar PDF
          </button>
          <button 
            onClick={() => setIsExpanded(!isExpanded)} 
            className="text-white hover:text-gray-200"
          >
            {isExpanded ? <ChevronUp className="h-5 w-5" /> : <ChevronDown className="h-5 w-5" />}
          </button>
        </div>
      </div>
      
      {isExpanded && (
        <form onSubmit={handleSubmit} className="p-4">
          <div className="p-3 bg-indigo-50 rounded-lg border border-indigo-100 mb-4 text-sm text-indigo-700">
            <p className="font-medium mb-1">O que é o método 5 Porquês?</p>
            <p>
              Técnica iterativa que busca a causa raiz de um problema perguntando "Por quê?" repetidamente. 
              A cada resposta, pergunta-se "Por quê?" novamente, aprofundando a análise para identificar a causa raiz e não apenas os sintomas.
            </p>
          </div>
          
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Problema ou Não Conformidade
              </label>
              <textarea
                value={formData.problem}
                onChange={e => setFormData({ ...formData, problem: e.target.value })}
                className="w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring focus:ring-indigo-200"
                rows={2}
                placeholder="Descreva claramente o problema ou não conformidade"
                required
              />
            </div>
            
            <div className="space-y-3">
              <div className="flex justify-between items-center">
                <label className="block text-sm font-medium text-gray-700">
                  Perguntas "Por quê?"
                </label>
                <button 
                  type="button" 
                  onClick={addWhy}
                  className="text-indigo-600 hover:text-indigo-800 text-sm flex items-center"
                  disabled={formData.whys.length >= 10}
                >
                  <PlusCircle className="h-4 w-4 mr-1" />
                  Adicionar pergunta
                </button>
              </div>
              
              {formData.whys.map((why, index) => (
                <div key={index} className="flex items-start space-x-2">
                  <div className="flex-1">
                    <div className="flex items-center">
                      <span className="inline-flex items-center justify-center h-6 w-6 rounded-full bg-indigo-100 text-indigo-800 font-medium text-sm mr-2">
                        {index + 1}
                      </span>
                      <label className="text-sm font-medium text-gray-700">
                        Por quê?
                      </label>
                    </div>
                    <div className="mt-1 relative">
                      <textarea
                        value={why}
                        onChange={e => handleWhyChange(index, e.target.value)}
                        className="w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring focus:ring-indigo-200"
                        rows={2}
                        placeholder={`Por que ${index === 0 ? 'o problema ocorreu' : 'isso aconteceu'}?`}
                      />
                      {formData.whys.length > 1 && (
                        <button
                          type="button"
                          onClick={() => removeWhy(index)}
                          className="absolute right-2 top-2 text-red-600 hover:text-red-800"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
            
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Causa Raiz
              </label>
              <textarea
                value={formData.rootCause}
                onChange={e => setFormData({ ...formData, rootCause: e.target.value })}
                className="w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring focus:ring-indigo-200"
                rows={2}
                placeholder="Identifique a causa raiz identificada após a análise dos 5 porquês"
                required
              />
            </div>
            
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Plano de Ação Corretiva
              </label>
              <textarea
                value={formData.correctionPlan}
                onChange={e => setFormData({ ...formData, correctionPlan: e.target.value })}
                className="w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring focus:ring-indigo-200"
                rows={3}
                placeholder="Descreva as ações a serem tomadas para corrigir a causa raiz identificada"
                required
              />
            </div>
          </div>
          
          <div className="flex justify-end space-x-3 mt-6">
            <button
              type="button"
              onClick={onCancel}
              className="px-4 py-2 border border-gray-300 rounded-md hover:bg-gray-50 text-sm"
            >
              Cancelar
            </button>
            <button
              type="submit"
              className="px-4 py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-700 text-sm"
            >
              Salvar Análise
            </button>
          </div>
        </form>
      )}
    </div>
  );
};

export default FiveWhysForm;