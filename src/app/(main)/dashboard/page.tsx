"use client";

import { BarChart, FileText, Gauge, Package, Percent, Truck, Wrench } from "lucide-react";
import { StatCard } from "@/components/dashboard/stat-card";
import { ProductionStatus } from "@/components/dashboard/production-status";
import { KpiCharts } from "@/components/dashboard/kpi-charts";

export default function DashboardPage() {
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
                value="96.5%"
                icon={Percent}
                description="Pedidos entregues na data prometida"
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
