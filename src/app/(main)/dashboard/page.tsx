"use client";

import { useEffect, useState } from "react";
import { collection, getDocs, getDoc, doc, Timestamp } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAuth } from "../layout";
import { format, isValid } from "date-fns";
import { ptBR } from "date-fns/locale";
import { BarChart, Package, Percent, Truck, Wrench, AlertTriangle, CheckCircle, Scale, TrendingUp, Users } from "lucide-react";
import { StatCard } from "@/components/dashboard/stat-card";
import { CustomerAnalysis } from "@/components/dashboard/production-status";
import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

interface MonthlyData {
  month: string;
  weight: number;
}

interface CustomerData {
  name: string;
  shortName?: string;
  deliveredWeight: number;
  ncCount: number;
  onTimeItems: number;
  totalItems: number;
}

interface DashboardData {
  totalProducedWeight: number;
  totalToProduceWeight: number;
  onTimeDeliveryRate: number;
  geralNcRate: number;
  internalNcRate: number;
  monthlyProduction: MonthlyData[];
  customerAnalysis: CustomerData[];
  companyCapacity: {
    capacidadeInstalada?: number;
    metaMensal?: number;
  };
}

function safeParseDate(dateValue: any): Date | null {
  if (!dateValue) return null;
  
  try {
    if (dateValue instanceof Timestamp) {
      const date = dateValue.toDate();
      return isValid(date) ? date : null;
    }
    
    if (typeof dateValue === 'string' || typeof dateValue === 'number') {
      const date = new Date(dateValue);
      return isValid(date) ? date : null;
    }
    
    if (dateValue instanceof Date) {
      return isValid(dateValue) ? dateValue : null;
    }
    
    return null;
  } catch (error) {
    console.warn('Erro ao converter data:', dateValue, error);
    return null;
  }
}

function safeFormatMonth(dateValue: any): string | null {
  const date = safeParseDate(dateValue);
  if (!date) return null;
  
  try {
    return format(date, "yyyy-MM");
  } catch (error) {
    console.warn('Erro ao formatar mês:', dateValue, error);
    return null;
  }
}

function formatCustomerName(name: string): string {
  if (!name || name === "Desconhecido") return "Desconhecido";
  
  // Preservar acentos e caracteres especiais, apenas limpar espaços extras
  let formattedName = name
    .replace(/\s+/g, ' ') // Múltiplos espaços para um só
    .trim();

  // Aplicar capitalização mantendo acentos
  formattedName = formattedName
    .split(' ')
    .map(word => {
      if (!word) return '';
      
      const lowercase = ['da', 'de', 'do', 'das', 'dos', 'e', 'em', 'na', 'no', 'para', 'por', 'com', 'a', 'o', 'as', 'os'];
      
      if (lowercase.includes(word.toLowerCase())) {
        return word.toLowerCase();
      }
      
      return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
    })
    .filter(word => word.length > 0)
    .join(' ');

  // Correções específicas mantendo acentos
  formattedName = formattedName
    .replace(/\bLtda\b/gi, 'Ltda')
    .replace(/\bS\.?a\.?\b/gi, 'S.A.')
    .replace(/\bLlc\b/gi, 'LLC')
    .replace(/\bInc\b/gi, 'Inc')
    .replace(/\bBrasil\b/gi, 'Brasil')
    .replace(/\bMinas\s+Gerais\b/gi, 'Minas Gerais')
    .replace(/\bSao\s+Paulo\b/gi, 'São Paulo')
    .replace(/\bRio\s+de\s+Janeiro\b/gi, 'Rio de Janeiro')
    .replace(/\s*-\s*/g, ' - ')
    .replace(/\s*\/\s*/g, ' / ')
    .replace(/\s*\&\s*/g, ' & ');

  // Garantir que a primeira letra seja maiúscula
  if (formattedName.length > 0) {
    formattedName = formattedName.charAt(0).toUpperCase() + formattedName.slice(1);
  }

  return formattedName.trim();
}

function getShortCustomerName(fullName: string): string {
  if (!fullName || fullName === "Desconhecido") return "Desconhecido";
  
  if (fullName.length <= 25) return fullName;
  
  let shortName = fullName;
  
  shortName = shortName
    .replace(/\s+Ltda.*$/i, ' Ltda')
    .replace(/\s+S\.A\..*$/i, ' S.A.')
    .replace(/\s+-\s+.*$/i, '')
    .replace(/\s+\/\s+.*$/i, '');
  
  if (shortName.length > 25) {
    const words = shortName.split(' ');
    const importantWords = words.filter(word => 
      !['de', 'da', 'do', 'das', 'dos', 'e', 'em', 'na', 'no'].includes(word.toLowerCase())
    );
    
    if (importantWords.length > 2) {
      shortName = importantWords.slice(0, 2).join(' ');
      if (words.includes('Ltda')) shortName += ' Ltda';
    }
  }
  
  return shortName.substring(0, 25).trim();
}

// Componente melhorado para gráfico de produção mensal
function ImprovedMonthlyProductionChart({ data, companyCapacity }: { 
  data: MonthlyData[]; 
  companyCapacity: { capacidadeInstalada?: number; metaMensal?: number; }; 
}) {
  const maxValue = Math.max(
    ...data.map(d => d.weight),
    companyCapacity.metaMensal || 0,
    companyCapacity.capacidadeInstalada || 0
  );

  const currentMonth = new Date().getMonth();
  const currentMonthName = format(new Date(), 'MMM', { locale: ptBR });
  const currentMonthData = data.find(d => d.month === currentMonthName);
  
  // Calcular métricas de performance
  const avgProduction = data.length > 0 ? data.reduce((acc, curr) => acc + curr.weight, 0) / data.length : 0;
  const metaAchievementRate = companyCapacity.metaMensal && currentMonthData 
    ? (currentMonthData.weight / companyCapacity.metaMensal) * 100 
    : 0;
  const capacityUtilization = companyCapacity.capacidadeInstalada && currentMonthData
    ? (currentMonthData.weight / companyCapacity.capacidadeInstalada) * 100
    : 0;

  return (
    <Card className="col-span-1">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <BarChart className="h-5 w-5" />
          Produção Mensal (Peso Entregue)
        </CardTitle>
        <CardDescription>
          Análise de produção com metas e capacidade instalada dos últimos 6 meses
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-6">
          {/* Métricas de Performance */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="text-center p-3 bg-muted/50 rounded-lg">
              <div className="text-lg font-bold text-primary">
                {avgProduction.toLocaleString('pt-BR', { maximumFractionDigits: 0 })} kg
              </div>
              <div className="text-xs text-muted-foreground">Média Mensal</div>
            </div>
            
            {companyCapacity.metaMensal && (
              <div className="text-center p-3 bg-muted/50 rounded-lg">
                <div className="text-lg font-bold text-green-600">
                  {metaAchievementRate.toFixed(1)}%
                </div>
                <div className="text-xs text-muted-foreground">Atingimento da Meta</div>
              </div>
            )}
            
            {companyCapacity.capacidadeInstalada && (
              <div className="text-center p-3 bg-muted/50 rounded-lg">
                <div className="text-lg font-bold text-blue-600">
                  {capacityUtilization.toFixed(1)}%
                </div>
                <div className="text-xs text-muted-foreground">Utilização da Capacidade</div>
              </div>
            )}
          </div>

          {/* Gráfico */}
          <div className="space-y-4">
            <div className="text-sm font-medium text-muted-foreground">
              PESO ENTREGUE POR MÊS (KG)
            </div>
            
            <div className="space-y-3">
              {data.map((item, index) => {
                const percentage = maxValue > 0 ? (item.weight / maxValue) * 100 : 0;
                const isCurrentMonth = item.month === currentMonthName;
                
                return (
                  <div key={item.month} className="space-y-2">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className={`text-sm font-medium min-w-[2rem] ${isCurrentMonth ? 'text-primary font-bold' : ''}`}>
                          {item.month}
                        </span>
                        {isCurrentMonth && (
                          <Badge variant="default" className="text-xs">
                            Atual
                          </Badge>
                        )}
                      </div>
                      <div className="text-right">
                        <span className="text-sm font-medium">
                          {item.weight.toLocaleString('pt-BR', { maximumFractionDigits: 0 })} kg
                        </span>
                        {companyCapacity.metaMensal && (
                          <div className="text-xs text-muted-foreground">
                            {((item.weight / companyCapacity.metaMensal) * 100).toFixed(0)}% da meta
                          </div>
                        )}
                      </div>
                    </div>
                    
                    <div className="relative">
                      {/* Barra principal de produção */}
                      <div className="w-full bg-secondary rounded-full h-4 relative overflow-hidden">
                        <div
                          className={`h-4 rounded-full transition-all duration-300 ${
                            isCurrentMonth ? 'bg-primary' : 'bg-primary/80'
                          }`}
                          style={{ width: `${Math.min(percentage, 100)}%` }}
                        />
                        
                        {/* Linha da meta mensal */}
                        {companyCapacity.metaMensal && maxValue > 0 && (
                          <div
                            className="absolute top-0 w-1 h-4 bg-green-600 z-10"
                            style={{ 
                              left: `${Math.min((companyCapacity.metaMensal / maxValue) * 100, 100)}%`,
                              transform: 'translateX(-50%)'
                            }}
                          />
                        )}
                        
                        {/* Linha da capacidade instalada */}
                        {companyCapacity.capacidadeInstalada && maxValue > 0 && (
                          <div
                            className="absolute top-0 w-1 h-4 bg-blue-600 z-10"
                            style={{ 
                              left: `${Math.min((companyCapacity.capacidadeInstalada / maxValue) * 100, 100)}%`,
                              transform: 'translateX(-50%)'
                            }}
                          />
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
            
            {/* Legenda */}
            <div className="flex flex-wrap gap-4 text-xs text-muted-foreground pt-4 border-t">
              <div className="flex items-center gap-1">
                <div className="w-3 h-3 bg-primary rounded" />
                <span>Produção Realizada</span>
              </div>
              {companyCapacity.metaMensal && (
                <div className="flex items-center gap-1">
                  <div className="w-1 h-3 bg-green-600" />
                  <span>Meta Mensal ({companyCapacity.metaMensal.toLocaleString('pt-BR')} kg)</span>
                </div>
              )}
              {companyCapacity.capacidadeInstalada && (
                <div className="flex items-center gap-1">
                  <div className="w-1 h-3 bg-blue-600" />
                  <span>Capacidade Instalada ({companyCapacity.capacidadeInstalada.toLocaleString('pt-BR')} kg)</span>
                </div>
              )}
            </div>

            {/* Análise de Gargalos */}
            {companyCapacity.capacidadeInstalada && companyCapacity.metaMensal && (
              <div className="pt-4 border-t">
                <h4 className="text-sm font-semibold mb-2">Análise de Gargalos:</h4>
                <div className="space-y-2 text-sm">
                  {currentMonthData && (
                    <>
                      <div className={`flex items-center gap-2 ${
                        capacityUtilization > 85 ? 'text-red-600' : 
                        capacityUtilization > 70 ? 'text-yellow-600' : 'text-green-600'
                      }`}>
                        <div className={`w-2 h-2 rounded-full ${
                          capacityUtilization > 85 ? 'bg-red-600' : 
                          capacityUtilization > 70 ? 'bg-yellow-600' : 'bg-green-600'
                        }`} />
                        <span>
                          Utilização da capacidade: {capacityUtilization.toFixed(1)}%
                          {capacityUtilization > 85 ? ' (Alta - possível gargalo)' : 
                           capacityUtilization > 70 ? ' (Moderada)' : ' (Baixa)'}
                        </span>
                      </div>
                      <div className={`flex items-center gap-2 ml-4 text-xs ${
                        metaAchievementRate >= 100 ? 'text-green-600' : 
                        metaAchievementRate >= 80 ? 'text-yellow-600' : 'text-red-600'
                      }`}>
                        Meta vs Realizado: {(companyCapacity.metaMensal - currentMonthData.weight) >= 0 
                          ? `Faltam ${(companyCapacity.metaMensal - currentMonthData.weight).toLocaleString('pt-BR')} kg para a meta`
                          : `Meta superada em ${(currentMonthData.weight - companyCapacity.metaMensal).toLocaleString('pt-BR')} kg`
                        }
                      </div>
                    </>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
function ImprovedCustomerAnalysis({ data }: { data: CustomerData[] }) {
  const topCustomers = data.slice(0, 5);
  
  return (
    <Card className="col-span-1">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Users className="h-5 w-5" />
          Análise por Cliente
        </CardTitle>
        <CardDescription>
          Principais clientes por peso entregue e performance de qualidade
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Top 5 Clientes por Peso */}
        <div>
          <h4 className="text-sm font-semibold mb-3 text-muted-foreground">
            TOP 5 CLIENTES POR PESO ENTREGUE
          </h4>
          <div className="space-y-3">
            {topCustomers.map((customer, index) => (
              <div key={customer.name} className="space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex-1 min-w-0 pr-2">
                    <p className="text-sm font-medium break-words leading-tight" title={customer.name}>
                      {customer.name}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {customer.deliveredWeight.toLocaleString('pt-BR', { 
                        minimumFractionDigits: 0, 
                        maximumFractionDigits: 0 
                      })} kg
                    </p>
                  </div>
                  <Badge variant="secondary" className="ml-2 flex-shrink-0">
                    #{index + 1}
                  </Badge>
                </div>
                <div className="w-full bg-secondary rounded-full h-2">
                  <div
                    className="bg-primary h-2 rounded-full transition-all duration-300"
                    style={{
                      width: `${Math.min((customer.deliveredWeight / Math.max(...topCustomers.map(c => c.deliveredWeight))) * 100, 100)}%`
                    }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Tabela de Performance */}
        <div>
          <h4 className="text-sm font-semibold mb-3 text-muted-foreground">
            PERFORMANCE DE ENTREGA E QUALIDADE
          </h4>
          <div className="space-y-2">
            {/* Header */}
            <div className="grid grid-cols-12 gap-2 text-xs font-medium text-muted-foreground pb-2 border-b">
              <div className="col-span-6">Cliente</div>
              <div className="col-span-3 text-center">Prazo</div>
              <div className="col-span-3 text-center">NC</div>
            </div>
            
            {/* Data rows */}
            {topCustomers.map((customer) => {
              const onTimeRate = customer.totalItems > 0 
                ? (customer.onTimeItems / customer.totalItems) * 100 
                : 0;
              const ncRate = customer.totalItems > 0 
                ? (customer.ncCount / customer.totalItems) * 100 
                : 0;
              
              return (
                <div key={customer.name} className="grid grid-cols-12 gap-2 text-xs py-2 hover:bg-muted/50 rounded-sm">
                  <div className="col-span-6 break-words leading-tight pr-1" title={customer.name}>
                    {customer.name}
                  </div>
                  <div className="col-span-3 text-center">
                    <Badge 
                      variant={onTimeRate >= 90 ? "default" : onTimeRate >= 70 ? "secondary" : "destructive"}
                      className="text-xs"
                    >
                      {onTimeRate.toFixed(0)}%
                    </Badge>
                  </div>
                  <div className="col-span-3 text-center">
                    <Badge 
                      variant={ncRate <= 5 ? "default" : ncRate <= 15 ? "secondary" : "destructive"}
                      className="text-xs"
                    >
                      {ncRate.toFixed(1)}%
                    </Badge>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Resumo */}
        <div className="pt-4 border-t">
          <div className="grid grid-cols-2 gap-4 text-center">
            <div>
              <p className="text-2xl font-bold">{data.length}</p>
              <p className="text-xs text-muted-foreground">Clientes Ativos</p>
            </div>
            <div>
              <p className="text-2xl font-bold">
                {data.reduce((acc, c) => acc + c.deliveredWeight, 0).toLocaleString('pt-BR', {
                  minimumFractionDigits: 0,
                  maximumFractionDigits: 0
                })}
              </p>
              <p className="text-xs text-muted-foreground">kg Total</p>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export default function DashboardPage() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const { user, loading: authLoading } = useAuth();

  useEffect(() => {
    if (user && !authLoading) {
      const fetchData = async () => {
        setIsLoading(true);
        try {
          const [ordersSnapshot, qualitySnapshot, companySnapshot] = await Promise.all([
            getDocs(collection(db, "companies", "mecald", "orders")),
            getDocs(collection(db, "companies", "mecald", "qualityReports")),
            getDoc(doc(db, "companies", "mecald", "settings", "company"))
          ]);

          // Buscar dados de capacidade da empresa
          let companyCapacity = {};
          if (companySnapshot.exists()) {
            const companyData = companySnapshot.data();
            companyCapacity = {
              capacidadeInstalada: companyData.capacidadeInstalada,
              metaMensal: companyData.metaMensal,
            };
          }

          // ✅ MAPAS SEPARADOS PARA CADA MÉTRICA
          const monthlyDeliveredMap = new Map<string, number>(); // Peso ENTREGUE (shippingDate)
          const customerDataMap = new Map<string, { 
            deliveredWeight: number; 
            ncCount: number; 
            onTimeItems: number; 
            totalItems: number 
          }>();

          let totalProducedWeight = 0;  // Total produzido (100% concluído)
          let totalToProduceWeight = 0;  // Total a produzir (todos os itens)
          let totalShippedItems = 0;     // Itens embarcados
          let totalOnTimeItems = 0;      // Itens no prazo

          ordersSnapshot.forEach(doc => {
            const order = doc.data();
            
            const rawCustomerName = order.customer?.name || order.customerName || "Desconhecido";
            const customerName = formatCustomerName(rawCustomerName);
            
            if (!customerDataMap.has(customerName)) {
              customerDataMap.set(customerName, { 
                deliveredWeight: 0, 
                ncCount: 0, 
                onTimeItems: 0, 
                totalItems: 0 
              });
            }
            const customerEntry = customerDataMap.get(customerName)!;

            if (order.items && Array.isArray(order.items)) {
              order.items.forEach((item: any) => {
                // ✅ CALCULAR MÉTRICAS CORRETAMENTE
                const itemWeight = (item.quantity || 0) * (item.unitWeight || 0);
                totalToProduceWeight += itemWeight;

                // ✅ 1. PESO PRODUZIDO (100% concluído)
                const isItemCompleted = item.productionPlan?.length > 0
                  ? item.productionPlan.every((p: any) => p.status === 'Concluído')
                  : false;

                if (isItemCompleted) {
                  totalProducedWeight += itemWeight;
                }

                // ✅ 2. PESO ENTREGUE POR MÊS (baseado em shippingDate + item concluído)
                if (item.shippingDate && isItemCompleted) {
                  const shippingDate = safeParseDate(item.shippingDate);
                  if (shippingDate) {
                    const monthKey = safeFormatMonth(shippingDate);
                    if (monthKey) {
                      monthlyDeliveredMap.set(
                        monthKey, 
                        (monthlyDeliveredMap.get(monthKey) || 0) + itemWeight
                      );
                    }
                  }
                }

                // ✅ 3. PESO ENTREGUE POR CLIENTE (apenas pedidos CONCLUÍDOS)
                // SÓ CONTA SE O PEDIDO ESTIVER CONCLUÍDO
                if (order.status === 'Concluído') {
                  // Só conta se item tem shippingDate E está 100% concluído
                  if (item.shippingDate && isItemCompleted) {
                    const shippingDate = safeParseDate(item.shippingDate);
                    
                    if (shippingDate) {
                      totalShippedItems++;
                      customerEntry.totalItems++;
                      customerEntry.deliveredWeight += itemWeight;

                      // Verificar se entregou no prazo
                      const itemDeliveryDate = safeParseDate(item.itemDeliveryDate);
                      
                      if (itemDeliveryDate) {
                        const sDate = new Date(shippingDate);
                        sDate.setHours(0, 0, 0, 0);
                        const dDate = new Date(itemDeliveryDate);
                        dDate.setHours(0, 0, 0, 0);
                        
                        if (sDate <= dDate) {
                          totalOnTimeItems++;
                          customerEntry.onTimeItems++;
                        }
                      }
                    }
                  }
                }
              });
            }
          });

          // ✅ PROCESSAR NCs (não-conformidades)
          const qualityReports = qualitySnapshot.docs.map(doc => doc.data());
            
          qualityReports.forEach(report => {
            if (report.customerName) {
              const formattedCustomerName = formatCustomerName(report.customerName);
              const customerEntry = customerDataMap.get(formattedCustomerName);
              if(customerEntry) {
                customerEntry.ncCount++;
              }
            }
          });

          // ✅ CALCULAR TAXAS
          const onTimeDeliveryRate = totalShippedItems > 0 ? (totalOnTimeItems / totalShippedItems) * 100 : 100;
          const geralNcRate = totalShippedItems > 0 ? (qualityReports.length / totalShippedItems) * 100 : 0;
          const internalNcRate = totalShippedItems > 0 ? (qualityReports.filter(r => r.type === "Interna").length / totalShippedItems) * 100 : 0;

          // ✅ PRODUÇÃO MENSAL (últimos 6 meses)
          const sortedMonthlyEntries = Array.from(monthlyDeliveredMap.entries())
            .sort(([a], [b]) => a.localeCompare(b));
          
          const monthlyProduction = sortedMonthlyEntries.map(([monthKey, weight]) => {
            try {
              const [year, month] = monthKey.split('-');
              const date = new Date(parseInt(year), parseInt(month) - 1, 15);
              
              if (isValid(date)) {
                return {
                  month: format(date, 'MMM', { locale: ptBR }),
                  weight,
                };
              } else {
                return { month: monthKey, weight };
              }
            } catch (error) {
              return { month: monthKey, weight };
            }
          }).slice(-6);
          
          // ✅ ANÁLISE POR CLIENTE
          const customerAnalysis = Array.from(customerDataMap.entries())
            .map(([name, data]) => ({ 
              name, 
              shortName: getShortCustomerName(name),
              ...data 
            }))
            .sort((a, b) => b.deliveredWeight - a.deliveredWeight);

          // ✅ LOG FINAL DE VERIFICAÇÃO
          console.log('📊 ========================================');
          console.log('📊 RELATÓRIO FINAL - DADOS CORRETOS');
          console.log('📊 ========================================');
          console.log(`\n📦 TOTAIS:`);
          console.log(`   Peso Total a Produzir: ${totalToProduceWeight.toFixed(2)} kg`);
          console.log(`   Peso Total Produzido (100%): ${totalProducedWeight.toFixed(2)} kg`);
          console.log(`   Taxa de Produção: ${((totalProducedWeight / totalToProduceWeight) * 100).toFixed(2)}%`);
          console.log(`\n🚚 ENTREGAS:`);
          console.log(`   Itens Embarcados: ${totalShippedItems}`);
          console.log(`   Itens no Prazo: ${totalOnTimeItems}`);
          console.log(`   Taxa no Prazo: ${onTimeDeliveryRate.toFixed(2)}%`);
          console.log(`\n👥 CLIENTES (Top 5):`);
          customerAnalysis.slice(0, 5).forEach((customer, i) => {
            console.log(`   ${i + 1}. ${customer.name}: ${customer.deliveredWeight.toFixed(2)} kg`);
          });
          console.log(`\n📅 PRODUÇÃO MENSAL (últimos 6 meses):`);
          monthlyProduction.forEach(m => {
            console.log(`   ${m.month}: ${m.weight.toFixed(2)} kg`);
          });
          console.log('\n📊 ========================================\n');

          setData({
            totalProducedWeight,
            totalToProduceWeight,
            onTimeDeliveryRate,
            geralNcRate,
            internalNcRate,
            monthlyProduction,
            customerAnalysis,
            companyCapacity,
          });

        } catch (error) {
          console.error("Error fetching dashboard data:", error);
        } finally {
          setIsLoading(false);
        }
      };
      fetchData();
    }
  }, [user, authLoading]);

  if (isLoading || !data) {
      return (
          <div className="flex-1 space-y-4 p-4 md:p-8 pt-6">
              <Skeleton className="h-8 w-64" />
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
                  <Skeleton className="h-36" />
                  <Skeleton className="h-36" />
                  <Skeleton className="h-36" />
                  <Skeleton className="h-36" />
              </div>
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  <Skeleton className="h-96" />
                  <Skeleton className="h-96" />
              </div>
          </div>
      )
  }

  const productionRate = data.totalToProduceWeight > 0 ? (data.totalProducedWeight / data.totalToProduceWeight) * 100 : 0;

  return (
    <div className="flex-1 space-y-6 p-4 md:p-8 pt-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight font-headline">Dashboard de Performance</h1>
          <p className="text-muted-foreground mt-2">
            Acompanhe os principais indicadores de produção e qualidade da sua operação
          </p>
        </div>
      </div>

      {/* KPIs Section */}
      <section className="space-y-4">
        <div className="flex items-center gap-2">
          <TrendingUp className="h-5 w-5" />
          <h2 className="text-xl font-semibold tracking-tight">Indicadores Principais</h2>
        </div>
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          <StatCard
            title="Taxa de Produção"
            value={`${productionRate.toFixed(1)}%`}
            icon={Scale}
            description={`${data.totalProducedWeight.toLocaleString('pt-BR', { maximumFractionDigits: 0 })} de ${data.totalToProduceWeight.toLocaleString('pt-BR', { maximumFractionDigits: 0 })} kg`}
            progress={productionRate}
          />
          <StatCard
            title="Entregas no Prazo"
            value={`${data.onTimeDeliveryRate.toFixed(1)}%`}
            icon={CheckCircle}
            description="Itens entregues na data prometida"
          />
          <StatCard
            title="Não Conformidade (Geral)"
            value={`${data.geralNcRate.toFixed(1)}%`}
            icon={AlertTriangle}
            description="Percentual de itens com RNC"
          />
          <StatCard
            title="Não Conformidade (Interna)"
            value={`${data.internalNcRate.toFixed(1)}%`}
            icon={Wrench}
            description="Falhas detectadas internamente"
          />
        </div>
      </section>
      
      {/* Charts Section */}
      <section className="space-y-4">
        <div className="flex items-center gap-2">
          <BarChart className="h-5 w-5" />
          <h2 className="text-xl font-semibold tracking-tight">Análises Detalhadas</h2>
        </div>
        <div className="grid gap-6 lg:grid-cols-2">
          <ImprovedMonthlyProductionChart 
            data={data.monthlyProduction} 
            companyCapacity={data.companyCapacity} 
          />
          <ImprovedCustomerAnalysis data={data.customerAnalysis} />
        </div>
      </section>
    </div>
  );
}
