
"use client";

import { useEffect, useState } from "react";
import { collection, getDocs } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAuth } from "../layout";
import { BarChart, FileText, Gauge, Package, Percent, Truck, Wrench } from "lucide-react";
import { StatCard } from "@/components/dashboard/stat-card";
import { ProductionStatus } from "@/components/dashboard/production-status";
import { KpiCharts } from "@/components/dashboard/kpi-charts";

export default function DashboardPage() {
  const [onTimeDeliveryRate, setOnTimeDeliveryRate] = useState<number | null>(null);
  const { user, loading: authLoading } = useAuth();

  useEffect(() => {
    if (user && !authLoading) {
      const fetchOrderDataForKPI = async () => {
        try {
          const ordersSnapshot = await getDocs(collection(db, "companies", "mecald", "orders"));
          let shippedItemsCount = 0;
          let onTimeItemsCount = 0;

          ordersSnapshot.forEach(doc => {
            const order = doc.data();
            if (order.items && Array.isArray(order.items)) {
              order.items.forEach((item: any) => {
                if (item.shippingDate) {
                  shippedItemsCount++;
                  const shippingDate = item.shippingDate.toDate();
                  const itemDeliveryDate = item.itemDeliveryDate?.toDate();

                  if (itemDeliveryDate) {
                    const sDate = new Date(shippingDate);
                    sDate.setHours(0, 0, 0, 0);
                    const dDate = new Date(itemDeliveryDate);
                    dDate.setHours(0, 0, 0, 0);

                    if (sDate <= dDate) {
                      onTimeItemsCount++;
                    }
                  }
                }
              });
            }
          });
          
          const rate = shippedItemsCount > 0 ? (onTimeItemsCount / shippedItemsCount) * 100 : 100;
          setOnTimeDeliveryRate(rate);

        } catch (error) {
          console.error("Error calculating KPI:", error);
          setOnTimeDeliveryRate(0);
        }
      };
      fetchOrderDataForKPI();
    }
  }, [user, authLoading]);

  return (
    <div className="flex-1 space-y-4 p-4 md:p-8 pt-6">
      <div className="flex items-center justify-between space-y-2">
        <h1 className="text-3xl font-bold tracking-tight font-headline">Dashboard</h1>
      </div>
      <div className="space-y-8">
        <section>
          <h2 className="text-2xl font-semibold tracking-tight font-headline mb-4">
            Indicadores de Performance (KPIs)
          </h2>
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-3">
            <StatCard
              title="Produção Mensal"
              value="8,540 / 10,000 un."
              icon={Package}
              description="Meta de produção do mês"
              progress={85.4}
            />
            <StatCard
              title="Eficiência (OEE)"
              value="78%"
              icon={Gauge}
              description="Overall Equipment Effectiveness"
            />
            <StatCard
              title="Taxa de Retrabalho"
              value="2.1%"
              icon={Wrench}
              description="Peças que necessitaram de retrabalho"
            />
            <StatCard
              title="Lead Time Médio"
              value="12 dias"
              icon={Truck}
              description="Tempo médio do pedido à entrega"
            />
            <StatCard
              title="Entregas no Prazo"
              value={onTimeDeliveryRate !== null ? `${onTimeDeliveryRate.toFixed(1)}%` : "..."}
              icon={Percent}
              description="Itens entregues na data prometida"
            />
            <StatCard
              title="Orçamentos Aprovados"
              value="42%"
              icon={FileText}
              description="Taxa de conversão de orçamentos"
            />
          </div>
        </section>
        
        <div className="grid gap-8 lg:grid-cols-5">
          <div className="lg:col-span-2">
            <ProductionStatus />
          </div>
          <div className="lg:col-span-3">
            <KpiCharts />
          </div>
        </div>
      </div>
    </div>
  );
}
