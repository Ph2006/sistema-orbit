"use client";

import React, { useState, useEffect, useMemo } from 'react';
import { Download, Lock, Eye, EyeOff, TrendingUp, TrendingDown, DollarSign, FileText, Calculator, Target, AlertTriangle, CheckCircle, Package, Plus, Edit, Save, X } from "lucide-react";
import { collection, getDocs, doc, updateDoc, getDoc, Timestamp } from "firebase/firestore";
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
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";

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
  
  // Dados de receita manual
  hasManualRevenue: boolean;
  manualRevenueInfo?: {
    grossRevenue: number;
    taxAmount: number;
    lastUpdate: Date;
    updatedBy: string;
  };
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
  const [activeTab, setActiveTab] = useState<'financeiro' | 'faturamento'>('financeiro');
  const [billingData, setBillingData] = useState<any[]>([]);
  const [isBillingLoading, setIsBillingLoading] = useState(false);
  
  // Estados de filtros
  const [statusFilter, setStatusFilter] = useState('all');
  const [searchTerm, setSearchTerm] = useState('');
  
  // Estados para lançamento manual de receita
  const [isRevenueModalOpen, setIsRevenueModalOpen] = useState(false);
  const [selectedOrderForRevenue, setSelectedOrderForRevenue] = useState<any>(null);
  const [manualGrossRevenue, setManualGrossRevenue] = useState('');
  const [manualTaxAmount, setManualTaxAmount] = useState('');
  const [manualTaxRate, setManualTaxRate] = useState('');
  const [usePercentage, setUsePercentage] = useState(false);
  const [isSavingRevenue, setIsSavingRevenue] = useState(false);
  
  const { user, loading: authLoading } = useAuth();
  const { toast } = useToast();

  // Função para calcular impostos baseado no percentual
  const calculateTaxFromRate = (grossValue: string, taxRate: string) => {
    const gross = parseFloat(grossValue) || 0;
    const rate = parseFloat(taxRate) || 0;
    return (gross * (rate / 100)).toFixed(2);
  };

  // Função para calcular percentual baseado no valor
  const calculateTaxRate = (grossValue: string, taxAmount: string) => {
    const gross = parseFloat(grossValue) || 0;
    const tax = parseFloat(taxAmount) || 0;
    if (gross === 0) return '0';
    return ((tax / gross) * 100).toFixed(2);
  };

  // Atualizar campos automaticamente conforme o modo selecionado
  useEffect(() => {
    if (!manualGrossRevenue) return;
    
    if (usePercentage && manualTaxRate) {
      // Calculando valor do imposto com base no percentual
      const calculatedTax = calculateTaxFromRate(manualGrossRevenue, manualTaxRate);
      setManualTaxAmount(calculatedTax);
    } else if (!usePercentage && manualTaxAmount) {
      // Calculando percentual com base no valor do imposto
      const calculatedRate = calculateTaxRate(manualGrossRevenue, manualTaxAmount);
      setManualTaxRate(calculatedRate);
    }
  }, [manualGrossRevenue, manualTaxRate, manualTaxAmount, usePercentage]);

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
            // Incluir dados de receita manual se existirem
            manualRevenue: data.manualRevenue ? {
              grossRevenue: Number(data.manualRevenue.grossRevenue) || 0,
              taxAmount: Number(data.manualRevenue.taxAmount) || 0,
              lastUpdate: data.manualRevenue.lastUpdate?.toDate ? data.manualRevenue.lastUpdate.toDate() : null,
              updatedBy: data.manualRevenue.updatedBy || null,
            } : null,
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

  const fetchOrdersForBilling = async () => {
    if (!user) return [];
    try {
      const [ordersSnap, quotationsData] = await Promise.all([
        getDocs(collection(db, "companies", "mecald", "orders")),
        fetchQuotations(),
      ]);

      const ordersRaw = ordersSnap.docs.map(d => ({ id: d.id, ...d.data() }));

      const activeOrders = ordersRaw.filter((order: any) =>
        !['Concluído', 'Cancelado'].includes(order.status)
      );

      return activeOrders.map((order: any) => {
        const quotation = quotationsData.find((q: any) =>
          q.quotationNumber === (order.quotationNumber || '') ||
          q.number?.toString?.() === (order.quotationNumber || '') ||
          q.number?.toString?.() === (order.internalOS || '')
        );

        const items = (order.items || []).map((item: any, i: number) => {
          const quoteItem = quotation?.items?.[i];
          const quoteQty = Number(quoteItem?.quantity) || 0;
          const quoteTotalWithTax = Number(quoteItem?.totalWithTax) || 0;
          const unitPriceFromQuotation = quoteQty > 0 ? (quoteTotalWithTax / quoteQty) : 0;
          const orderQty = Number(item?.quantity) || 0;

          const shippingDate =
            item?.shippingDate?.toDate ? item.shippingDate.toDate() :
            item?.shippingDate ? new Date(item.shippingDate) : null;

          const billingEntries = (item?.billingEntries || []).map((entry: any) => ({
            id: entry.id || `entry-${Date.now()}`,
            date: entry.date?.toDate ? entry.date.toDate() : entry.date ? new Date(entry.date) : new Date(),
            quantity: Number(entry.quantity) || 0,
            unitPrice: Number(entry.unitPrice) || 0,
            value: Number(entry.value) || 0,
            invoiceNumber: entry.invoiceNumber || '',
            notes: entry.notes || '',
            totalOrderValue: Number(entry.totalOrderValue) || 0,
            itemNumber: entry.itemNumber || '',
            shippingDate: entry.shippingDate?.toDate
              ? entry.shippingDate.toDate()
              : entry.shippingDate
                ? new Date(entry.shippingDate)
                : null,
          }));

          const billedValue = billingEntries.reduce((sum: number, e: any) => sum + e.value, 0);
          const billedQty = Number(item?.billedQuantity) || 0;
          const remainingQty = Math.max(0, orderQty - billedQty);
          const lastUnitPrice = Number(item?.lastUnitPrice) || unitPriceFromQuotation;
          const totalValue = lastUnitPrice > 0 ? lastUnitPrice * orderQty : 0;
          const remainingValue = Math.max(0, totalValue - billedValue);

          return {
            id: item?.id || `item-${i}`,
            description: item?.description || quoteItem?.description || '',
            quantity: orderQty,
            billedQuantity: billedQty,
            remainingQuantity: remainingQty,
            unitPriceFromQuotation,
            lastUnitPrice,
            totalValue,
            billedValue,
            remainingValue,
            invoiceNumber: item?.invoiceNumber || '',
            itemNumber: item?.itemNumber || '',
            shippingDate,
            invoiced: Boolean(item?.invoiced),
            billingEntries,
          };
        });

        const orderBilledValue = items.reduce((sum: number, it: any) => sum + it.billedValue, 0);
        const manualTotalValue = Number(order.billingTotalValue) || 0;
        const billingPct = manualTotalValue > 0
          ? Math.min(100, (orderBilledValue / manualTotalValue) * 100)
          : 0;

        return {
          id: order.id,
          internalOS: order.internalOS || 'N/A',
          quotationNumber: order.quotationNumber || '',
          customerName: order.customer?.name || order.customerName || 'Cliente Desconhecido',
          status: order.status || 'Indefinido',
          deliveryDate: order.deliveryDate?.toDate ? order.deliveryDate.toDate() : null,
          items,
          totalValue: manualTotalValue,
          billedValue: orderBilledValue,
          remainingValue: Math.max(0, manualTotalValue - orderBilledValue),
          billingPct,
          manualTotalValue,
        };
      });
    } catch (error) {
      console.error("Erro ao buscar OS para faturamento:", error);
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
      let hasManualRevenue = false;
      let manualRevenueInfo: OrderFinancialData["manualRevenueInfo"] = undefined;

      // Primeiro, verificar se há receita manual salva na OS
      if (order.manualRevenue) {
        hasManualRevenue = true;
        grossRevenue = Number(order.manualRevenue.grossRevenue) || 0;
        taxAmount = Number(order.manualRevenue.taxAmount) || 0;
        netRevenue = grossRevenue - taxAmount;
        manualRevenueInfo = {
          grossRevenue: grossRevenue,
          taxAmount: taxAmount,
          lastUpdate: order.manualRevenue.lastUpdate,
          updatedBy: order.manualRevenue.updatedBy
        };
      } else if (quotation && quotation.items) {
        // Se não há receita manual, usar dados do orçamento
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
        hasManualRevenue,
        manualRevenueInfo,
      };
    });
  };

  // Função para salvar receita manual
  const handleSaveManualRevenue = async () => {
    if (!selectedOrderForRevenue) return;
    
    const grossValue = parseFloat(manualGrossRevenue);
    const taxValue = parseFloat(manualTaxAmount);
    
    if (isNaN(grossValue) || grossValue <= 0) {
      toast({
        variant: "destructive",
        title: "Erro de validação",
        description: "O valor da receita bruta deve ser um número válido maior que zero.",
      });
      return;
    }
    
    if (isNaN(taxValue) || taxValue < 0) {
      toast({
        variant: "destructive",
        title: "Erro de validação", 
        description: "O valor dos impostos deve ser um número válido maior ou igual a zero.",
      });
      return;
    }
    
    if (taxValue >= grossValue) {
      toast({
        variant: "destructive",
        title: "Erro de validação",
        description: "O valor dos impostos não pode ser maior ou igual à receita bruta.",
      });
      return;
    }
    
    setIsSavingRevenue(true);
    
    try {
      const orderRef = doc(db, "companies", "mecald", "orders", selectedOrderForRevenue.id);
      
      const manualRevenueData = {
        grossRevenue: grossValue,
        taxAmount: taxValue,
        lastUpdate: new Date(),
        updatedBy: user?.email || 'Sistema',
      };
      
      await updateDoc(orderRef, {
        manualRevenue: manualRevenueData
      });
      
      toast({
        title: "Receita salva com sucesso!",
        description: `Receita bruta: ${grossValue.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })} | Impostos: ${taxValue.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}`,
      });
      
      // Recarregar dados
      await loadData();
      
      // Fechar modal e limpar estados
      handleCloseRevenueModal();
      
    } catch (error) {
      console.error("Erro ao salvar receita manual:", error);
      toast({
        variant: "destructive",
        title: "Erro ao salvar receita",
        description: "Não foi possível salvar os dados da receita. Tente novamente.",
      });
    } finally {
      setIsSavingRevenue(false);
    }
  };

  // Função para abrir modal de receita manual
  const handleOpenRevenueModal = (order: any) => {
    console.log('🔄 Abrindo modal para OS:', order.internalOS, 'ID:', order.id);
    setSelectedOrderForRevenue(order);
    
    // Se já existem dados de receita manual, pré-preencher
    if (order.manualRevenue) {
      const grossValue = order.manualRevenue.grossRevenue.toString();
      const taxValue = order.manualRevenue.taxAmount.toString();
      setManualGrossRevenue(grossValue);
      setManualTaxAmount(taxValue);
      setManualTaxRate(calculateTaxRate(grossValue, taxValue));
    } else {
      setManualGrossRevenue('');
      setManualTaxAmount('');
      setManualTaxRate('');
    }
    
    setUsePercentage(false);
    setIsRevenueModalOpen(true);
  };

  // Função para fechar modal e limpar estados
  const handleCloseRevenueModal = () => {
    setIsRevenueModalOpen(false);
    setSelectedOrderForRevenue(null);
    setManualGrossRevenue('');
    setManualTaxAmount('');
    setManualTaxRate('');
    setUsePercentage(false);
  };

  // Função para carregar dados
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

  useEffect(() => {
    loadData();
  }, [user, isAuthenticated]);

  useEffect(() => {
    const loadBilling = async () => {
      if (!user || !isAuthenticated) return;
      if (activeTab !== 'faturamento') return;
      setIsBillingLoading(true);
      try {
        const data = await fetchOrdersForBilling();
        setBillingData(data);
      } finally {
        setIsBillingLoading(false);
      }
    };
    loadBilling();
  }, [user, isAuthenticated, activeTab]);

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

  // Função para gerar relatório individual em PDF
  const generateIndividualReport = async (data: OrderFinancialData) => {
    toast({ title: "Gerando relatório individual...", description: "Por favor, aguarde." });

    try {
      const docPdf = new jsPDF({ orientation: "portrait" });
      const pageWidth = docPdf.internal.pageSize.width;
      const pageHeight = docPdf.internal.pageSize.height;
      let yPos = 20;

      // Função auxiliar para verificar quebra de página
      const checkPageBreak = (requiredSpace: number) => {
        if (yPos + requiredSpace > pageHeight - 20) {
          docPdf.addPage();
          yPos = 20;
        }
      };

      // Cabeçalho do relatório
      docPdf.setFontSize(20).setFont('helvetica', 'bold');
      docPdf.text('RELATÓRIO FINANCEIRO DETALHADO', pageWidth / 2, yPos, { align: 'center' });
      yPos += 10;
      
      docPdf.setFontSize(16).setFont('helvetica', 'normal');
      docPdf.text(`ORDEM DE SERVIÇO: ${data.internalOS}`, pageWidth / 2, yPos, { align: 'center' });
      yPos += 15;

      // Informações básicas
      docPdf.setFontSize(12).setFont('helvetica', 'bold');
      docPdf.text('INFORMAÇÕES GERAIS', 15, yPos);
      yPos += 8;

      const basicInfo = [
        ['OS:', data.internalOS],
        ['Cliente:', data.customerName],
        ['Status:', data.status],
        ['Orçamento:', data.quotationNumber || 'N/A'],
        ['Data de Entrega:', data.deliveryDate ? format(data.deliveryDate, 'dd/MM/yyyy') : 'Não definida'],
        ['Gerado em:', format(new Date(), 'dd/MM/yyyy HH:mm')],
      ];

      autoTable(docPdf, {
        startY: yPos,
        head: [],
        body: basicInfo,
        columnStyles: {
          0: { cellWidth: 50, fontStyle: 'bold' },
          1: { cellWidth: 130 },
        },
        styles: { fontSize: 10 },
        theme: 'grid',
      });

      yPos = (docPdf as any).lastAutoTable.finalY + 15;
      checkPageBreak(50);

      // RESUMO FINANCEIRO
      docPdf.setFontSize(14).setFont('helvetica', 'bold');
      docPdf.text('RESUMO FINANCEIRO', 15, yPos);
      yPos += 10;

      const financialSummaryData = [
        ['RECEITAS', ''],
        ['Receita Bruta Total', data.grossRevenue.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })],
        ['(-) Impostos e Taxas', `-${data.taxAmount.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })} (${data.taxRatio.toFixed(1)}%)`],
        ['(=) Receita Líquida', data.netRevenue.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })],
        ['', ''],
        ['CUSTOS', ''],
        ['Materiais', `-${data.materialCosts.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}`],
        ['Mão de Obra', `-${data.laborCosts.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}`],
        ['Custos Gerais/Overhead', `-${data.overheadCosts.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}`],
        ['(=) Total de Custos', `-${data.totalCosts.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}`],
        ['', ''],
        ['RESULTADOS', ''],
        ['Lucro Bruto (Receita Líq. - Custos)', `${data.grossProfit.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}`],
        ['Margem Bruta', `${data.grossMargin.toFixed(2)}%`],
        ['Lucro Líquido (após impostos)', `${data.netProfit.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}`],
        ['Margem Líquida', `${data.netMargin.toFixed(2)}%`],
        ['Relação Custos/Receita', `${data.costRatio.toFixed(1)}%`],
      ];

      autoTable(docPdf, {
        startY: yPos,
        head: [],
        body: financialSummaryData,
        columnStyles: {
          0: { cellWidth: 120, fontStyle: 'bold' },
          1: { cellWidth: 60, halign: 'right' },
        },
        styles: { fontSize: 10 },
        theme: 'striped',
        didParseCell: function(data) {
          // Destacar seções principais
          if (data.cell.text[0] === 'RECEITAS' || data.cell.text[0] === 'CUSTOS' || data.cell.text[0] === 'RESULTADOS') {
            data.cell.styles.fillColor = [37, 99, 235];
            data.cell.styles.textColor = [255, 255, 255];
            data.cell.styles.fontStyle = 'bold';
          }
          // Destacar totais
          if (data.cell.text[0].includes('(=)')) {
            data.cell.styles.fontStyle = 'bold';
            data.cell.styles.fillColor = [243, 244, 246];
          }
        },
      });

      yPos = (docPdf as any).lastAutoTable.finalY + 15;
      checkPageBreak(50);

      // FONTE DA RECEITA
      docPdf.setFontSize(14).setFont('helvetica', 'bold');
      docPdf.text('ORIGEM DA RECEITA', 15, yPos);
      yPos += 10;

      if (data.hasManualRevenue) {
        docPdf.setFontSize(10).setFont('helvetica', 'normal');
        docPdf.text('✓ Receita lançada manualmente no sistema', 15, yPos);
        yPos += 5;
        if (data.manualRevenueInfo) {
          docPdf.text(`Última atualização: ${format(data.manualRevenueInfo.lastUpdate, 'dd/MM/yyyy HH:mm')}`, 15, yPos);
          yPos += 5;
          docPdf.text(`Atualizado por: ${data.manualRevenueInfo.updatedBy}`, 15, yPos);
          yPos += 10;
        }
      } else if (data.quotationItems.length > 0) {
        docPdf.setFontSize(10).setFont('helvetica', 'normal');
        docPdf.text('✓ Receita calculada automaticamente com base no orçamento', 15, yPos);
        yPos += 15;

        // Detalhamento dos itens do orçamento
        docPdf.setFontSize(12).setFont('helvetica', 'bold');
        docPdf.text('ITENS DO ORÇAMENTO', 15, yPos);
        yPos += 8;

        const quotationData = data.quotationItems.map(item => [
          item.description,
          item.quantity.toString(),
          item.unitPrice.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }),
          `${item.taxRate}%`,
          item.totalWithoutTax.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }),
          item.totalWithTax.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
        ]);

        autoTable(docPdf, {
          startY: yPos,
          head: [['Descrição', 'Qtd', 'Vlr Unit.', 'Imposto', 'Subtotal', 'Total c/ Imp.']],
          body: quotationData,
          columnStyles: {
            0: { cellWidth: 60 },
            1: { cellWidth: 20, halign: 'center' },
            2: { cellWidth: 25, halign: 'right' },
            3: { cellWidth: 20, halign: 'center' },
            4: { cellWidth: 25, halign: 'right' },
            5: { cellWidth: 30, halign: 'right' },
          },
          styles: { fontSize: 8 },
          headStyles: { fillColor: [37, 99, 235] },
        });

        yPos = (docPdf as any).lastAutoTable.finalY + 15;
      } else {
        docPdf.setFontSize(10).setFont('helvetica', 'normal');
        docPdf.text('⚠️ Nenhuma receita encontrada para esta OS', 15, yPos);
        yPos += 15;
      }

      checkPageBreak(50);

      // DETALHAMENTO DOS CUSTOS
      if (data.costEntries.length > 0) {
        docPdf.setFontSize(14).setFont('helvetica', 'bold');
        docPdf.text('DETALHAMENTO DOS CUSTOS', 15, yPos);
        yPos += 10;

        // Análise por categoria
        docPdf.setFontSize(12).setFont('helvetica', 'bold');
        docPdf.text('DISTRIBUIÇÃO POR CATEGORIA', 15, yPos);
        yPos += 8;

        const categoryAnalysis = [
          ['Materiais', data.materialCosts.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }), 
           `${data.totalCosts > 0 ? ((data.materialCosts / data.totalCosts) * 100).toFixed(1) : 0}%`],
          ['Mão de Obra', data.laborCosts.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }), 
           `${data.totalCosts > 0 ? ((data.laborCosts / data.totalCosts) * 100).toFixed(1) : 0}%`],
          ['Custos Gerais/Overhead', data.overheadCosts.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }), 
           `${data.totalCosts > 0 ? ((data.overheadCosts / data.totalCosts) * 100).toFixed(1) : 0}%`],
          ['TOTAL', data.totalCosts.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }), '100%'],
        ];

        autoTable(docPdf, {
          startY: yPos,
          head: [['Categoria', 'Valor', '% do Total']],
          body: categoryAnalysis,
          columnStyles: {
            0: { cellWidth: 80 },
            1: { cellWidth: 50, halign: 'right' },
            2: { cellWidth: 30, halign: 'center' },
          },
          styles: { fontSize: 10 },
          headStyles: { fillColor: [37, 99, 235] },
          didParseCell: function(data) {
            if (data.cell.text[0] === 'TOTAL') {
              data.cell.styles.fontStyle = 'bold';
              data.cell.styles.fillColor = [243, 244, 246];
            }
          },
        });

        yPos = (docPdf as any).lastAutoTable.finalY + 15;
        checkPageBreak(50);

        // Lançamentos detalhados
        docPdf.setFontSize(12).setFont('helvetica', 'bold');
        docPdf.text('LANÇAMENTOS DETALHADOS', 15, yPos);
        yPos += 8;

        const costDetails = data.costEntries.map(entry => [
          entry.description,
          entry.category === 'material' ? '📦 Material' : 
          entry.category === 'labor' ? '👷 Mão de Obra' : '⚙️ Overhead',
          entry.totalCost.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }),
          entry.isFromRequisition ? 'Automático' : 'Manual'
        ]);

        autoTable(docPdf, {
          startY: yPos,
          head: [['Descrição', 'Categoria', 'Valor', 'Origem']],
          body: costDetails,
          columnStyles: {
            0: { cellWidth: 80 },
            1: { cellWidth: 35 },
            2: { cellWidth: 35, halign: 'right' },
            3: { cellWidth: 30, halign: 'center' },
          },
          styles: { fontSize: 9 },
          headStyles: { fillColor: [37, 99, 235] },
        });

        yPos = (docPdf as any).lastAutoTable.finalY + 15;
      } else {
        docPdf.setFontSize(14).setFont('helvetica', 'bold');
        docPdf.text('DETALHAMENTO DOS CUSTOS', 15, yPos);
        yPos += 10;
        
        docPdf.setFontSize(10).setFont('helvetica', 'normal');
        docPdf.text('⚠️ Nenhum custo lançado para esta OS', 15, yPos);
        yPos += 15;
      }

      checkPageBreak(80);

      // ANÁLISE DE RENTABILIDADE
      docPdf.setFontSize(14).setFont('helvetica', 'bold');
      docPdf.text('ANÁLISE DE RENTABILIDADE', 15, yPos);
      yPos += 10;

      // Classificação da margem
      let marginClassification = '';
      let marginColor = '';
      if (data.grossMargin >= 20) {
        marginClassification = 'EXCELENTE';
        marginColor = 'Verde';
      } else if (data.grossMargin >= 10) {
        marginClassification = 'BOA';
        marginColor = 'Amarelo';
      } else if (data.grossMargin >= 0) {
        marginClassification = 'REGULAR';
        marginColor = 'Laranja';
      } else {
        marginClassification = 'CRÍTICA';
        marginColor = 'Vermelho';
      }

      const profitabilityAnalysis = [
        ['Status da Margem:', `${marginClassification} (${marginColor})`],
        ['Margem Bruta:', `${data.grossMargin.toFixed(2)}%`],
        ['Margem Líquida:', `${data.netMargin.toFixed(2)}%`],
        ['Eficiência de Custos:', `${(100 - data.costRatio).toFixed(1)}%`],
        ['Carga Tributária:', `${data.taxRatio.toFixed(1)}% da receita bruta`],
        ['Ponto de Equilíbrio:', data.netRevenue > 0 ? 
          `${((data.totalCosts / data.netRevenue) * 100).toFixed(1)}% da receita líquida` : 'N/A'],
      ];

      autoTable(docPdf, {
        startY: yPos,
        head: [],
        body: profitabilityAnalysis,
        columnStyles: {
          0: { cellWidth: 80, fontStyle: 'bold' },
          1: { cellWidth: 100 },
        },
        styles: { fontSize: 10 },
        theme: 'grid',
      });

      yPos = (docPdf as any).lastAutoTable.finalY + 15;
      checkPageBreak(60);

      // RECOMENDAÇÕES
      docPdf.setFontSize(14).setFont('helvetica', 'bold');
      docPdf.text('RECOMENDAÇÕES TÉCNICAS', 15, yPos);
      yPos += 10;

      docPdf.setFontSize(10).setFont('helvetica', 'normal');
      
      if (data.grossMargin < 0) {
        docPdf.text('• AÇÃO URGENTE: Esta OS está gerando prejuízo. Revisar custos imediatamente.', 15, yPos);
        yPos += 6;
      } else if (data.grossMargin < 10) {
        docPdf.text('• ATENÇÃO: Margem baixa. Analisar possibilidades de redução de custos.', 15, yPos);
        yPos += 6;
      } else {
        docPdf.text('• Status financeiro dentro dos parâmetros aceitáveis.', 15, yPos);
        yPos += 6;
      }

      if (data.materialCosts > data.laborCosts && data.materialCosts > data.overheadCosts) {
        docPdf.text('• Materiais representam o maior custo. Revisar fornecedores e negociações.', 15, yPos);
        yPos += 6;
      }

      if (data.taxRatio > 20) {
        docPdf.text('• Carga tributária elevada. Avaliar regime tributário e planejamento fiscal.', 15, yPos);
        yPos += 6;
      }

      docPdf.text('• Acompanhar evolução dos custos durante execução da OS.', 15, yPos);
      yPos += 6;
      docPdf.text('• Comparar com histórico de OS similares para benchmarking.', 15, yPos);

      // Footer
      yPos = pageHeight - 30;
      docPdf.setFontSize(8).setFont('helvetica', 'italic');
      docPdf.text('Relatório gerado automaticamente pelo Sistema de Gestão Financeira', pageWidth / 2, yPos, { align: 'center' });
      docPdf.text(`${format(new Date(), 'dd/MM/yyyy HH:mm')} - Página ${docPdf.getNumberOfPages()}`, pageWidth / 2, yPos + 5, { align: 'center' });

      // Salvar o arquivo
      const fileName = `Relatorio_OS_${data.internalOS.replace(/[^\w\s]/gi, '')}_${format(new Date(), 'yyyyMMdd_HHmm')}.pdf`;
      docPdf.save(fileName);
      
      toast({ 
        title: "Relatório individual gerado!", 
        description: `Relatório da OS ${data.internalOS} baixado com sucesso.` 
      });
      
    } catch (error) {
      console.error("Erro ao gerar relatório individual:", error);
      toast({
        variant: "destructive",
        title: "Erro ao gerar relatório",
        description: "Não foi possível gerar o relatório individual. Tente novamente.",
      });
    }
  };

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

  const BillingTab = () => {
    const [expandedOrderId, setExpandedOrderId] = useState<string | null>(null);
    const [billingModalOpen, setBillingModalOpen] = useState(false);
    const [selectedItemForBilling, setSelectedItemForBilling] = useState<any>(null);
    const [selectedOrderForBilling, setSelectedOrderForBilling] = useState<any>(null);
    const [newEntry, setNewEntry] = useState({
      quantity: '',
      invoiceNumber: '',
      notes: '',
      unitPrice: '',
      totalOrderValue: '',
      itemNumber: '',
      shippingDate: '',
    });
    const [isSavingEntry, setIsSavingEntry] = useState(false);
    const [editingEntry, setEditingEntry] = useState<{ orderId: string, itemId: string, entry: any } | null>(null);
    const [editEntryModalOpen, setEditEntryModalOpen] = useState(false);
    const [editEntryForm, setEditEntryForm] = useState({
      quantity: '',
      unitPrice: '',
      invoiceNumber: '',
      notes: '',
      itemNumber: '',
      shippingDate: '',
    });
    const [orderTotalValues, setOrderTotalValues] = useState<Record<string, string>>({});
    const [editingOrderTotal, setEditingOrderTotal] = useState<string | null>(null);

    const summary = useMemo(() => {
      const total = billingData.reduce((sum: number, o: any) => sum + (o.manualTotalValue || 0), 0);
      const billed = billingData.reduce((sum: number, o: any) => sum + (o.billedValue || 0), 0);
      const remaining = Math.max(0, total - billed);
      const pct = total > 0 ? Math.min(100, (billed / total) * 100) : 0;
      return { total, billed, remaining, pct };
    }, [billingData]);

    const handleOpenBillingModal = (order: any, item: any) => {
      setSelectedOrderForBilling(order);
      setSelectedItemForBilling(item);
      setNewEntry({
        quantity: '',
        invoiceNumber: '',
        notes: '',
        unitPrice: item.lastUnitPrice ? String(item.lastUnitPrice) : '',
        totalOrderValue: '',
        itemNumber: item.itemNumber || '',
        shippingDate: '',
      });
      setBillingModalOpen(true);
    };

    const handleSaveBillingEntry = async () => {
      if (!selectedOrderForBilling || !selectedItemForBilling) return;
      const qty = Number(newEntry.quantity);
      const unitPrice = Number(newEntry.unitPrice);
      if (!qty || qty <= 0) {
        toast({ variant: "destructive", title: "Quantidade inválida", description: "Informe uma quantidade maior que zero." });
        return;
      }
      if (!unitPrice || unitPrice <= 0) {
        toast({ variant: "destructive", title: "Valor unitário inválido", description: "Informe o valor unitário do item." });
        return;
      }
      if (qty > selectedItemForBilling.remainingQuantity) {
        toast({ variant: "destructive", title: "Quantidade excede o saldo", description: `Saldo disponível: ${selectedItemForBilling.remainingQuantity}` });
        return;
      }

      setIsSavingEntry(true);
      try {
        const orderRef = doc(db, "companies", "mecald", "orders", selectedOrderForBilling.id);
        const orderSnap = await getDoc(orderRef);
        if (!orderSnap.exists()) throw new Error("Pedido não encontrado");

        const orderData = orderSnap.data();
        const items = Array.isArray(orderData.items) ? [...orderData.items] : Object.values(orderData.items || {});

        const itemIndex = items.findIndex((it: any, i: number) =>
          it.id === selectedItemForBilling.id ||
          `item-${i}` === selectedItemForBilling.id ||
          it.description === selectedItemForBilling.description
        );
        if (itemIndex === -1) throw new Error("Item não encontrado");
        const entryValue = qty * unitPrice;

        const entry = {
          id: `entry-${Date.now()}`,
          date: Timestamp.now(),
          quantity: qty,
          unitPrice: unitPrice,
          value: entryValue,
          invoiceNumber: newEntry.invoiceNumber,
          notes: newEntry.notes,
          totalOrderValue: Number(newEntry.totalOrderValue) || 0,
          itemNumber: newEntry.itemNumber,
          shippingDate: newEntry.shippingDate
            ? Timestamp.fromDate(new Date(newEntry.shippingDate + 'T00:00:00'))
            : null,
        };

        const existingEntries = items[itemIndex].billingEntries || [];
        const newBilledQty = (Number(items[itemIndex].billedQuantity) || 0) + qty;

        items[itemIndex] = {
          ...items[itemIndex],
          billingEntries: [...existingEntries, entry],
          billedQuantity: newBilledQty,
          lastUnitPrice: unitPrice,
          itemNumber: newEntry.itemNumber || items[itemIndex].itemNumber || '',
          invoiced: newBilledQty >= (Number(items[itemIndex].quantity) || 0),
        };
        if (!items[itemIndex].id) {
          items[itemIndex].id = selectedItemForBilling.id;
        }

        await updateDoc(orderRef, { items, lastUpdate: Timestamp.now() });

        toast({ title: "Lançamento salvo!", description: `${qty} unid. × ${unitPrice.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })} = ${entryValue.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}` });
        setBillingModalOpen(false);

        setIsBillingLoading(true);
        const data = await fetchOrdersForBilling();
        setBillingData(data);
      } catch (error) {
        console.error(error);
        toast({ variant: "destructive", title: "Erro ao salvar", description: "Não foi possível registrar o lançamento." });
      } finally {
        setIsSavingEntry(false);
        setIsBillingLoading(false);
      }
    };

    const handleDeleteBillingEntry = async () => {
      if (!editingEntry) return;
      try {
        const orderRef = doc(db, "companies", "mecald", "orders", editingEntry.orderId);
        const snap = await getDoc(orderRef);
        if (!snap.exists()) return;
        const data = snap.data();
        const items = Array.isArray(data.items) ? [...data.items] : Object.values(data.items || {});
        const itemIdx = items.findIndex((it: any, i: number) =>
          it.id === editingEntry.itemId ||
          `item-${i}` === editingEntry.itemId ||
          it.description === editingEntry.entry?.description
        );
        if (itemIdx === -1) return;

        const oldEntry = editingEntry.entry;
        const updatedEntries = (items[itemIdx].billingEntries || []).filter((e: any) => e.id !== oldEntry.id);
        const newBilledQty = Math.max(0, (Number(items[itemIdx].billedQuantity) || 0) - oldEntry.quantity);
        items[itemIdx] = { ...items[itemIdx], billingEntries: updatedEntries, billedQuantity: newBilledQty, invoiced: false };
        if (!items[itemIdx].id) {
          items[itemIdx].id = editingEntry.itemId;
        }

        await updateDoc(orderRef, { items, lastUpdate: Timestamp.now() });
        toast({ title: "Lançamento excluído!" });
        setEditEntryModalOpen(false);
        setEditingEntry(null);
        setIsBillingLoading(true);
        const refreshed = await fetchOrdersForBilling();
        setBillingData(refreshed);
      } catch (e) {
        toast({ variant: "destructive", title: "Erro ao excluir" });
      } finally {
        setIsBillingLoading(false);
      }
    };

    const handleUpdateBillingEntry = async () => {
      if (!editingEntry) return;
      const qty = Number(editEntryForm.quantity);
      const unitPrice = Number(editEntryForm.unitPrice);
      if (!qty || !unitPrice) {
        toast({ variant: "destructive", title: "Preencha quantidade e valor" });
        return;
      }

      try {
        const orderRef = doc(db, "companies", "mecald", "orders", editingEntry.orderId);
        const snap = await getDoc(orderRef);
        if (!snap.exists()) return;
        const data = snap.data();
        const items = Array.isArray(data.items) ? [...data.items] : Object.values(data.items || {});
        const itemIdx = items.findIndex((it: any, i: number) =>
          it.id === editingEntry.itemId ||
          `item-${i}` === editingEntry.itemId ||
          it.description === editingEntry.entry?.description
        );
        if (itemIdx === -1) return;

        const oldEntry = editingEntry.entry;
        const updatedEntries = (items[itemIdx].billingEntries || []).map((e: any) =>
          e.id === oldEntry.id
            ? {
                ...e,
                quantity: qty,
                unitPrice,
                value: qty * unitPrice,
                invoiceNumber: editEntryForm.invoiceNumber,
                notes: editEntryForm.notes,
                itemNumber: editEntryForm.itemNumber,
                shippingDate: editEntryForm.shippingDate
                  ? Timestamp.fromDate(new Date(editEntryForm.shippingDate + 'T00:00:00'))
                  : e.shippingDate || null,
              }
            : e
        );
        const newBilledQty = updatedEntries.reduce((s: number, e: any) => s + e.quantity, 0);

        items[itemIdx] = {
          ...items[itemIdx],
          billingEntries: updatedEntries,
          billedQuantity: newBilledQty,
          lastUnitPrice: unitPrice,
          invoiced: newBilledQty >= (Number(items[itemIdx].quantity) || 0),
        };
        if (!items[itemIdx].id) {
          items[itemIdx].id = editingEntry.itemId;
        }

        await updateDoc(orderRef, { items, lastUpdate: Timestamp.now() });
        toast({ title: "Lançamento atualizado!" });
        setEditEntryModalOpen(false);
        setEditingEntry(null);
        setIsBillingLoading(true);
        const refreshed = await fetchOrdersForBilling();
        setBillingData(refreshed);
      } catch (e) {
        toast({ variant: "destructive", title: "Erro ao editar" });
      } finally {
        setIsBillingLoading(false);
      }
    };

    const exportBillingPdf = async () => {
      try {
        const docPdf = new jsPDF({ orientation: "portrait" });
        const pageWidth = docPdf.internal.pageSize.width;
        let yPos = 15;

        docPdf.setFontSize(16).setFont("helvetica", "bold");
        docPdf.text("RELATÓRIO DE FATURAMENTO", pageWidth / 2, yPos, { align: "center" });
        yPos += 8;
        docPdf.setFontSize(10).setFont("helvetica", "normal");
        docPdf.text(`Gerado em: ${format(new Date(), "dd/MM/yyyy HH:mm")} | Pedidos em aberto`, pageWidth / 2, yPos, { align: "center" });
        yPos += 10;

        autoTable(docPdf, {
          startY: yPos,
          head: [["Total dos Pedidos", "Faturado", "Falta Faturar", "% Concluído"]],
          body: [[
            summary.total.toLocaleString("pt-BR", { style: "currency", currency: "BRL" }),
            summary.billed.toLocaleString("pt-BR", { style: "currency", currency: "BRL" }),
            summary.remaining.toLocaleString("pt-BR", { style: "currency", currency: "BRL" }),
            `${summary.pct.toFixed(1)}%`,
          ]],
          styles: { fontSize: 9 },
          headStyles: { fillColor: [37, 99, 235] },
          theme: "grid",
        });
        yPos = (docPdf as any).lastAutoTable.finalY + 10;

        for (const order of billingData) {
          const base = order.manualTotalValue > 0 ? order.manualTotalValue : order.totalValue;
          const remaining = Math.max(0, base - order.billedValue);
          const pct = base > 0 ? Math.min(100, (order.billedValue / base) * 100) : 0;

          docPdf.setFontSize(11).setFont("helvetica", "bold");
          docPdf.text(`OS: ${order.internalOS} | ${order.customerName}`, 14, yPos);
          yPos += 5;

          autoTable(docPdf, {
            startY: yPos,
            head: [["Status", "Valor Total Pedido", "Faturado", "Falta Faturar", "% Faturado"]],
            body: [[
              order.status,
              base > 0 ? base.toLocaleString("pt-BR", { style: "currency", currency: "BRL" }) : "Não informado",
              order.billedValue.toLocaleString("pt-BR", { style: "currency", currency: "BRL" }),
              remaining.toLocaleString("pt-BR", { style: "currency", currency: "BRL" }),
              `${pct.toFixed(1)}%`,
            ]],
            styles: { fontSize: 8 },
            headStyles: { fillColor: [37, 99, 235] },
            columnStyles: {
              0: { cellWidth: 30 },
              1: { cellWidth: 35, halign: "right" },
              2: { cellWidth: 35, halign: "right" },
              3: { cellWidth: 35, halign: "right" },
              4: { cellWidth: 20, halign: "center" },
            },
            margin: { left: 14, right: 14 },
            theme: "grid",
          });
          yPos = (docPdf as any).lastAutoTable.finalY + 4;

          const rows = order.items.map((it: any) => {
            const itBase = it.totalValue > 0 ? it.totalValue : 0;
            const itRemaining = Math.max(0, itBase - it.billedValue);
            return [
              it.description.substring(0, 38),
              it.quantity,
              it.billedQuantity,
              it.remainingQuantity,
              it.lastUnitPrice > 0
                ? it.lastUnitPrice.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })
                : "-",
              it.billedValue.toLocaleString("pt-BR", { style: "currency", currency: "BRL" }),
              itRemaining > 0
                ? itRemaining.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })
                : "R$ 0,00",
            ];
          });

          autoTable(docPdf, {
            startY: yPos,
            head: [["Item", "Qtd", "Fat.", "Saldo", "Vlr Unit.", "Vlr Faturado", "Vlr Pendente"]],
            body: rows,
            styles: { fontSize: 7 },
            headStyles: { fillColor: [100, 116, 139] },
            columnStyles: {
              0: { cellWidth: 50 },
              1: { cellWidth: 10, halign: "center" },
              2: { cellWidth: 10, halign: "center" },
              3: { cellWidth: 10, halign: "center" },
              4: { cellWidth: 25, halign: "right" },
              5: { cellWidth: 25, halign: "right" },
              6: { cellWidth: 25, halign: "right" },
            },
            margin: { left: 14, right: 14 },
            didParseCell: (data) => {
              if (data.column.index === 6 && data.section === 'body') {
                const val = data.cell.raw as string;
                if (val !== 'R$ 0,00') {
                  data.cell.styles.textColor = [234, 88, 12];
                  data.cell.styles.fontStyle = 'bold';
                }
              }
              if (data.column.index === 5 && data.section === 'body') {
                data.cell.styles.textColor = [21, 128, 61];
              }
            }
          });

          yPos = (docPdf as any).lastAutoTable.finalY + 10;
          if (yPos > 260) { docPdf.addPage(); yPos = 15; }
        }

        const grandTotal = billingData.reduce((s: number, o: any) => s + (o.manualTotalValue > 0 ? o.manualTotalValue : o.totalValue), 0);
        const grandBilled = billingData.reduce((s: number, o: any) => s + o.billedValue, 0);
        const grandRemaining = Math.max(0, grandTotal - grandBilled);

        autoTable(docPdf, {
          startY: yPos,
          head: [["CONSOLIDADO GERAL", "", ""]],
          body: [
            ["Total dos Pedidos", "", grandTotal > 0 ? grandTotal.toLocaleString("pt-BR", { style: "currency", currency: "BRL" }) : "Valores não informados"],
            ["Total Faturado", "", grandBilled.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })],
            ["Total Pendente", "", grandRemaining.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })],
            ["% Faturado", "", grandTotal > 0 ? `${((grandBilled / grandTotal) * 100).toFixed(1)}%` : "N/A"],
          ],
          styles: { fontSize: 9 },
          headStyles: { fillColor: [37, 99, 235] },
          columnStyles: { 0: { cellWidth: 60, fontStyle: 'bold' }, 1: { cellWidth: 60 }, 2: { cellWidth: 60, halign: 'right' } },
          margin: { left: 14, right: 14 },
        });

        docPdf.save(`Relatorio_Faturamento_${format(new Date(), "yyyyMMdd_HHmm")}.pdf`);
        toast({ title: "PDF exportado com sucesso!" });
      } catch (error) {
        toast({ variant: "destructive", title: "Erro ao exportar PDF" });
      }
    };

    return (
      <div className="space-y-4">
        <Card>
          <CardHeader>
            <CardTitle>Faturamento — Pedidos em Aberto</CardTitle>
            <CardDescription>Pedidos ativos com controle de faturamento por item</CardDescription>
          </CardHeader>
          <CardContent className="flex items-center gap-4">
            <Button variant="outline" onClick={exportBillingPdf} disabled={isBillingLoading || !billingData.length}>
              <Download className="w-4 h-4 mr-2" /> Exportar PDF
            </Button>
            <Button
              variant="outline"
              onClick={async () => {
                setIsBillingLoading(true);
                try {
                  const data = await fetchOrdersForBilling();
                  setBillingData(data);
                } finally {
                  setIsBillingLoading(false);
                }
              }}
            >
              🔄 Recarregar
            </Button>
          </CardContent>
        </Card>

        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          <StatCard title="Total dos Pedidos" value={summary.total.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })} icon={DollarSign} description="Valor total em aberto" />
          <StatCard title="Faturado" value={summary.billed.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })} icon={CheckCircle} description="Total já faturado" />
          <StatCard title="Falta Faturar" value={summary.remaining.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })} icon={AlertTriangle} description="Saldo pendente" />
          <StatCard title="% Concluído" value={`${summary.pct.toFixed(1)}%`} icon={Target} description="Faturado / Total" />
        </div>

        {isBillingLoading ? (
          <Card>
            <CardContent className="p-6 space-y-3">
              <Skeleton className="h-8 w-full" />
              <Skeleton className="h-8 w-full" />
              <Skeleton className="h-8 w-full" />
            </CardContent>
          </Card>
        ) : billingData.length ? (
          <div className="space-y-3">
            {billingData.map((order: any) => (
              <Card key={order.id} className="overflow-hidden">
                <div className="p-4 border-b">
                  <div
                    className="flex items-center justify-between cursor-pointer"
                    onClick={() => setExpandedOrderId(expandedOrderId === order.id ? null : order.id)}
                  >
                    <div className="flex items-center gap-3">
                      <div>
                        <div className="font-bold text-base">OS: {order.internalOS}</div>
                        <div className="text-sm text-muted-foreground">{order.customerName}</div>
                      </div>
                      <Badge variant="outline">{order.status}</Badge>
                      {order.deliveryDate && (
                        <span className="text-xs text-muted-foreground">
                          Entrega: {format(order.deliveryDate, 'dd/MM/yyyy')}
                        </span>
                      )}
                    </div>
                    <span className="text-muted-foreground text-lg">{expandedOrderId === order.id ? '▲' : '▼'}</span>
                  </div>

                  {(() => {
                    const base = order.manualTotalValue > 0 ? order.manualTotalValue : 0;
                    const pct = base > 0 ? Math.min(100, (order.billedValue / base) * 100) : 0;
                    const remaining = base > 0 ? Math.max(0, base - order.billedValue) : 0;

                    return (
                      <div className="mt-3 flex items-center gap-4 flex-wrap">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium text-muted-foreground">Valor do Pedido:</span>
                          {editingOrderTotal === order.id ? (
                            <Input
                              type="number"
                              step="0.01"
                              className="h-7 w-36 text-sm"
                              value={orderTotalValues[order.id] ?? ''}
                              onChange={e => setOrderTotalValues(p => ({ ...p, [order.id]: e.target.value }))}
                              autoFocus
                              onBlur={async () => {
                                setEditingOrderTotal(null);
                                const val = Number(orderTotalValues[order.id]) || 0;
                                try {
                                  await updateDoc(doc(db, "companies", "mecald", "orders", order.id), {
                                    billingTotalValue: val
                                  });
                                  setBillingData(prev => prev.map(o =>
                                    o.id === order.id
                                      ? {
                                          ...o,
                                          manualTotalValue: val,
                                          totalValue: val,
                                          remainingValue: Math.max(0, val - o.billedValue),
                                          billingPct: val > 0 ? Math.min(100, (o.billedValue / val) * 100) : 0,
                                        }
                                      : o
                                  ));
                                } catch (e) {
                                  console.error(e);
                                }
                              }}
                            />
                          ) : (
                            <button
                              className="flex items-center gap-1 text-sm font-semibold hover:text-primary transition-colors"
                              onClick={(e) => {
                                e.stopPropagation();
                                setEditingOrderTotal(order.id);
                                setOrderTotalValues(p => ({ ...p, [order.id]: String(order.manualTotalValue || '') }));
                              }}
                            >
                              {order.manualTotalValue > 0
                                ? order.manualTotalValue.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
                                : <span className="text-orange-500 italic text-xs">⚠ Informar valor total do pedido</span>
                              }
                              <Edit className="h-3 w-3 ml-1 text-muted-foreground" />
                            </button>
                          )}
                        </div>

                        <div className="h-4 w-px bg-border" />

                        <div className="flex items-center gap-1">
                          <CheckCircle className="h-4 w-4 text-green-600" />
                          <span className="text-sm text-muted-foreground">Faturado:</span>
                          <span className="text-sm font-bold text-green-600">
                            {order.billedValue.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                          </span>
                        </div>

                        {base > 0 ? (
                          <div className="flex items-center gap-1">
                            <AlertTriangle className="h-4 w-4 text-orange-500" />
                            <span className="text-sm text-muted-foreground">Falta faturar:</span>
                            <span className="text-sm font-bold text-orange-600">
                              {remaining.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                            </span>
                          </div>
                        ) : (
                          <span className="text-xs text-muted-foreground italic">
                            Informe o valor total para calcular o pendente
                          </span>
                        )}

                        <div className="flex items-center gap-2 ml-auto">
                          {base > 0 ? (
                            <>
                              <span className="text-xs font-medium">{pct.toFixed(0)}%</span>
                              <Progress value={pct} className="w-24 h-2" />
                            </>
                          ) : (
                            <span className="text-xs text-muted-foreground">— %</span>
                          )}
                        </div>
                      </div>
                    );
                  })()}
                </div>

                {expandedOrderId === order.id && (
                  <div className="border-t">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Item</TableHead>
                          <TableHead className="text-right">Qtd Total</TableHead>
                          <TableHead className="text-right">Faturado</TableHead>
                          <TableHead className="text-right">Saldo</TableHead>
                          <TableHead className="text-right">Vlr Unit.</TableHead>
                          <TableHead className="text-right">Vlr Faturado</TableHead>
                          <TableHead className="text-right">Vlr Pendente</TableHead>
                          <TableHead>Nº Item</TableHead>
                          <TableHead>NF / Embarque</TableHead>
                          <TableHead className="text-center">Ação</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {order.items.map((item: any) => (
                          <TableRow key={item.id}>
                            <TableCell className="max-w-[200px] truncate">{item.description}</TableCell>
                            <TableCell className="text-right">{item.quantity}</TableCell>
                            <TableCell className="text-right text-green-600 font-medium">{item.billedQuantity}</TableCell>
                            <TableCell className="text-right text-orange-600 font-medium">{item.remainingQuantity}</TableCell>
                            <TableCell className="text-right">{item.lastUnitPrice.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</TableCell>
                            <TableCell className="text-right text-green-600">{item.billedValue.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</TableCell>
                            <TableCell className="text-right text-orange-600">{item.remainingValue.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</TableCell>
                            <TableCell className="text-sm">
                              {item.itemNumber
                                ? <Badge variant="outline" className="text-xs">{item.itemNumber}</Badge>
                                : <span className="text-muted-foreground">-</span>
                              }
                            </TableCell>
                            <TableCell className="text-xs">
                              {item.billingEntries?.length > 0 ? (
                                <div className="space-y-0.5">
                                  {item.billingEntries.slice(-1).map((entry: any) => (
                                    <div key={entry.id}>
                                      {entry.invoiceNumber && (
                                        <div className="text-green-600 font-medium">NF: {entry.invoiceNumber}</div>
                                      )}
                                      {entry.shippingDate && (
                                        <div className="text-orange-600">{format(entry.shippingDate, 'dd/MM/yy')}</div>
                                      )}
                                    </div>
                                  ))}
                                  {item.billingEntries.length > 1 && (
                                    <div className="text-muted-foreground">+{item.billingEntries.length - 1} lançamento(s)</div>
                                  )}
                                </div>
                              ) : (
                                <span className="text-muted-foreground">-</span>
                              )}
                            </TableCell>
                            <TableCell className="text-center">
                              {item.remainingQuantity > 0 ? (
                                <Button size="sm" variant="outline" onClick={() => handleOpenBillingModal(order, item)}>
                                  <Plus className="h-3 w-3 mr-1" /> Lançar
                                </Button>
                              ) : (
                                <Badge className="bg-green-600 text-white text-xs">100%</Badge>
                              )}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>

                    {order.items.some((it: any) => it.billingEntries?.length > 0) && (
                      <div className="p-4 bg-muted/30 border-t">
                        <p className="text-sm font-medium mb-2">Histórico de lançamentos:</p>
                        {order.items.filter((it: any) => it.billingEntries?.length > 0).map((item: any) => (
                          <div key={item.id} className="mb-2">
                            <p className="text-xs text-muted-foreground font-medium">{item.description}</p>
                            <div className="space-y-1 mt-1">
                              {item.billingEntries.map((entry: any) => (
                                <div key={entry.id} className="flex items-center gap-3 text-xs bg-background rounded p-2 flex-wrap">
                                  <span className="text-muted-foreground">{format(entry.date, 'dd/MM/yyyy')}</span>
                                  {entry.itemNumber && (
                                    <span className="bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded font-medium">
                                      Item: {entry.itemNumber}
                                    </span>
                                  )}
                                  <span>Qtd: <strong>{entry.quantity}</strong></span>
                                  <span>Unit.: <strong>{(entry.unitPrice || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</strong></span>
                                  {entry.invoiceNumber && (
                                    <span className="bg-green-100 text-green-700 px-1.5 py-0.5 rounded font-medium">
                                      NF: {entry.invoiceNumber}
                                    </span>
                                  )}
                                  {entry.shippingDate && (
                                    <span className="bg-orange-100 text-orange-700 px-1.5 py-0.5 rounded font-medium">
                                      Embarque: {format(entry.shippingDate, 'dd/MM/yyyy')}
                                    </span>
                                  )}
                                  <span className="text-green-600 font-medium">
                                    {entry.value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                                  </span>
                                  {entry.notes && <span className="text-muted-foreground italic">{entry.notes}</span>}
                                  <button
                                    className="ml-auto text-blue-500 hover:text-blue-700 flex items-center gap-1"
                                    onClick={() => {
                                      setEditingEntry({ orderId: order.id, itemId: item.id, entry });
                                      setEditEntryForm({
                                        quantity: String(entry.quantity),
                                        unitPrice: String(entry.unitPrice || 0),
                                        invoiceNumber: entry.invoiceNumber || '',
                                        notes: entry.notes || '',
                                        itemNumber: entry.itemNumber || '',
                                        shippingDate: entry.shippingDate
                                          ? format(entry.shippingDate instanceof Date
                                              ? entry.shippingDate
                                              : entry.shippingDate?.toDate?.() || new Date(entry.shippingDate),
                                            'yyyy-MM-dd')
                                          : '',
                                      });
                                      setEditEntryModalOpen(true);
                                    }}
                                  >
                                    <Edit className="h-3 w-3" /> Editar
                                  </button>
                                </div>
                              ))}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </Card>
            ))}
          </div>
        ) : (
          <Card>
            <CardContent className="p-6 text-center text-muted-foreground">
              Nenhum pedido em aberto encontrado.
            </CardContent>
          </Card>
        )}

        <Dialog open={billingModalOpen} onOpenChange={setBillingModalOpen}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <DollarSign className="h-5 w-5" /> Lançar Faturamento
              </DialogTitle>
              <DialogDescription>
                {selectedItemForBilling && (
                  <>
                    <strong>{selectedItemForBilling.description}</strong><br />
                    Saldo disponível: <strong>{selectedItemForBilling.remainingQuantity}</strong> unid.
                  </>
                )}
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-2">
              <div className="space-y-2">
                <Label>Valor Unitário (R$) *</Label>
                <Input
                  type="number"
                  step="0.01"
                  min="0"
                  value={newEntry.unitPrice}
                  onChange={e => setNewEntry(p => ({ ...p, unitPrice: e.target.value }))}
                  placeholder="Ex: 1500.00"
                />
                <p className="text-xs text-muted-foreground">
                  Informe o valor unitário do item neste faturamento
                </p>
              </div>
              <div className="space-y-2">
                <Label>Quantidade Faturada *</Label>
                <Input
                  type="number"
                  min="1"
                  max={selectedItemForBilling?.remainingQuantity}
                  value={newEntry.quantity}
                  onChange={e => setNewEntry(p => ({ ...p, quantity: e.target.value }))}
                  placeholder={`Máx: ${selectedItemForBilling?.remainingQuantity}`}
                />
              </div>
              <div className="space-y-2">
                <Label>Número do Item</Label>
                <Input
                  value={newEntry.itemNumber}
                  onChange={e => setNewEntry(p => ({ ...p, itemNumber: e.target.value }))}
                  placeholder="Ex: 001, A-01, etc."
                />
                <p className="text-xs text-muted-foreground">
                  Referência do item no pedido de compra do cliente
                </p>
              </div>
              <div className="space-y-2">
                <Label>Valor Total do Pedido (R$)</Label>
                <Input
                  type="number"
                  step="0.01"
                  min="0"
                  value={newEntry.totalOrderValue}
                  onChange={e => setNewEntry(p => ({ ...p, totalOrderValue: e.target.value }))}
                  placeholder="Ex: 45000.00 (opcional)"
                />
                <p className="text-xs text-muted-foreground">
                  Referência do valor total do pedido para controle
                </p>
              </div>
              <div className="space-y-2">
                <Label>Nº da Nota Fiscal</Label>
                <Input value={newEntry.invoiceNumber} onChange={e => setNewEntry(p => ({ ...p, invoiceNumber: e.target.value }))} placeholder="Ex: 001234" />
              </div>
              <div className="space-y-2">
                <Label>Data de Embarque</Label>
                <Input
                  type="date"
                  value={newEntry.shippingDate}
                  onChange={e => setNewEntry(p => ({ ...p, shippingDate: e.target.value }))}
                />
              </div>
              <div className="space-y-2">
                <Label>Observações</Label>
                <Input value={newEntry.notes} onChange={e => setNewEntry(p => ({ ...p, notes: e.target.value }))} placeholder="Opcional" />
              </div>
              {newEntry.quantity && newEntry.unitPrice &&
                Number(newEntry.quantity) > 0 && Number(newEntry.unitPrice) > 0 && (
                <div className="p-3 bg-muted rounded-lg space-y-1 text-sm">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Qtd × Vlr Unit.:</span>
                    <span className="font-bold text-green-600">
                      {(Number(newEntry.quantity) * Number(newEntry.unitPrice))
                        .toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                    </span>
                  </div>
                  {newEntry.totalOrderValue && Number(newEntry.totalOrderValue) > 0 && (
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">% do pedido total:</span>
                      <span className="font-medium">
                        {((Number(newEntry.quantity) * Number(newEntry.unitPrice) / Number(newEntry.totalOrderValue)) * 100).toFixed(1)}%
                      </span>
                    </div>
                  )}
                </div>
              )}
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setBillingModalOpen(false)}>Cancelar</Button>
              <Button onClick={handleSaveBillingEntry} disabled={!newEntry.quantity || !newEntry.unitPrice || isSavingEntry}>
                {isSavingEntry ? (
                  <>
                    <div className="w-4 h-4 mr-2 animate-spin rounded-full border-2 border-white border-t-transparent" />
                    Salvando...
                  </>
                ) : (
                  <>
                    <Save className="w-4 h-4 mr-2" />
                    Confirmar
                  </>
                )}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
        <Dialog open={editEntryModalOpen} onOpenChange={setEditEntryModalOpen}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Edit className="h-5 w-5" /> Editar Lançamento
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-4 py-2">
              <div className="space-y-2">
                <Label>Valor Unitário (R$) *</Label>
                <Input
                  type="number"
                  step="0.01"
                  min="0"
                  value={editEntryForm.unitPrice}
                  onChange={e => setEditEntryForm(p => ({ ...p, unitPrice: e.target.value }))}
                />
              </div>
              <div className="space-y-2">
                <Label>Quantidade *</Label>
                <Input
                  type="number"
                  min="1"
                  value={editEntryForm.quantity}
                  onChange={e => setEditEntryForm(p => ({ ...p, quantity: e.target.value }))}
                />
              </div>
              <div className="space-y-2">
                <Label>Nº da Nota Fiscal</Label>
                <Input
                  value={editEntryForm.invoiceNumber}
                  onChange={e => setEditEntryForm(p => ({ ...p, invoiceNumber: e.target.value }))}
                />
              </div>
              <div className="space-y-2">
                <Label>Número do Item</Label>
                <Input
                  value={editEntryForm.itemNumber}
                  onChange={e => setEditEntryForm(p => ({ ...p, itemNumber: e.target.value }))}
                  placeholder="Ex: 001"
                />
              </div>
              <div className="space-y-2">
                <Label>Data de Embarque</Label>
                <Input
                  type="date"
                  value={editEntryForm.shippingDate}
                  onChange={e => setEditEntryForm(p => ({ ...p, shippingDate: e.target.value }))}
                />
              </div>
              <div className="space-y-2">
                <Label>Observações</Label>
                <Input
                  value={editEntryForm.notes}
                  onChange={e => setEditEntryForm(p => ({ ...p, notes: e.target.value }))}
                />
              </div>
              {editEntryForm.quantity && editEntryForm.unitPrice && (
                <div className="p-3 bg-muted rounded-lg text-sm flex justify-between">
                  <span className="text-muted-foreground">Valor calculado:</span>
                  <span className="font-bold text-green-600">
                    {(Number(editEntryForm.quantity) * Number(editEntryForm.unitPrice))
                      .toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                  </span>
                </div>
              )}
            </div>
            <DialogFooter>
              <Button variant="destructive" className="mr-auto" onClick={handleDeleteBillingEntry}>
                <X className="h-4 w-4 mr-1" /> Excluir
              </Button>
              <Button variant="outline" onClick={() => setEditEntryModalOpen(false)}>Cancelar</Button>
              <Button onClick={handleUpdateBillingEntry}>
                <Save className="h-4 w-4 mr-2" /> Salvar
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    );
  };

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

      <div className="flex border-b mb-4">
        <button
          onClick={() => setActiveTab('financeiro')}
          className={`px-4 py-2 -mb-px ${activeTab === 'financeiro' ? 'border-b-2 border-primary font-medium' : 'text-muted-foreground'}`}
        >
          Relatório Financeiro
        </button>
        <button
          onClick={() => setActiveTab('faturamento')}
          className={`px-4 py-2 -mb-px ${activeTab === 'faturamento' ? 'border-b-2 border-primary font-medium' : 'text-muted-foreground'}`}
        >
          Faturamento do Mês
        </button>
      </div>

      {activeTab === 'financeiro' && (
        <>
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

          {/* Modal de Lançamento de Receita Manual */}
          <Dialog open={isRevenueModalOpen} onOpenChange={setIsRevenueModalOpen}>
            <DialogContent className="sm:max-w-[600px]">
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <DollarSign className="h-5 w-5" />
                  Lançamento Manual de Receita
                </DialogTitle>
                <DialogDescription>
                  {selectedOrderForRevenue ? (
                    <>
                      Insira os dados de receita para a OS <strong>{selectedOrderForRevenue.internalOS}</strong>
                      {selectedOrderForRevenue.manualRevenue && (
                        <span className="block text-sm text-blue-600 mt-1">
                          💡 Esta OS já possui receita manual cadastrada. Os valores serão atualizados.
                        </span>
                      )}
                    </>
                  ) : (
                    'Carregando dados da OS...'
                  )}
                </DialogDescription>
              </DialogHeader>
              
              <div className="space-y-6">
                {/* Campo de Receita Bruta */}
                <div className="space-y-2">
                  <Label htmlFor="grossRevenue">Receita Bruta Total</Label>
                  <Input
                    id="grossRevenue"
                    type="number"
                    step="0.01"
                    min="0"
                    value={manualGrossRevenue}
                    onChange={(e) => setManualGrossRevenue(e.target.value)}
                    placeholder="Ex: 15000.00"
                    className="text-lg font-medium"
                  />
                  <p className="text-xs text-muted-foreground">
                    Valor total da receita antes dos impostos
                  </p>
                </div>

                {/* Toggle para modo de entrada de impostos */}
                <div className="space-y-3">
                  <Label>Forma de Cálculo dos Impostos</Label>
                  <div className="flex items-center space-x-4">
                    <Button
                      type="button"
                      variant={usePercentage ? "outline" : "default"}
                      size="sm"
                      onClick={() => setUsePercentage(false)}
                      className="flex items-center gap-2"
                    >
                      <DollarSign className="h-4 w-4" />
                      Valor em Reais
                    </Button>
                    <Button
                      type="button"
                      variant={usePercentage ? "default" : "outline"}
                      size="sm"
                      onClick={() => setUsePercentage(true)}
                      className="flex items-center gap-2"
                    >
                      <Calculator className="h-4 w-4" />
                      Percentual
                    </Button>
                  </div>
                </div>

                {/* Campos de impostos baseados no modo selecionado */}
                <div className="grid grid-cols-2 gap-4">
                  {usePercentage ? (
                    <>
                      <div className="space-y-2">
                        <Label htmlFor="taxRate">Percentual de Impostos (%)</Label>
                        <Input
                          id="taxRate"
                          type="number"
                          step="0.01"
                          min="0"
                          max="100"
                          value={manualTaxRate}
                          onChange={(e) => setManualTaxRate(e.target.value)}
                          placeholder="Ex: 18.50"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="taxAmount">Valor dos Impostos (R$)</Label>
                        <Input
                          id="taxAmount"
                          type="number"
                          value={manualTaxAmount}
                          readOnly
                          className="bg-muted"
                          placeholder="Calculado automaticamente"
                        />
                      </div>
                    </>
                  ) : (
                    <>
                      <div className="space-y-2">
                        <Label htmlFor="taxAmount">Valor dos Impostos (R$)</Label>
                        <Input
                          id="taxAmount"
                          type="number"
                          step="0.01"
                          min="0"
                          value={manualTaxAmount}
                          onChange={(e) => setManualTaxAmount(e.target.value)}
                          placeholder="Ex: 2775.00"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="taxRate">Percentual Equivalente (%)</Label>
                        <Input
                          id="taxRate"
                          type="number"
                          value={manualTaxRate}
                          readOnly
                          className="bg-muted"
                          placeholder="Calculado automaticamente"
                        />
                      </div>
                    </>
                  )}
                </div>

                {/* Resumo dos valores */}
                {manualGrossRevenue && manualTaxAmount && (
                  <div className="border rounded-lg p-4 bg-muted/50">
                    <h4 className="font-medium mb-3">Resumo dos Valores</h4>
                    <div className="grid grid-cols-2 gap-4 text-sm">
                      <div>
                        <span className="text-muted-foreground">Receita Bruta:</span>
                        <p className="font-bold text-lg">
                          {parseFloat(manualGrossRevenue).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                        </p>
                      </div>
                      <div>
                        <span className="text-muted-foreground">Impostos:</span>
                        <p className="font-bold text-lg text-orange-600">
                          -{parseFloat(manualTaxAmount).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                        </p>
                      </div>
                      <div className="col-span-2">
                        <span className="text-muted-foreground">Receita Líquida:</span>
                        <p className="font-bold text-xl text-green-600">
                          {(parseFloat(manualGrossRevenue) - parseFloat(manualTaxAmount)).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                        </p>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              <DialogFooter>
                <Button variant="outline" onClick={handleCloseRevenueModal}>
                  <X className="w-4 h-4 mr-2" />
                  Cancelar
                </Button>
                <Button 
                  onClick={handleSaveManualRevenue}
                  disabled={!manualGrossRevenue || !manualTaxAmount || isSavingRevenue}
                >
                  {isSavingRevenue ? (
                    <>
                      <div className="w-4 h-4 mr-2 animate-spin rounded-full border-2 border-white border-t-transparent" />
                      Salvando...
                    </>
                  ) : (
                    <>
                      <Save className="w-4 h-4 mr-2" />
                      Salvar Receita
                    </>
                  )}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

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
                            {data.grossRevenue === 0 && (
                              <Badge variant="outline" className="bg-orange-50 text-orange-700 border-orange-300">
                                💰 Sem Receita
                              </Badge>
                            )}
                            {data.hasManualRevenue && (
                              <Badge variant="secondary" className="bg-blue-50 text-blue-700 border-blue-300">
                                📝 Manual
                              </Badge>
                            )}
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
                            <div className="flex gap-2">
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  const order = orders.find(o => o.id === data.id);
                                  if (order) {
                                    handleOpenRevenueModal(order);
                                  } else {
                                    toast({
                                      variant: "destructive",
                                      title: "Erro",
                                      description: "Não foi possível encontrar os dados da OS. Tente recarregar a página.",
                                    });
                                  }
                                }}
                                className="h-6 px-2 text-xs"
                              >
                                {data.grossRevenue === 0 ? (
                                  <>
                                    <Plus className="h-3 w-3 mr-1" />
                                    Lançar Receita
                                  </>
                                ) : (
                                  <>
                                    <Edit className="h-3 w-3 mr-1" />
                                    Editar Receita
                                  </>
                                )}
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  generateIndividualReport(data);
                                }}
                                className="h-6 px-2 text-xs text-blue-600 hover:text-blue-700 hover:bg-blue-50"
                              >
                                <Download className="h-3 w-3 mr-1" />
                                PDF
                              </Button>
                            </div>
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
                              {data.hasManualRevenue && (
                                <Badge variant="secondary" className="text-xs ml-2">
                                  📝 Receita Manual
                                </Badge>
                              )}
                              {data.manualRevenueInfo && (
                                <span className="text-xs text-muted-foreground ml-2">
                                  Atualizado: {format(data.manualRevenueInfo.lastUpdate, 'dd/MM/yyyy HH:mm')}
                                </span>
                              )}
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
                  {!searchTerm && statusFilter === 'all' && (
                    <Button
                      variant="outline"
                      onClick={loadData}
                      className="mt-4"
                    >
                      🔄 Recarregar Dados
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
          )}
        </>
      )}

      {activeTab === 'faturamento' && <BillingTab />}
    </div>
  );
}
