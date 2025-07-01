
"use client";

import { Bar, BarChart, CartesianGrid, XAxis, YAxis, Tooltip } from "recharts";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { ChartContainer, ChartTooltipContent } from "@/components/ui/chart";

interface MonthlyProductionChartProps {
  data: {
    month: string;
    weight: number;
  }[];
}

const chartConfig = {
    weight: {
      label: "Peso (kg)",
      color: "hsl(var(--primary))",
    },
};

export function MonthlyProductionChart({ data }: MonthlyProductionChartProps) {
  return (
    <Card className="h-full hover:shadow-lg transition-shadow duration-300">
      <CardHeader>
        <CardTitle className="font-headline">Produção Mensal (Peso Entregue)</CardTitle>
        <CardDescription>Peso total de itens entregues (em kg) nos últimos meses.</CardDescription>
      </CardHeader>
      <CardContent>
        <ChartContainer config={chartConfig} className="h-[300px] w-full">
            <BarChart accessibilityLayer data={data}>
                <CartesianGrid vertical={false} />
                <XAxis
                    dataKey="month"
                    tickLine={false}
                    tickMargin={10}
                    axisLine={false}
                />
                 <YAxis 
                    stroke="hsl(var(--primary))" 
                    tickFormatter={(value) => value.toLocaleString('pt-BR')}
                />
                <Tooltip
                    cursor={false}
                    content={<ChartTooltipContent formatter={(value) => `${Number(value).toLocaleString('pt-BR')} kg`} />}
                />
                <Bar dataKey="weight" fill="var(--color-weight)" radius={4} />
            </BarChart>
        </ChartContainer>
      </CardContent>
    </Card>
  );
}
