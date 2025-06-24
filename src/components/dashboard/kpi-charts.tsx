"use client";

import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart";

const chartData = [
    { month: "Jan", production: 186, efficiency: 80 },
    { month: "Fev", production: 305, efficiency: 75 },
    { month: "Mar", production: 237, efficiency: 82 },
    { month: "Abr", production: 273, efficiency: 85 },
    { month: "Mai", production: 209, efficiency: 79 },
    { month: "Jun", production: 250, efficiency: 88 },
];

const chartConfig = {
    production: {
      label: "Produção (un)",
      color: "hsl(var(--primary))",
    },
    efficiency: {
        label: "Eficiência (%)",
        color: "hsl(var(--accent))",
    }
};

export function KpiCharts() {
  return (
    <Card className="h-full hover:shadow-lg transition-shadow duration-300">
      <CardHeader>
        <CardTitle className="font-headline">Desempenho Semestral</CardTitle>
        <CardDescription>Produção e eficiência nos últimos 6 meses</CardDescription>
      </CardHeader>
      <CardContent>
        <ChartContainer config={chartConfig} className="h-[300px] w-full">
            <BarChart accessibilityLayer data={chartData}>
                <CartesianGrid vertical={false} />
                <XAxis
                    dataKey="month"
                    tickLine={false}
                    tickMargin={10}
                    axisLine={false}
                />
                 <YAxis 
                    yAxisId="left" 
                    orientation="left" 
                    stroke="hsl(var(--primary))" 
                />
                <YAxis 
                    yAxisId="right" 
                    orientation="right" 
                    stroke="hsl(var(--accent))"
                />
                <ChartTooltip
                    cursor={false}
                    content={<ChartTooltipContent indicator="dot" />}
                />
                <Bar dataKey="production" fill="var(--color-production)" radius={4} yAxisId="left" />
                <Bar dataKey="efficiency" fill="var(--color-efficiency)" radius={4} yAxisId="right" />
            </BarChart>
        </ChartContainer>
      </CardContent>
    </Card>
  );
}
