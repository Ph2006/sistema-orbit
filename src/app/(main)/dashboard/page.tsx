"use client";

import { useEffect, useState } from "react";
import { collection, getDocs, Timestamp } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAuth } from "../layout";
import { format, isValid } from "date-fns";
import { ptBR } from "date-fns/locale";
import { BarChart, Package, Percent, Truck, Wrench, AlertTriangle, CheckCircle, Scale } from "lucide-react";
import { StatCard } from "@/components/dashboard/stat-card";
import { MonthlyProductionChart } from "@/components/dashboard/kpi-charts";
import { CustomerAnalysis } from "@/components/dashboard/production-status";
import { Skeleton } from "@/components/ui/skeleton";

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
  
  let formattedName = name
    .replace(/\s+/g, ' ')
    .replace(/[^\w\s\-\&\.\,\/]/g, ' ')
    .trim();

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

  formattedName = formattedName
    .replace(/\bLtda\b/gi, 'Ltda')
    .replace(/\bS\.?a\.?\b/gi, 'S.A.')
    .replace(/\bLlc\b/gi, 'LLC')
    .replace(/\bInc\b/gi, 'Inc')
    .replace(/\bBrasil\b/gi, 'Brasil')
    .replace(/\bMinas\s+Gerais\b/gi, 'Minas Gerais')
    .replace(/\bSao\s+Paulo\b/gi, 'São Paulo')
    .replace(/\bSão\s+Paulo\b/gi, 'São Paulo')
    .replace(/\bRio\s+de\s+Janeiro\b/gi, 'Rio de Janeiro')
    .replace(/\s*-\s*/g, ' - ')
    .replace(/\s*\/\s*/g, ' / ')
    .replace(/\s*\&\s*/g, ' & ');

  if (formattedName.length > 0) {
    formattedName = formattedName.charAt(0).toUpperCase() + formattedName.slice(1);
  }

  return formattedName.substring(0, 60).trim();
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

export default function DashboardPage() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const { user, loading: authLoading } = useAuth();

  useEffect(() => {
    if (user && !authLoading) {
      const fetchData = async () => {
        setIsLoading(true);
        try {
          const [ordersSnapshot, qualitySnapshot] = await Promise.all([
            getDocs(collection(db, "companies", "mecald", "orders")),
            getDocs(collection(db, "companies", "mecald", "qualityReports"))
          ]);

          let totalProducedWeight = 0;
          let totalToProduceWeight = 0;
          let totalShippedItems = 0;
          let totalOnTimeItems = 0;
          
          const monthlyProductionMap = new Map<string, number>();
          const customerDataMap = new Map<string, { deliveredWeight: number; ncCount: number; onTimeItems: number; totalItems: number }>();

          ordersSnapshot.forEach(doc => {
            const order = doc.data();
            const rawCustomerName = order.customer?.name || order.customerName || "Desconhecido";
            const customerName = formatCustomerName(rawCustomerName);
            
            if (!customerDataMap.has(customerName)) {
                customerDataMap.set(customerName, { deliveredWeight: 0, ncCount: 0, onTimeItems: 0, totalItems: 0 });
            }
            const customerEntry = customerDataMap.get(customerName)!;

            if (order.items && Array.isArray(order.items)) {
              order.items.forEach((item: any) => {
                const itemWeight = (item.quantity || 0) * (item.unitWeight || 0);
                totalToProduceWeight += itemWeight;
                
                const isItemCompleted = item.productionPlan?.length > 0
                    ? item.productionPlan.every((p: any) => p.status === 'Concluído')
                    : !!item.shippingDate;

                if (isItemCompleted) {
                    totalProducedWeight += itemWeight;
                }

                if (item.shippingDate) {
                  const shippingDate = safeParseDate(item.shippingDate);
                  
                  if (shippingDate) {
                    totalShippedItems++;
                    customerEntry.totalItems++;
                    
                    const monthKey = safeFormatMonth(shippingDate);
                    if (monthKey) {
                      monthlyProductionMap.set(monthKey, (monthlyProductionMap.get(monthKey) || 0) + itemWeight);
                    }
                    customerEntry.deliveredWeight += itemWeight;

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
              });
            }
          });
          
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

          const onTimeDeliveryRate = totalShippedItems > 0 ? (totalOnTimeItems / totalShippedItems) * 100 : 100;
          const geralNcRate = totalShippedItems > 0 ? (qualityReports.length / totalShippedItems) * 100 : 0;
          const internalNcRate = totalShippedItems > 0 ? (qualityReports.filter(r => r.type === "Interna").length / totalShippedItems) * 100 : 0;

          const sortedMonthlyEntries = Array.from(monthlyProductionMap.entries())
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
                  console.warn('Data inválida para monthKey:', monthKey);
                  return {
                      month: monthKey,
                      weight,
                  };
                }
              } catch (error) {
                console.warn('Erro ao processar monthKey:', monthKey, error);
                return {
                    month: monthKey,
                    weight,
                };
              }
          }).slice(-6);
          
          const customerAnalysis = Array.from(customerDataMap.entries())
            .map(([name, data]) => ({ 
              name, 
              shortName: getShortCustomerName(name),
              ...data 
            }))
            .sort((a, b) => b.deliveredWeight - a.deliveredWeight);

          setData({
            totalProducedWeight,
            totalToProduceWeight,
            onTimeDeliveryRate,
            geralNcRate,
            internalNcRate,
            monthlyProduction,
            customerAnalysis,
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
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                  <Skeleton className="h-96" />
                  <Skeleton className="h-96" />
              </div>
          </div>
      )
  }

  return (
    <div className="flex-1 space-y-4 p-4 md:p-8 pt-6">
      <div className="flex items-center justify-between space-y-2">
        <h1 className="text-3xl font-bold tracking-tight font-headline">Dashboard de Performance</h1>
      </div>
      <div className="space-y-8">
        <section>
          <h2 className="text-2xl font-semibold tracking-tight font-headline mb-4">
            Indicadores Chave de Performance (KPIs)
          </h2>
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            <StatCard
              title="Produção (Peso)"
              value={`${data.totalProducedWeight.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} / ${data.totalToProduceWeight.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} kg`}
              icon={Scale}
              description="Peso total produzido vs. a produzir"
              progress={(data.totalToProduceWeight > 0 ? (data.totalProducedWeight / data.totalToProduceWeight) * 100 : 0)}
            />
            <StatCard
              title="Entregas no Prazo"
              value={`${data.onTimeDeliveryRate.toFixed(1)}%`}
              icon={Percent}
              description="Itens entregues na data prometida"
            />
            <StatCard
              title="Não Conformidade (Geral)"
              value={`${data.geralNcRate.toFixed(2)}%`}
              icon={AlertTriangle}
              description="Percentual de itens enviados com RNC"
            />
             <StatCard
              title="Não Conformidade (Interna)"
              value={`${data.internalNcRate.toFixed(2)}%`}
              icon={Wrench}
              description="Falhas de qualidade detectadas internamente"
            />
          </div>
        </section>
        
        <div className="grid gap-8 lg:grid-cols-2">
          <MonthlyProductionChart data={data.monthlyProduction} />
          <CustomerAnalysis data={data.customerAnalysis} />
        </div>
      </div>
    </div>
  );
}
