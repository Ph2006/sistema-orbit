
"use client"

import { Bar, BarChart, CartesianGrid, XAxis, YAxis, Tooltip } from "recharts";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { ChartContainer, ChartTooltipContent } from "@/components/ui/chart";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

interface CustomerAnalysisProps {
  data: {
    name: string;
    deliveredWeight: number;
    ncCount: number;
    onTimeItems: number;
    totalItems: number;
  }[];
}

const chartConfig = {
    deliveredWeight: {
      label: "Peso Entregue (kg)",
      color: "hsl(var(--accent))",
    },
};

export function CustomerAnalysis({ data }: CustomerAnalysisProps) {
  const chartData = data
    .sort((a, b) => b.deliveredWeight - a.deliveredWeight)
    .slice(0, 5);

  const tableData = data
    .map(c => ({
        ...c,
        onTimeRate: c.totalItems > 0 ? (c.onTimeItems / c.totalItems) * 100 : 100,
        ncRate: c.totalItems > 0 ? (c.ncCount / c.totalItems) * 100 : 0
    }))
    .sort((a,b) => b.ncRate - a.ncRate);

  return (
    <Card className="h-full hover:shadow-lg transition-shadow duration-300 flex flex-col">
        <CardHeader>
            <CardTitle className="font-headline">Análise por Cliente</CardTitle>
            <CardDescription>Maiores clientes por peso e performance de qualidade</CardDescription>
        </CardHeader>
        <CardContent className="flex-1 flex flex-col space-y-4">
            <div>
                <h3 className="text-sm font-medium mb-2 text-muted-foreground">Top 5 Clientes por Peso Entregue</h3>
                <ChartContainer config={chartConfig} className="h-[200px] w-full">
                    <BarChart accessibilityLayer layout="vertical" data={chartData}>
                        <CartesianGrid horizontal={false} />
                        <YAxis
                            dataKey="name"
                            type="category"
                            tickLine={false}
                            tickMargin={10}
                            axisLine={false}
                            width={100}
                        />
                        <XAxis type="number" hide />
                        <Tooltip
                            cursor={false}
                            content={<ChartTooltipContent formatter={(value) => `${Number(value).toLocaleString('pt-BR')} kg`} />}
                        />
                        <Bar dataKey="deliveredWeight" fill="var(--color-deliveredWeight)" radius={4} layout="vertical" />
                    </BarChart>
                </ChartContainer>
            </div>
            <div className="flex-1">
                 <h3 className="text-sm font-medium mb-2 text-muted-foreground">Performance de Entrega e Qualidade por Cliente</h3>
                 <Table>
                     <TableHeader>
                         <TableRow>
                             <TableHead>Cliente</TableHead>
                             <TableHead className="text-right">Entregas no Prazo</TableHead>
                             <TableHead className="text-right">Índice de NC</TableHead>
                         </TableRow>
                     </TableHeader>
                     <TableBody>
                        {tableData.slice(0, 5).map(customer => (
                            <TableRow key={customer.name}>
                                <TableCell className="font-medium">{customer.name}</TableCell>
                                <TableCell className="text-right">{customer.onTimeRate.toFixed(1)}%</TableCell>
                                <TableCell className="text-right">{customer.ncRate.toFixed(2)}%</TableCell>
                            </TableRow>
                        ))}
                     </TableBody>
                 </Table>
            </div>
        </CardContent>
    </Card>
  );
}
