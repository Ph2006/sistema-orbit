"use client";

import React, { useState, useEffect, useMemo } from 'react';
import { Download, Lock, Eye, EyeOff, TrendingUp, TrendingDown, DollarSign, FileText, Calculator, Target, AlertTriangle, CheckCircle, Package } from "lucide-react";
import { collection, getDocs } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAuth } from "../layout";
import { format } from "date-fns";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { StatCard } from "@/components/dashboard/stat-card";
import { Separator } from "@/components/ui/separator";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";

// Tipos de dados
interface OrderFinancialData {
  id: string;
  internalOS: string;
  quotationNumber: string;
  customerName: string;
  status: string;
  deliveryDate?: Date;
  
  // Dados de Receita (do orçamento)
  grossRevenue: number;          // Valor bruto total
  taxAmount: number;             // Valor total de impostos
  netRevenue: number;            // Valor líquido (sem impostos)
  
  // Dados de Custos
  materialCosts: number;         // Custos de materiais
  laborCosts: number;           // Custos de mão de obra
  overheadCosts: number;        // Custos gerais/overhead
  totalCosts: number;           // Total de custos
  
  // Indicadores Calculados
  grossProfit: number;          // Lucro bruto (receita líquida - custos)
  grossMargin: number;          // Margem bruta %
  netProfit: number;            // Lucro líquido (após impostos)
  netMargin: number;            // Margem líquida %
  costRatio: number;            // Relação custo/receita %
  taxRatio: number;             // Relação impostos/receita bruta %
  
  // Detalhamento de custos
  costEntries: Array<{
    description: string;
    totalCost: number;
    category: 'material' | 'labor' | 'overhead';
    isFromRequisition: boolean;
  }>;
  
  // Itens do orçamento
  quotationItems: Array<{
    description: string;
    quantity: number;
    unitPrice: number;
    taxRate: number;
    totalWithTax: number;
    totalWithoutTax: number;
  }>;
}

interface FinancialSummary {
  totalOrders: number;
  totalGrossRevenue: number;
  totalNetRevenue: number;
  totalTaxes: number;
  totalCosts: number;
  totalGrossProfit: number;
  totalNetProfit: number;
  averageGrossMargin: number;
  averageNetMargin: number;
  profitableOrders: number;
  unprofitableOrders: number;
}

export default function FinancePage() {
  // Estados de autenticação
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  
  // Estados de dados
  const [orders, setOrders] = useState<any[]>([]);
  const [quotations, setQuotations] = useState<any[]>([]);
  const [financialData, setFinancialData] = useState<OrderFinancialData[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  
  // Estados de filtros
  const [selectedOS, setSelectedOS] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [searchTerm, setSearchTerm] = useState('');
  
  const { user, loading: authLoading } = useAuth();
  const { toast } = useToast();

  // Função para verificar senha
  const handleAuthentication = () => {
    if (password === 'OP4484210640') {
      setIsAuthenticated(true);
      setError('');
    } else {
      setError('Senha incorreta. Tente novamente.');
    }
  };

  // Função para buscar dados das OS
  const fetchOrders = async () => {
    if (!user) return [];
    try {
      const querySnapshot = await getDocs(collection(db, "companies", "mecald", "orders"));
      return querySnapshot.docs
        .filter(doc => !['Concluído', 'Cancelado'].includes(doc.data().status))
        .map(doc => {
          const data = doc.data();
          return {
            id: doc.id,
            internalOS: data.internalOS || 'N/A',
            quotationNumber: data.quotationNumber || '',
            customerName: data.customer?.name || data.customerName || 'Cliente Desconhecido',
            status: data.status || 'Indefinido',
            deliveryDate: data.deliveryDate?.toDate ? data.deliveryDate.toDate() : null,
            costEntries: (data.costEntries || []).map((entry: any) => ({
              ...entry,
              entryDate: entry.entryDate?.toDate ? entry.entryDate.toDate() : null,
            })),
          };
        });
    } catch (error) {
      console.error("Erro ao buscar OS:", error);
      return [];
    }
  };

  // Função para buscar dados dos orçamentos
  const fetchQuotations = async () => {
    if (!user) return [];
    try {
      const querySnapshot = await getDocs(collection(db, "companies", "mecald", "quotations"));
      return querySnapshot.docs.map(doc => {
        const data = doc.data();
        return {
          id: doc.id,
          number: data.number || 0,
          quotationNumber: data.quotationNumber || '',
          customerName: data.customerName || data.customer?.name || 'Cliente Desconhecido',
          status: data.status || 'Indefinido',
          items: (data.items || []).map((item: any) => {
            const quantity = Number(item.quantity) || 0;
            const unitPrice = Number(item.unitPrice) || 0;
            const taxRate = Number(item.taxRate) || 0;
            const totalWithoutTax = quantity * unitPrice;
            const taxAmount = totalWithoutTax * (taxRate / 100);
            const totalWithTax = totalWithoutTax + taxAmount;
            
            return {
              description: item.description || '',
              quantity,
              unitPrice,
              taxRate,
              totalWithoutTax,
              taxAmount,
              totalWithTax,
            };
          }),
        };
      });
    } catch (error) {
      console.error("Erro ao buscar orçamentos:", error);
      return [];
    }
  };

  // Função para processar dados financeiros
  const processFinancialData = (orders: any[], quotations: any[]): OrderFinancialData[] => {
    return orders.map(order => {
      // Encontrar orçamento correspondente pelo número
      const quotation = quotations.find(q => 
        q.quotationNumber === order.quotationNumber ||
        q.number.toString() === order.quotationNumber ||
        q.number.toString() === order.internalOS
      );

      // Calcular receitas do orçamento
      let grossRevenue = 0;
      let taxAmount = 0;
      let netRevenue = 0;
      let quotationItems: any[] = [];

      if (quotation && quotation.items) {
        quotationItems = quotation.items;
        grossRevenue = quotation.items.reduce((sum: number, item: any) => sum + item.totalWithTax, 0);
        taxAmount = quotation.items.reduce((sum: number, item: any) => sum + item.taxAmount, 0);
        netRevenue = quotation.items.reduce((sum: number, item: any) => sum + item.totalWithoutTax, 0);
      }

      // Categorizar custos
      let materialCosts = 0;
      let laborCosts = 0;
      let overheadCosts = 0;
      const costEntries: any[] = [];

      if (order.costEntries) {
        order.costEntries.forEach((entry: any) => {
          const cost = Number(entry.totalCost) || 0;
          let category: 'material' | 'labor' | 'overhead' = 'overhead';
          
          const description = (entry.description || '').toLowerCase();
          
          // Categorização automática baseada na descrição
          if (description.includes('material') || description.includes('requisição') || entry.isFromRequisition) {
            category = 'material';
            materialCosts += cost;
          } else if (description.includes('mão de obra') || description.includes('trabalho') || description.includes('serviço')) {
            category = 'labor';
            laborCosts += cost;
          } else {
            category = 'overhead';
            overheadCosts += cost;
          }
          
          costEntries.push({
            description: entry.description || 'Custo não especificado',
            totalCost: cost,
            category,
            isFromRequisition: entry.isFromRequisition || false,
          });
        });
      }

      const totalCosts = materialCosts + laborCosts + overheadCosts;
      
      // Calcular indicadores financeiros
      const grossProfit = netRevenue - totalCosts;
      const grossMargin = netRevenue > 0 ? (grossProfit / netRevenue) * 100 : 0;
      const netProfit = grossRevenue - taxAmount - totalCosts;
      const netMargin = grossRevenue > 0 ? (netProfit / grossRevenue) * 100 : 0;
      const costRatio = netRevenue > 0 ? (totalCosts / netRevenue) * 100 : 0;
      const taxRatio = grossRevenue > 0 ? (taxAmount / grossRevenue) * 100 : 0;

      return {
        id: order.id,
        internalOS: order.internalOS,
        quotationNumber: order.quotationNumber,
        customerName: order.customerName,
        status: order.status,
        deliveryDate: order.deliveryDate,
        grossRevenue,
        taxAmount,
        netRevenue,
        materialCosts,
        laborCosts,
        overheadCosts,
        totalCosts,
        grossProfit,
        grossMargin,
        netProfit,
        netMargin,
        costRatio,
        taxRatio,
        costEntries,
        quotationItems,
      };
    });
  };

  // Carregar dados
  useEffect(() => {
    const loadData = async () => {
      if (!user || !isAuthenticated) return;
      
      setIsLoading(true);
      try {
        const [ordersData, quotationsData] = await Promise.all([
          fetchOrders(),
          fetchQuotations()
        ]);
        
        setOrders(ordersData);
        setQuotations(quotationsData);
        
        const processedData = processFinancialData(ordersData, quotationsData);
        setFinancialData(processedData);
        
        console.log(`📊 Dados financeiros processados: ${processedData.length} OS analisadas`);
        
      } catch (error) {
        console.error("Erro ao carregar dados:", error);
        toast({
          variant: "destructive",
          title: "Erro ao carregar dados",
          description: "Não foi possível carregar os dados financeiros.",
        });
      } finally {
        setIsLoading(false);
      }
    };

    loadData();
  }, [user, isAuthenticated]);

  // Calcular resumo financeiro
  const financialSummary = useMemo((): FinancialSummary => {
    if (!financialData.length) {
      return {
        totalOrders: 0,
        totalGrossRevenue: 0,
        totalNetRevenue: 0,
        totalTaxes: 0,
        totalCosts: 0,
        totalGrossProfit: 0,
        totalNetProfit: 0,
        averageGrossMargin: 0,
        averageNetMargin: 0,
        profitableOrders: 0,
        unprofitableOrders: 0,
      };
    }

    const summary = financialData.reduce((acc, data) => {
      acc.totalGrossRevenue += data.grossRevenue;
      acc.totalNetRevenue += data.netRevenue;
      acc.totalTaxes += data.taxAmount;
      acc.totalCosts += data.totalCosts;
      acc.totalGrossProfit += data.grossProfit;
      acc.totalNetProfit += data.netProfit;
      
      if (data.grossProfit > 0) acc.profitableOrders++;
      else acc.unprofitableOrders++;
      
      return acc;
    }, {
      totalOrders: financialData.length,
      totalGrossRevenue: 0,
      totalNetRevenue: 0,
      totalTaxes: 0,
      totalCosts: 0,
      totalGrossProfit: 0,
      totalNetProfit: 0,
      profitableOrders: 0,
      unprofitableOrders: 0,
    } as FinancialSummary);

    summary.averageGrossMargin = summary.totalNetRevenue > 0 
      ? (summary.totalGrossProfit / summary.totalNetRevenue) * 100 
      : 0;
    
    summary.averageNetMargin = summary.totalGrossRevenue > 0 
      ? (summary.totalNetProfit / summary.totalGrossRevenue) * 100 
      : 0;

    return summary;
  }, [financialData]);

  // Filtrar dados
  const filteredData = useMemo(() => {
    return financialData.filter(data => {
      const matchesSearch = searchTerm === '' || 
        data.internalOS.toLowerCase().includes(searchTerm.toLowerCase()) ||
        data.customerName.toLowerCase().includes(searchTerm.toLowerCase()) ||
        data.quotationNumber.toLowerCase().includes(searchTerm.toLowerCase());
      
      const matchesStatus = statusFilter === 'all' || data.status === statusFilter;
      
      return matchesSearch && matchesStatus;
    });
  }, [financialData, searchTerm, statusFilter]);

  // Função para gerar relatório em PDF
  const generateFinancialReport = async () => {
    if (!financialData.length) {
      toast({
        variant: "destructive",
        title: "Sem dados",
        description: "Não há dados financeiros para gerar o relatório.",
      });
      return;
    }

    toast({ title: "Gerando relatório...", description: "Por favor, aguarde." });

    try {
      const docPdf = new jsPDF({ orientation: "landscape" });
      const pageWidth = docPdf.internal.pageSize.width;
      let yPos = 15;

      // Título
      docPdf.setFontSize(18).setFont('helvetica', 'bold');
      docPdf.text('RELATÓRIO FINANCEIRO DETALHADO', pageWidth / 2, yPos, { align: 'center' });
      yPos += 10;
      
      docPdf.setFontSize(12).setFont('helvetica', 'normal');
      docPdf.text(`Gerado em: ${format(new Date(), "dd/MM/yyyy HH:mm")}`, pageWidth / 2, yPos, { align: 'center' });
      yPos += 15;

      // Resumo executivo
      docPdf.setFontSize(14).setFont('helvetica', 'bold');
      docPdf.text('RESUMO EXECUTIVO', 15, yPos);
      yPos += 10;

      const summaryData = [
        ['Total de OS Analisadas', financialSummary.totalOrders.toString()],
        ['Receita Bruta Total', financialSummary.totalGrossRevenue.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })],
        ['Receita Líquida Total', financialSummary.totalNetRevenue.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })],
        ['Total de Impostos', financialSummary.totalTaxes.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })],
        ['Total de Custos', financialSummary.totalCosts.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })],
        ['Lucro Bruto Total', financialSummary.totalGrossProfit.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })],
        ['Lucro Líquido Total', financialSummary.totalNetProfit.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })],
        ['Margem Bruta Média', `${financialSummary.averageGrossMargin.toFixed(2)}%`],
        ['Margem Líquida Média', `${financialSummary.averageNetMargin.toFixed(2)}%`],
        ['OS Lucrativas', financialSummary.profitableOrders.toString()],
        ['OS Não Lucrativas', financialSummary.unprofitableOrders.toString()],
      ];

      autoTable(docPdf, {
        startY: yPos,
        head: [['Indicador', 'Valor']],
        body: summaryData,
        columnStyles: {
          0: { cellWidth: 80 },
          1: { cellWidth: 50, halign: 'right' },
        },
        styles: { fontSize: 10 },
        headStyles: { fillColor: [37, 99, 235] },
      });

      yPos = (docPdf as any).lastAutoTable.finalY + 20;

      // Detalhamento por OS
      docPdf.setFontSize(14).setFont('helvetica', 'bold');
      docPdf.text('DETALHAMENTO POR ORDEM DE SERVIÇO', 15, yPos);
      yPos += 10;

      const detailData = filteredData.map(data => [
        data.internalOS,
        data.customerName,
        data.grossRevenue.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }),
        data.netRevenue.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }),
        data.totalCosts.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }),
        data.grossProfit.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }),
        `${data.grossMargin.toFixed(1)}%`,
        data.status,
      ]);

      autoTable(docPdf, {
        startY: yPos,
        head: [['OS', 'Cliente', 'Receita Bruta', 'Receita Líquida', 'Custos', 'Lucro Bruto', 'Margem', 'Status']],
        body: detailData,
        columnStyles: {
          0: { cellWidth: 25 },
          1: { cellWidth: 45 },
          2: { cellWidth: 30, halign: 'right' },
          3: { cellWidth: 30, halign: 'right' },
          4: { cellWidth: 30, halign: 'right' },
          5: { cellWidth: 30, halign: 'right' },
          6: { cellWidth: 20, halign: 'center' },
          7: { cellWidth: 25, halign: 'center' },
        },
        styles: { fontSize: 8 },
        headStyles: { fillColor: [37, 99, 235] },
      });

      docPdf.save(`Relatorio_Financeiro_${format(new Date(), 'yyyyMMdd')}.pdf`);
      
      toast({ title: "Relatório gerado!", description: "O relatório foi baixado com sucesso." });
      
    } catch (error) {
      console.error("Erro ao gerar relatório:", error);
      toast({
        variant: "destructive",
        title: "Erro ao gerar relatório",
        description: "Não foi possível gerar o arquivo PDF.",
      });
    }
  };

  // Função para obter cor baseada na margem
  const getMarginColor = (margin: number) => {
    if (margin >= 20) return 'text-green-600';
    if (margin >= 10) return 'text-yellow-600';
    if (margin >= 0) return 'text-orange-600';
    return 'text-red-600';
  };

  // Função para obter badge baseado na margem
  const getMarginBadge = (margin: number) => {
    if (margin >= 20) return { variant: "default" as const, color: "bg-green-600 hover:bg-green-600/90" };
    if (margin >= 10) return { variant: "default" as const, color: "bg-yellow-600 hover:bg-yellow-600/90" };
    if (margin >= 0) return { variant: "default" as const, color: "bg-orange-600 hover:bg-orange-600/90" };
    return { variant: "destructive" as const, color: "" };
  };

  if (!isAuthenticated) {
    return (
      <div className="flex-1 space-y-4 p-4 md:p-8 pt-6">
        <div className="flex items-center justify-between space-y-2">
          <h1 className="text-3xl font-bold tracking-tight font-headline">Financeiro</h1>
        </div>
        
        <div className="max-w-md mx-auto bg-white rounded-lg shadow-md">
          <div className="p-6 text-center">
            <div className="mx-auto mb-4 w-12 h-12 bg-yellow-100 rounded-full flex items-center justify-center">
              <Lock className="w-6 h-6 text-yellow-600" />
            </div>
            <h2 className="text-xl font-bold mb-2">Acesso Restrito</h2>
            <p className="text-gray-600 mb-6">
              Esta área requer autenticação. Digite a senha para continuar.
            </p>
            
            <div className="space-y-4">
              <div className="text-left">
                <label htmlFor="password" className="block text-sm font-medium text-gray-700 mb-2">
                  Senha de Acesso
                </label>
                <div className="relative">
                  <Input
                    id="password"
                    type={showPassword ? "text" : "password"}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    onKeyPress={(e) => e.key === 'Enter' && handleAuthentication()}
                    placeholder="Digite a senha"
                    className="w-full"
                  />
                  <button
                    type="button"
                    className="absolute right-2 top-2 p-1 text-gray-400 hover:text-gray-600"
                    onClick={() => setShowPassword(!showPassword)}
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>
              
              {error && (
                <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded">
                  {error}
                </div>
              )}
              
              <Button 
                onClick={handleAuthentication}
                className="w-full"
              >
                Acessar Sistema Financeiro
              </Button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 space-y-4 p-4 md:p-8 pt-6">
      <div className="flex items-center justify-between space-y-2">
        <h1 className="text-3xl font-bold tracking-tight font-headline">Relatório Financeiro Técnico</h1>
        <div className="flex items-center gap-4">
          <Button
            onClick={() => setIsAuthenticated(false)}
            variant="outline"
            className="flex items-center"
          >
            <Lock className="w-4 h-4 mr-2" />
            Sair
          </Button>
          <Button
            onClick={generateFinancialReport}
            disabled={!financialData.length}
            className="flex items-center"
          >
            <Download className="w-4 h-4 mr-2" />
            Exportar Relatório
          </Button>
        </div>
      </div>

      {/* Cards de Resumo */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <StatCard
          title="Receita Bruta Total"
          value={financialSummary.totalGrossRevenue.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
          icon={DollarSign}
          description={`${financialSummary.totalOrders} OS analisadas`}
        />
        <StatCard
          title="Receita Líquida Total"
          value={financialSummary.totalNetRevenue.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
          icon={Target}
          description={`Impostos: ${financialSummary.totalTaxes.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}`}
        />
        <StatCard
          title="Custos Totais"
          value={financialSummary.totalCosts.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
          icon={TrendingDown}
          description={`${(financialSummary.totalNetRevenue > 0 ? (financialSummary.totalCosts / financialSummary.totalNetRevenue) * 100 : 0).toFixed(1)}% da receita líquida`}
        />
        <StatCard
          title="Lucro Bruto Total"
          value={financialSummary.totalGrossProfit.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
          icon={TrendingUp}
          description={`Margem: ${financialSummary.averageGrossMargin.toFixed(1)}%`}
          className={financialSummary.totalGrossProfit >= 0 ? 'border-green-200' : 'border-red-200'}
        />
      </div>

      {/* Indicadores de Performance */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Calculator className="h-5 w-5" />
              Análise de Margem
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              <div className="flex justify-between items-center">
                <span className="text-sm text-muted-foreground">Margem Bruta Média</span>
                <span className={`font-bold ${getMarginColor(financialSummary.averageGrossMargin)}`}>
                  {financialSummary.averageGrossMargin.toFixed(2)}%
                </span>
              </div>
              <Progress 
                value={Math.max(0, Math.min(100, financialSummary.averageGrossMargin))} 
                className="h-2" 
              />
              <div className="flex justify-between items-center">
                <span className="text-sm text-muted-foreground">Margem Líquida Média</span>
                <span className={`font-bold ${getMarginColor(financialSummary.averageNetMargin)}`}>
                  {financialSummary.averageNetMargin.toFixed(2)}%
                </span>
              </div>
              <Progress 
                value={Math.max(0, Math.min(100, financialSummary.averageNetMargin))} 
                className="h-2" 
              />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <CheckCircle className="h-5 w-5" />
              Taxa de Sucesso
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              <div className="flex justify-between items-center">
                <span className="text-sm text-muted-foreground">OS Lucrativas</span>
                <span className="font-bold text-green-600">{financialSummary.profitableOrders}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm text-muted-foreground">OS Não Lucrativas</span>
                <span className="font-bold text-red-600">{financialSummary.unprofitableOrders}</span>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold">
                  {financialSummary.totalOrders > 0 
                    ? ((financialSummary.profitableOrders / financialSummary.totalOrders) * 100).toFixed(1)
                    : 0}%
                </div>
                <div className="text-sm text-muted-foreground">Taxa de Lucratividade</div>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5" />
              Carga Tributária
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              <div className="flex justify-between items-center">
                <span className="text-sm text-muted-foreground">% sobre Receita Bruta</span>
                <span className="font-bold text-orange-600">
                  {financialSummary.totalGrossRevenue > 0 
                    ? ((financialSummary.totalTaxes / financialSummary.totalGrossRevenue) * 100).toFixed(2)
                    : 0}%
                </span>
              </div>
              <div className="text-center">
                <div className="text-xl font-bold text-orange-600">
                  {financialSummary.totalTaxes.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                </div>
                <div className="text-sm text-muted-foreground">Total em Impostos</div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filtros */}
      <Card>
        <CardHeader>
          <CardTitle>Filtros e Busca</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap items-center gap-4">
            <div className="flex-1 min-w-[200px]">
              <Input
                placeholder="🔍 Buscar por OS, cliente ou orçamento..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-[200px]">
                <SelectValue placeholder="Filtrar por Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos os Status</SelectItem>
                <SelectItem value="Aguardando Produção">Aguardando Produção</SelectItem>
                <SelectItem value="Em Produção">Em Produção</SelectItem>
                <SelectItem value="Pronto para Entrega">Pronto para Entrega</SelectItem>
              </SelectContent>
            </Select>
            {(searchTerm || statusFilter !== 'all') && (
              <Button 
                variant="outline" 
                onClick={() => {
                  setSearchTerm('');
                  setStatusFilter('all');
                }}
              >
                Limpar Filtros
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Tabela Detalhada */}
      {isLoading ? (
        <Card>
          <CardContent className="p-6">
            <div className="space-y-4">
              <Skeleton className="h-8 w-full" />
              <Skeleton className="h-8 w-full" />
              <Skeleton className="h-8 w-full" />
              <Skeleton className="h-8 w-full" />
            </div>
          </CardContent>
        </Card>
      ) : filteredData.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>Análise Detalhada por Ordem de Serviço</CardTitle>
            <CardDescription>
              Relatório técnico completo integrando receitas dos orçamentos e custos das OS
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Accordion type="single" collapsible className="w-full">
              {filteredData.map((data) => (
                <AccordionItem value={data.id} key={data.id}>
                  <AccordionTrigger className="hover:bg-muted/50 px-4">
                    <div className="flex-1 text-left">
                      <div className="flex items-center gap-4">
                        <span className="font-bold text-primary">OS: {data.internalOS}</span>
                        <span className="text-muted-foreground">{data.customerName}</span>
                        <Badge 
                          variant={getMarginBadge(data.grossMargin).variant}
                          className={getMarginBadge(data.grossMargin).color}
                        >
                          {data.grossMargin >= 0 ? '✓' : '✗'} {data.grossMargin.toFixed(1)}%
                        </Badge>
                      </div>
                      <div className="flex items-center gap-6 mt-1 text-sm text-muted-foreground">
                        <span>Receita Líquida: {data.netRevenue.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</span>
                        <span>Custos: {data.totalCosts.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</span>
                        <span className={`font-semibold ${data.grossProfit >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                          Lucro: {data.grossProfit.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                        </span>
                      </div>
                    </div>
                  </AccordionTrigger>
                  <AccordionContent className="p-4">
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                      {/* Resumo Financeiro */}
                      <Card className="p-4">
                        <h4 className="font-semibold mb-4 flex items-center gap-2">
                          <DollarSign className="h-4 w-4" />
                          Resumo Financeiro
                        </h4>
                        <div className="space-y-3">
                          <div className="grid grid-cols-2 gap-4 text-sm">
                            <div>
                              <span className="text-muted-foreground">Receita Bruta:</span>
                              <p className="font-medium">{data.grossRevenue.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</p>
                            </div>
                            <div>
                              <span className="text-muted-foreground">Impostos:</span>
                              <p className="font-medium text-orange-600">
                                -{data.taxAmount.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                                <span className="text-xs ml-1">({data.taxRatio.toFixed(1)}%)</span>
                              </p>
                            </div>
                            <div>
                              <span className="text-muted-foreground">Receita Líquida:</span>
                              <p className="font-medium text-blue-600">{data.netRevenue.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</p>
                            </div>
                            <div>
                              <span className="text-muted-foreground">Custos Totais:</span>
                              <p className="font-medium text-red-600">
                                -{data.totalCosts.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                                <span className="text-xs ml-1">({data.costRatio.toFixed(1)}%)</span>
                              </p>
                            </div>
                          </div>
                          
                          <Separator />
                          
                          <div className="grid grid-cols-2 gap-4 text-sm">
                            <div>
                              <span className="text-muted-foreground">Lucro Bruto:</span>
                              <p className={`font-bold ${data.grossProfit >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                                {data.grossProfit.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                              </p>
                            </div>
                            <div>
                              <span className="text-muted-foreground">Margem Bruta:</span>
                              <p className={`font-bold ${getMarginColor(data.grossMargin)}`}>
                                {data.grossMargin.toFixed(2)}%
                              </p>
                            </div>
                            <div>
                              <span className="text-muted-foreground">Lucro Líquido:</span>
                              <p className={`font-bold ${data.netProfit >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                                {data.netProfit.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                              </p>
                            </div>
                            <div>
                              <span className="text-muted-foreground">Margem Líquida:</span>
                              <p className={`font-bold ${getMarginColor(data.netMargin)}`}>
                                {data.netMargin.toFixed(2)}%
                              </p>
                            </div>
                          </div>
                        </div>
                      </Card>

                      {/* Composição de Custos */}
                      <Card className="p-4">
                        <h4 className="font-semibold mb-4 flex items-center gap-2">
                          <Calculator className="h-4 w-4" />
                          Composição de Custos
                        </h4>
                        <div className="space-y-4">
                          <div className="grid grid-cols-3 gap-4 text-sm">
                            <div className="text-center">
                              <div className="text-lg font-bold text-blue-600">
                                {data.materialCosts.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                              </div>
                              <div className="text-xs text-muted-foreground">Materiais</div>
                              <div className="text-xs text-blue-600">
                                {data.totalCosts > 0 ? ((data.materialCosts / data.totalCosts) * 100).toFixed(1) : 0}%
                              </div>
                            </div>
                            <div className="text-center">
                              <div className="text-lg font-bold text-purple-600">
                                {data.laborCosts.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                              </div>
                              <div className="text-xs text-muted-foreground">Mão de Obra</div>
                              <div className="text-xs text-purple-600">
                                {data.totalCosts > 0 ? ((data.laborCosts / data.totalCosts) * 100).toFixed(1) : 0}%
                              </div>
                            </div>
                            <div className="text-center">
                              <div className="text-lg font-bold text-orange-600">
                                {data.overheadCosts.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                              </div>
                              <div className="text-xs text-muted-foreground">Overhead</div>
                              <div className="text-xs text-orange-600">
                                {data.totalCosts > 0 ? ((data.overheadCosts / data.totalCosts) * 100).toFixed(1) : 0}%
                              </div>
                            </div>
                          </div>
                          
                          {/* Barras de progresso para visualização dos custos */}
                          <div className="space-y-2">
                            <div>
                              <div className="flex justify-between text-xs mb-1">
                                <span>Materiais</span>
                                <span>{data.totalCosts > 0 ? ((data.materialCosts / data.totalCosts) * 100).toFixed(1) : 0}%</span>
                              </div>
                              <Progress 
                                value={data.totalCosts > 0 ? (data.materialCosts / data.totalCosts) * 100 : 0} 
                                className="h-1.5" 
                              />
                            </div>
                            <div>
                              <div className="flex justify-between text-xs mb-1">
                                <span>Mão de Obra</span>
                                <span>{data.totalCosts > 0 ? ((data.laborCosts / data.totalCosts) * 100).toFixed(1) : 0}%</span>
                              </div>
                              <Progress 
                                value={data.totalCosts > 0 ? (data.laborCosts / data.totalCosts) * 100 : 0} 
                                className="h-1.5" 
                              />
                            </div>
                            <div>
                              <div className="flex justify-between text-xs mb-1">
                                <span>Overhead</span>
                                <span>{data.totalCosts > 0 ? ((data.overheadCosts / data.totalCosts) * 100).toFixed(1) : 0}%</span>
                              </div>
                              <Progress 
                                value={data.totalCosts > 0 ? (data.overheadCosts / data.totalCosts) * 100 : 0} 
                                className="h-1.5" 
                              />
                            </div>
                          </div>
                        </div>
                      </Card>

                      {/* Detalhamento de Receitas */}
                      {data.quotationItems.length > 0 && (
                        <Card className="p-4">
                          <h4 className="font-semibold mb-4 flex items-center gap-2">
                            <FileText className="h-4 w-4" />
                            Itens do Orçamento
                          </h4>
                          <div className="max-h-60 overflow-y-auto">
                            <Table>
                              <TableHeader>
                                <TableRow>
                                  <TableHead className="text-xs">Item</TableHead>
                                  <TableHead className="text-xs text-right">Qtd</TableHead>
                                  <TableHead className="text-xs text-right">Valor Unit.</TableHead>
                                  <TableHead className="text-xs text-right">Impostos</TableHead>
                                  <TableHead className="text-xs text-right">Total</TableHead>
                                </TableRow>
                              </TableHeader>
                              <TableBody>
                                {data.quotationItems.map((item, index) => (
                                  <TableRow key={index}>
                                    <TableCell className="text-xs">{item.description}</TableCell>
                                    <TableCell className="text-xs text-right">{item.quantity}</TableCell>
                                    <TableCell className="text-xs text-right">
                                      {item.unitPrice.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                                    </TableCell>
                                    <TableCell className="text-xs text-right">
                                      {item.taxRate}%
                                    </TableCell>
                                    <TableCell className="text-xs text-right font-medium">
                                      {item.totalWithTax.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                                    </TableCell>
                                  </TableRow>
                                ))}
                              </TableBody>
                            </Table>
                          </div>
                        </Card>
                      )}

                      {/* Detalhamento de Custos */}
                      {data.costEntries.length > 0 && (
                        <Card className="p-4">
                          <h4 className="font-semibold mb-4 flex items-center gap-2">
                            <TrendingDown className="h-4 w-4" />
                            Lançamentos de Custos
                          </h4>
                          <div className="max-h-60 overflow-y-auto">
                            <Table>
                              <TableHeader>
                                <TableRow>
                                  <TableHead className="text-xs">Descrição</TableHead>
                                  <TableHead className="text-xs">Categoria</TableHead>
                                  <TableHead className="text-xs text-right">Valor</TableHead>
                                  <TableHead className="text-xs">Tipo</TableHead>
                                </TableRow>
                              </TableHeader>
                              <TableBody>
                                {data.costEntries.map((entry, index) => (
                                  <TableRow key={index}>
                                    <TableCell className="text-xs">{entry.description}</TableCell>
                                    <TableCell className="text-xs">
                                      <Badge variant="outline" className="text-xs">
                                        {entry.category === 'material' && '📦 Material'}
                                        {entry.category === 'labor' && '👷 M.O.'}
                                        {entry.category === 'overhead' && '⚙️ Overhead'}
                                      </Badge>
                                    </TableCell>
                                    <TableCell className="text-xs text-right font-medium">
                                      {entry.totalCost.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                                    </TableCell>
                                    <TableCell className="text-xs">
                                      {entry.isFromRequisition ? (
                                        <Badge variant="secondary" className="text-xs">Auto</Badge>
                                      ) : (
                                        <Badge variant="outline" className="text-xs">Manual</Badge>
                                      )}
                                    </TableCell>
                                  </TableRow>
                                ))}
                              </TableBody>
                            </Table>
                          </div>
                        </Card>
                      )}
                    </div>
                  </AccordionContent>
                </AccordionItem>
              ))}
            </Accordion>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="p-6">
            <div className="text-center text-muted-foreground">
              <Package className="h-12 w-12 mx-auto mb-4" />
              <h3 className="text-lg font-semibold mb-2">Nenhum dado financeiro encontrado</h3>
              <p className="text-sm">
                {searchTerm || statusFilter !== 'all' 
                  ? 'Tente ajustar os filtros para ver mais resultados.'
                  : 'Não há OS ativas com dados financeiros disponíveis no momento.'
                }
              </p>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
