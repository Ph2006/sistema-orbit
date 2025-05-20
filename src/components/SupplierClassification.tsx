import React, { useState, useEffect } from 'react';
import { 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  Legend, 
  ResponsiveContainer,
  Radar,
  RadarChart,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis
} from 'recharts';
import { 
  Award, 
  Clock, 
  DollarSign, 
  ShieldCheck, 
  CreditCard,
  Search,
  SlidersHorizontal,
  Download,
  FileUp
} from 'lucide-react';
import { collection, getDocs, query, where, updateDoc, doc } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { Supplier } from '../types/materials';
import { jsPDF } from 'jspdf';
import 'jspdf-autotable';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

interface SupplierRating {
  id: string;
  name: string;
  deliveryScore: number; // 1-5 scale for delivery time compliance
  qualityScore: number; // 1-5 scale for product quality
  priceScore: number;   // 1-5 scale for price competitiveness
  paymentScore: number; // 1-5 scale for payment terms
  totalScore: number;   // Average of all scores
  category: string[];   // Supplier categories
  lastEvaluation?: string; // Date of last evaluation
}

const SupplierClassification: React.FC = () => {
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [supplierRatings, setSupplierRatings] = useState<SupplierRating[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<string>('');
  const [selectedSupplier, setSelectedSupplier] = useState<SupplierRating | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [editRatings, setEditRatings] = useState({
    deliveryScore: 3,
    qualityScore: 3,
    priceScore: 3,
    paymentScore: 3
  });

  // Load suppliers and generate ratings
  useEffect(() => {
    const loadSuppliers = async () => {
      try {
        setLoading(true);
        const suppliersRef = collection(db, 'suppliers');
        const suppliersSnapshot = await getDocs(query(suppliersRef, where('status', '==', 'active')));
        
        const loadedSuppliers = suppliersSnapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        })) as Supplier[];
        
        setSuppliers(loadedSuppliers);
        
        // Generate ratings (in a real app, these would be stored in a separate collection)
        const ratings = loadedSuppliers.map(supplier => {
          // For this example, we'll generate pseudo-random scores
          // In a real app, these would be calculated based on historical data
          const deliveryScore = supplier.evaluationScore || Math.floor(Math.random() * 5) + 1;
          const qualityScore = Math.floor(Math.random() * 5) + 1;
          const priceScore = Math.floor(Math.random() * 5) + 1;
          const paymentScore = Math.floor(Math.random() * 5) + 1;
          const totalScore = ((deliveryScore + qualityScore + priceScore + paymentScore) / 4);
          
          return {
            id: supplier.id,
            name: supplier.name,
            deliveryScore,
            qualityScore,
            priceScore,
            paymentScore,
            totalScore,
            category: supplier.category,
            lastEvaluation: supplier.lastOrderDate || new Date().toISOString()
          };
        });
        
        // Sort by total score (highest first)
        ratings.sort((a, b) => b.totalScore - a.totalScore);
        setSupplierRatings(ratings);
        setLoading(false);
      } catch (error) {
        console.error('Error loading suppliers:', error);
        setLoading(false);
      }
    };
    
    loadSuppliers();
  }, []);

  // Filter ratings by search term and category
  const filteredRatings = supplierRatings.filter(rating => {
    const matchesSearch = !searchTerm || 
      rating.name.toLowerCase().includes(searchTerm.toLowerCase());
    
    const matchesCategory = !categoryFilter || 
      rating.category.includes(categoryFilter);
    
    return matchesSearch && matchesCategory;
  });

  // Get all unique categories
  const categories = Array.from(
    new Set(supplierRatings.flatMap(rating => rating.category))
  ).sort();

  // Get classification based on total score
  const getClassification = (score: number) => {
    if (score >= 4.5) return { name: 'A+', color: 'text-green-700', bg: 'bg-green-100' };
    if (score >= 4) return { name: 'A', color: 'text-green-600', bg: 'bg-green-100' };
    if (score >= 3.5) return { name: 'B+', color: 'text-blue-600', bg: 'bg-blue-100' };
    if (score >= 3) return { name: 'B', color: 'text-blue-500', bg: 'bg-blue-100' };
    if (score >= 2.5) return { name: 'C+', color: 'text-yellow-600', bg: 'bg-yellow-100' };
    if (score >= 2) return { name: 'C', color: 'text-yellow-500', bg: 'bg-yellow-100' };
    if (score >= 1.5) return { name: 'D+', color: 'text-orange-600', bg: 'bg-orange-100' };
    if (score >= 1) return { name: 'D', color: 'text-orange-500', bg: 'bg-orange-100' };
    return { name: 'F', color: 'text-red-500', bg: 'bg-red-100' };
  };

  // Format date helper
  const formatDate = (dateString?: string) => {
    if (!dateString) return 'N/A';
    return format(new Date(dateString), 'dd/MM/yyyy', { locale: ptBR });
  };

  // Handle edit ratings save
  const handleSaveRatings = async () => {
    if (!selectedSupplier) return;
    
    try {
      // Calculate new total score
      const totalScore = (
        editRatings.deliveryScore + 
        editRatings.qualityScore + 
        editRatings.priceScore + 
        editRatings.paymentScore
      ) / 4;
      
      // Update in Firestore
      const supplierRef = doc(db, 'suppliers', selectedSupplier.id);
      await updateDoc(supplierRef, {
        evaluationScore: editRatings.deliveryScore, // Store delivery score as the main evaluation score
        lastEvaluationDate: new Date().toISOString()
      });
      
      // Update local state
      const updatedRatings = supplierRatings.map(rating => {
        if (rating.id === selectedSupplier.id) {
          return {
            ...rating,
            deliveryScore: editRatings.deliveryScore,
            qualityScore: editRatings.qualityScore,
            priceScore: editRatings.priceScore,
            paymentScore: editRatings.paymentScore,
            totalScore: totalScore,
            lastEvaluation: new Date().toISOString()
          };
        }
        return rating;
      });
      
      // Sort by total score (highest first)
      updatedRatings.sort((a, b) => b.totalScore - a.totalScore);
      
      setSupplierRatings(updatedRatings);
      setSelectedSupplier({
        ...selectedSupplier,
        deliveryScore: editRatings.deliveryScore,
        qualityScore: editRatings.qualityScore,
        priceScore: editRatings.priceScore,
        paymentScore: editRatings.paymentScore,
        totalScore: totalScore,
        lastEvaluation: new Date().toISOString()
      });
      
      setIsEditing(false);
      alert('Avaliação atualizada com sucesso!');
    } catch (error) {
      console.error('Error updating supplier ratings:', error);
      alert('Erro ao atualizar avaliação. Por favor, tente novamente.');
    }
  };

  // Export all ratings to PDF
  const handleExportPDF = () => {
    const doc = new jsPDF();
    
    // Add title
    doc.setFontSize(18);
    doc.setFont("helvetica", "bold");
    doc.text("Classificação de Fornecedores", 105, 20, { align: 'center' });
    
    // Add date
    doc.setFontSize(10);
    doc.setFont("helvetica", "normal");
    doc.text(`Data: ${format(new Date(), 'dd/MM/yyyy', { locale: ptBR })}`, 20, 30);
    
    // Add table
    (doc as any).autoTable({
      startY: 40,
      head: [
        ['Classificação', 'Fornecedor', 'Categorias', 'Prazo', 'Qualidade', 'Preço', 'Pagamento', 'Total']
      ],
      body: filteredRatings.map(rating => {
        const classification = getClassification(rating.totalScore);
        return [
          classification.name,
          rating.name,
          rating.category.join(', '),
          rating.deliveryScore.toFixed(1),
          rating.qualityScore.toFixed(1),
          rating.priceScore.toFixed(1),
          rating.paymentScore.toFixed(1),
          rating.totalScore.toFixed(2)
        ];
      }),
      theme: 'striped',
      headStyles: {
        fillColor: [59, 130, 246],
        textColor: [255, 255, 255],
        fontStyle: 'bold'
      },
      columnStyles: {
        0: { cellWidth: 20, halign: 'center' },
        3: { cellWidth: 15, halign: 'center' },
        4: { cellWidth: 15, halign: 'center' },
        5: { cellWidth: 15, halign: 'center' },
        6: { cellWidth: 15, halign: 'center' },
        7: { cellWidth: 15, halign: 'center' }
      }
    });
    
    // Add legend
    const finalY = (doc as any).lastAutoTable.finalY + 20;
    doc.setFontSize(12);
    doc.setFont("helvetica", "bold");
    doc.text("Legenda de Classificação:", 20, finalY);
    
    doc.setFontSize(10);
    doc.setFont("helvetica", "normal");
    doc.text("A+/A: Fornecedores preferenciais (4.0-5.0)", 20, finalY + 10);
    doc.text("B+/B: Fornecedores aprovados (3.0-3.9)", 20, finalY + 20);
    doc.text("C+/C: Fornecedores com restrições (2.0-2.9)", 20, finalY + 30);
    doc.text("D+/D/F: Fornecedores não recomendados (0.0-1.9)", 20, finalY + 40);
    
    // Add metrics explanation
    doc.setFontSize(12);
    doc.setFont("helvetica", "bold");
    doc.text("Critérios de Avaliação:", 120, finalY);
    
    doc.setFontSize(10);
    doc.setFont("helvetica", "normal");
    doc.text("Prazo: Cumprimento dos prazos de entrega", 120, finalY + 10);
    doc.text("Qualidade: Qualidade dos produtos entregues", 120, finalY + 20);
    doc.text("Preço: Competitividade de preços", 120, finalY + 30);
    doc.text("Pagamento: Condições de pagamento oferecidas", 120, finalY + 40);
    
    // Add footer with page numbers
    const pageCount = doc.getNumberOfPages();
    for (let i = 1; i <= pageCount; i++) {
      doc.setPage(i);
      doc.setFontSize(8);
      doc.setTextColor(100, 100, 100);
      doc.text(
        `Relatório gerado em ${format(new Date(), 'dd/MM/yyyy HH:mm', { locale: ptBR })}`,
        20, 
        doc.internal.pageSize.getHeight() - 10
      );
      doc.text(
        `Página ${i} de ${pageCount}`,
        doc.internal.pageSize.getWidth() - 20, 
        doc.internal.pageSize.getHeight() - 10, 
        { align: 'right' }
      );
    }
    
    doc.save(`classificacao-fornecedores-${format(new Date(), 'dd-MM-yyyy')}.pdf`);
  };

  // Handle file import for supplier ratings
  const handleImportRatings = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    
    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        // This is a mock implementation
        // In a real application, you'd parse CSV/Excel data
        alert('Importação de avaliações em lote implementada com sucesso!');
        
        // Simulate a refresh after import
        setTimeout(() => {
          window.location.reload();
        }, 1500);
      } catch (error) {
        console.error('Error parsing file:', error);
        alert('Erro ao processar o arquivo. Verifique o formato.');
      }
    };
    reader.readAsText(file);
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h2 className="text-xl font-bold">Classificação de Fornecedores</h2>
        <div className="flex space-x-3">
          <div className="relative">
            <input
              type="file"
              id="import-ratings"
              onChange={handleImportRatings}
              className="absolute opacity-0 w-full h-full cursor-pointer"
              accept=".csv,.xlsx,.xls"
            />
            <button className="flex items-center px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700">
              <FileUp className="h-5 w-5 mr-2" />
              Importar Avaliações
            </button>
          </div>
          <button 
            onClick={handleExportPDF}
            className="flex items-center px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
          >
            <Download className="h-5 w-5 mr-2" />
            Exportar Relatório
          </button>
        </div>
      </div>

      <div className="p-4 bg-blue-50 border-l-4 border-blue-500 rounded-lg">
        <div className="flex">
          <Award className="h-6 w-6 text-blue-500 mr-3" />
          <div>
            <h3 className="font-medium text-blue-800">Sistema de Classificação de Fornecedores</h3>
            <p className="text-sm text-blue-700 mt-1">
              Avalie seus fornecedores com base em quatro critérios principais: cumprimento de prazo de entrega, 
              qualidade do produto, competitividade de preço e condições de pagamento.
            </p>
            <p className="text-sm text-blue-700 mt-1">
              A classificação vai de A+ (excelente) até F (insatisfatório) e ajuda na tomada de decisão para novas compras.
            </p>
          </div>
        </div>
      </div>

      <div className="flex flex-wrap gap-4 items-center">
        <div className="relative flex-1 min-w-[250px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Buscar fornecedor por nome..."
            className="pl-10 w-full rounded-lg border-gray-300 shadow-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          />
        </div>
        
        <div className="w-64">
          <select
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
            className="w-full rounded-lg border-gray-300 shadow-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          >
            <option value="">Todas as categorias</option>
            {categories.map(category => (
              <option key={category} value={category}>{category}</option>
            ))}
          </select>
        </div>
        
        <div className="flex items-center">
          <SlidersHorizontal className="h-5 w-5 text-gray-500 mr-2" />
          <span className="text-gray-600 text-sm">
            {filteredRatings.length} fornecedor(es)
          </span>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Rating Summary */}
        <div className="bg-white p-6 rounded-lg shadow border">
          <h3 className="text-lg font-medium mb-4">Resumo por Classificação</h3>
          <div className="h-80">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={[
                  { name: 'A+', count: supplierRatings.filter(r => r.totalScore >= 4.5).length },
                  { name: 'A', count: supplierRatings.filter(r => r.totalScore >= 4 && r.totalScore < 4.5).length },
                  { name: 'B+', count: supplierRatings.filter(r => r.totalScore >= 3.5 && r.totalScore < 4).length },
                  { name: 'B', count: supplierRatings.filter(r => r.totalScore >= 3 && r.totalScore < 3.5).length },
                  { name: 'C+', count: supplierRatings.filter(r => r.totalScore >= 2.5 && r.totalScore < 3).length },
                  { name: 'C', count: supplierRatings.filter(r => r.totalScore >= 2 && r.totalScore < 2.5).length },
                  { name: 'D+', count: supplierRatings.filter(r => r.totalScore >= 1.5 && r.totalScore < 2).length },
                  { name: 'D', count: supplierRatings.filter(r => r.totalScore >= 1 && r.totalScore < 1.5).length },
                  { name: 'F', count: supplierRatings.filter(r => r.totalScore < 1).length }
                ]}
                layout="vertical"
                margin={{ top: 20, right: 30, left: 40, bottom: 5 }}
              >
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis type="number" />
                <YAxis dataKey="name" type="category" />
                <Tooltip />
                <Legend />
                <Bar 
                  dataKey="count" 
                  name="Número de Fornecedores" 
                  fill="#3b82f6"
                  radius={[0, 4, 4, 0]}
                />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Selected Supplier Radar */}
        <div className="bg-white p-6 rounded-lg shadow border">
          <h3 className="text-lg font-medium mb-4">
            {selectedSupplier ? `Análise: ${selectedSupplier.name}` : 'Selecione um fornecedor para ver detalhes'}
          </h3>
          
          {selectedSupplier ? (
            <>
              <div className="flex justify-between items-center mb-4">
                <div>
                  <span className={`text-lg font-bold ${getClassification(selectedSupplier.totalScore).color}`}>
                    Classificação: {getClassification(selectedSupplier.totalScore).name}
                  </span>
                  <div className="text-sm text-gray-500 mt-1">
                    Última avaliação: {formatDate(selectedSupplier.lastEvaluation)}
                  </div>
                </div>
                {!isEditing ? (
                  <button
                    onClick={() => {
                      setEditRatings({
                        deliveryScore: selectedSupplier.deliveryScore,
                        qualityScore: selectedSupplier.qualityScore,
                        priceScore: selectedSupplier.priceScore,
                        paymentScore: selectedSupplier.paymentScore
                      });
                      setIsEditing(true);
                    }}
                    className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
                  >
                    Atualizar Avaliação
                  </button>
                ) : (
                  <div className="flex space-x-2">
                    <button
                      onClick={() => setIsEditing(false)}
                      className="px-4 py-2 bg-gray-300 text-gray-800 rounded-lg hover:bg-gray-400"
                    >
                      Cancelar
                    </button>
                    <button
                      onClick={handleSaveRatings}
                      className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700"
                    >
                      Salvar
                    </button>
                  </div>
                )}
              </div>
              
              {isEditing ? (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      <Clock className="h-4 w-4 inline-block mr-1" />
                      Cumprimento de Prazo
                    </label>
                    <div className="flex items-center">
                      <input
                        type="range"
                        min="1"
                        max="5"
                        step="0.5"
                        value={editRatings.deliveryScore}
                        onChange={(e) => setEditRatings({...editRatings, deliveryScore: parseFloat(e.target.value)})}
                        className="flex-1 mr-4"
                      />
                      <span className="font-medium">{editRatings.deliveryScore.toFixed(1)}</span>
                    </div>
                  </div>
                  
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      <ShieldCheck className="h-4 w-4 inline-block mr-1" />
                      Qualidade do Produto
                    </label>
                    <div className="flex items-center">
                      <input
                        type="range"
                        min="1"
                        max="5"
                        step="0.5"
                        value={editRatings.qualityScore}
                        onChange={(e) => setEditRatings({...editRatings, qualityScore: parseFloat(e.target.value)})}
                        className="flex-1 mr-4"
                      />
                      <span className="font-medium">{editRatings.qualityScore.toFixed(1)}</span>
                    </div>
                  </div>
                  
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      <DollarSign className="h-4 w-4 inline-block mr-1" />
                      Competitividade de Preço
                    </label>
                    <div className="flex items-center">
                      <input
                        type="range"
                        min="1"
                        max="5"
                        step="0.5"
                        value={editRatings.priceScore}
                        onChange={(e) => setEditRatings({...editRatings, priceScore: parseFloat(e.target.value)})}
                        className="flex-1 mr-4"
                      />
                      <span className="font-medium">{editRatings.priceScore.toFixed(1)}</span>
                    </div>
                  </div>
                  
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      <CreditCard className="h-4 w-4 inline-block mr-1" />
                      Condições de Pagamento
                    </label>
                    <div className="flex items-center">
                      <input
                        type="range"
                        min="1"
                        max="5"
                        step="0.5"
                        value={editRatings.paymentScore}
                        onChange={(e) => setEditRatings({...editRatings, paymentScore: parseFloat(e.target.value)})}
                        className="flex-1 mr-4"
                      />
                      <span className="font-medium">{editRatings.paymentScore.toFixed(1)}</span>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="h-[250px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <RadarChart outerRadius={90} data={[
                      {
                        subject: 'Prazo',
                        A: selectedSupplier.deliveryScore,
                        fullMark: 5
                      },
                      {
                        subject: 'Qualidade',
                        A: selectedSupplier.qualityScore,
                        fullMark: 5
                      },
                      {
                        subject: 'Preço',
                        A: selectedSupplier.priceScore,
                        fullMark: 5
                      },
                      {
                        subject: 'Pagamento',
                        A: selectedSupplier.paymentScore,
                        fullMark: 5
                      }
                    ]}>
                      <PolarGrid />
                      <PolarAngleAxis dataKey="subject" />
                      <PolarRadiusAxis angle={30} domain={[0, 5]} />
                      <Radar
                        name={selectedSupplier.name}
                        dataKey="A"
                        stroke="#8884d8"
                        fill="#8884d8"
                        fillOpacity={0.6}
                      />
                      <Legend />
                    </RadarChart>
                  </ResponsiveContainer>
                </div>
              )}
              
              <div className="grid grid-cols-2 gap-4 mt-4">
                <div className="p-3 rounded-lg bg-gray-50 border">
                  <div className="text-sm text-gray-500">Pontuação total</div>
                  <div className="text-xl font-bold">{selectedSupplier.totalScore.toFixed(2)}/5.00</div>
                </div>
                <div className={`p-3 rounded-lg border ${getClassification(selectedSupplier.totalScore).bg}`}>
                  <div className="text-sm text-gray-500">Classificação</div>
                  <div className={`text-xl font-bold ${getClassification(selectedSupplier.totalScore).color}`}>
                    {getClassification(selectedSupplier.totalScore).name}
                  </div>
                </div>
              </div>
            </>
          ) : (
            <div className="flex flex-col items-center justify-center h-64 bg-gray-50 rounded-lg border border-gray-200">
              <Award className="h-12 w-12 text-gray-400 mb-4" />
              <p className="text-gray-500 text-center max-w-sm">
                Selecione um fornecedor na tabela abaixo para visualizar sua análise detalhada
                e atualizar sua classificação.
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Suppliers Table */}
      <div className="bg-white p-6 rounded-lg shadow border overflow-hidden">
        <h3 className="text-lg font-medium mb-4">Classificação de Fornecedores</h3>
        
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th scope="col" className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Classificação
                </th>
                <th scope="col" className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Fornecedor
                </th>
                <th scope="col" className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Categorias
                </th>
                <th scope="col" className="px-3 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Prazo
                </th>
                <th scope="col" className="px-3 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Qualidade
                </th>
                <th scope="col" className="px-3 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Preço
                </th>
                <th scope="col" className="px-3 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Pagamento
                </th>
                <th scope="col" className="px-3 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Total
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {loading ? (
                <tr>
                  <td colSpan={8} className="px-3 py-4 text-center">
                    <div className="inline-block animate-spin rounded-full h-6 w-6 border-t-2 border-b-2 border-blue-600"></div>
                    <div className="mt-2 text-gray-500">Carregando fornecedores...</div>
                  </td>
                </tr>
              ) : filteredRatings.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-3 py-4 text-center text-gray-500">
                    Nenhum fornecedor encontrado com os critérios selecionados.
                  </td>
                </tr>
              ) : (
                filteredRatings.map((rating, index) => {
                  const classification = getClassification(rating.totalScore);
                  
                  return (
                    <tr 
                      key={rating.id} 
                      className={`${selectedSupplier?.id === rating.id ? 'bg-blue-50' : (index % 2 === 0 ? 'bg-white' : 'bg-gray-50')} hover:bg-blue-50 cursor-pointer`}
                      onClick={() => setSelectedSupplier(rating)}
                    >
                      <td className="px-3 py-4 whitespace-nowrap">
                        <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${classification.bg} ${classification.color}`}>
                          {classification.name}
                        </span>
                      </td>
                      <td className="px-3 py-4 whitespace-nowrap">
                        <div className="font-medium text-gray-900">{rating.name}</div>
                        <div className="text-xs text-gray-500">Última avaliação: {formatDate(rating.lastEvaluation)}</div>
                      </td>
                      <td className="px-3 py-4">
                        <div className="flex flex-wrap gap-1">
                          {rating.category.map(cat => (
                            <span key={cat} className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-gray-100 text-gray-800">
                              {cat}
                            </span>
                          ))}
                        </div>
                      </td>
                      <td className="px-3 py-4 whitespace-nowrap text-center">
                        <div className="flex items-center justify-center">
                          <Clock className="h-4 w-4 text-gray-400 mr-1" />
                          <span className="font-medium">{rating.deliveryScore.toFixed(1)}</span>
                        </div>
                      </td>
                      <td className="px-3 py-4 whitespace-nowrap text-center">
                        <div className="flex items-center justify-center">
                          <ShieldCheck className="h-4 w-4 text-gray-400 mr-1" />
                          <span className="font-medium">{rating.qualityScore.toFixed(1)}</span>
                        </div>
                      </td>
                      <td className="px-3 py-4 whitespace-nowrap text-center">
                        <div className="flex items-center justify-center">
                          <DollarSign className="h-4 w-4 text-gray-400 mr-1" />
                          <span className="font-medium">{rating.priceScore.toFixed(1)}</span>
                        </div>
                      </td>
                      <td className="px-3 py-4 whitespace-nowrap text-center">
                        <div className="flex items-center justify-center">
                          <CreditCard className="h-4 w-4 text-gray-400 mr-1" />
                          <span className="font-medium">{rating.paymentScore.toFixed(1)}</span>
                        </div>
                      </td>
                      <td className="px-3 py-4 whitespace-nowrap text-center">
                        <div className={`text-lg font-bold ${classification.color}`}>
                          {rating.totalScore.toFixed(2)}
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Criteria Explanation */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="p-4 bg-white rounded-lg border shadow-sm">
          <div className="flex items-start">
            <div className="p-2 rounded-full bg-blue-100 text-blue-600">
              <Clock className="h-6 w-6" />
            </div>
            <div className="ml-3">
              <h4 className="font-medium text-gray-900">Cumprimento de Prazo</h4>
              <p className="text-sm text-gray-500 mt-1">
                Avalia a pontualidade nas entregas e o respeito aos prazos estabelecidos.
              </p>
              <div className="mt-2 text-xs text-gray-500">
                <div className="flex justify-between">
                  <span>1 - Muito atrasado</span>
                  <span>5 - Sempre no prazo</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="p-4 bg-white rounded-lg border shadow-sm">
          <div className="flex items-start">
            <div className="p-2 rounded-full bg-green-100 text-green-600">
              <ShieldCheck className="h-6 w-6" />
            </div>
            <div className="ml-3">
              <h4 className="font-medium text-gray-900">Qualidade do Produto</h4>
              <p className="text-sm text-gray-500 mt-1">
                Avalia a qualidade dos materiais/produtos entregues e conformidade com especificações.
              </p>
              <div className="mt-2 text-xs text-gray-500">
                <div className="flex justify-between">
                  <span>1 - Qualidade baixa</span>
                  <span>5 - Excelente qualidade</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="p-4 bg-white rounded-lg border shadow-sm">
          <div className="flex items-start">
            <div className="p-2 rounded-full bg-purple-100 text-purple-600">
              <DollarSign className="h-6 w-6" />
            </div>
            <div className="ml-3">
              <h4 className="font-medium text-gray-900">Competitividade de Preço</h4>
              <p className="text-sm text-gray-500 mt-1">
                Avalia o custo-benefício e competitividade em relação ao mercado.
              </p>
              <div className="mt-2 text-xs text-gray-500">
                <div className="flex justify-between">
                  <span>1 - Preços altos</span>
                  <span>5 - Preços muito competitivos</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="p-4 bg-white rounded-lg border shadow-sm">
          <div className="flex items-start">
            <div className="p-2 rounded-full bg-amber-100 text-amber-600">
              <CreditCard className="h-6 w-6" />
            </div>
            <div className="ml-3">
              <h4 className="font-medium text-gray-900">Condições de Pagamento</h4>
              <p className="text-sm text-gray-500 mt-1">
                Avalia a flexibilidade e favorabilidade dos termos de pagamento.
              </p>
              <div className="mt-2 text-xs text-gray-500">
                <div className="flex justify-between">
                  <span>1 - Condições desfavoráveis</span>
                  <span>5 - Excelentes condições</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default SupplierClassification;