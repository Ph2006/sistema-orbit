// components/TaskMetrics.tsx
import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { TrendingUp, TrendingDown, Target, Clock } from 'lucide-react';

interface TaskMetricsProps {
  analytics: TaskAnalytics;
}

export const TaskMetrics: React.FC<TaskMetricsProps> = ({ analytics }) => {
  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Taxa de Pontualidade</CardTitle>
          <Target className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">{analytics.onTimeRate.toFixed(1)}%</div>
          <Progress value={analytics.onTimeRate} className="mt-2" />
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Atraso Médio</CardTitle>
          <Clock className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">{analytics.averageDelay.toFixed(1)} dias</div>
          <p className="text-xs text-muted-foreground">
            {analytics.averageDelay <= 1 ? 'Excelente' : 
             analytics.averageDelay <= 3 ? 'Bom' : 'Precisa melhorar'}
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Produtividade</CardTitle>
          <TrendingUp className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">{analytics.productivityRate.toFixed(1)}%</div>
          <p className="text-xs text-muted-foreground">
            Eficiência horas estimadas vs reais
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Tendência Semanal</CardTitle>
          {analytics.weeklyTrend[3] > analytics.weeklyTrend[0] ? 
            <TrendingUp className="h-4 w-4 text-green-500" /> :
            <TrendingDown className="h-4 w-4 text-red-500" />
          }
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">
            {analytics.weeklyTrend[3]?.toFixed(1) || 0}%
          </div>
          <p className="text-xs text-muted-foreground">
            Conclusão esta semana
          </p>
        </CardContent>
      </Card>
    </div>
  );
};
