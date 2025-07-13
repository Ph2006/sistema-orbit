// Dashboard de acompanhamento em tempo real dos apontamentos

"use client";

import React, { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";
import { 
  Clock, 
  CheckCircle, 
  PlayCircle, 
  AlertTriangle, 
  Users,
  Calendar,
  MapPin,
  Camera,
  MessageSquare,
  Download,
  RefreshCw,
  TrendingUp,
  Activity
} from "lucide-react";
import { format, differenceInHours, differenceInDays } from "date-fns";

// Componente principal do dashboard
export function RealTimeDashboard() {
  const [orders, setOrders] = useState([]);
  const [appointments, setAppointments] = useState([]);
  const [stats, setStats] = useState({
    activeStages: 0,
    completedToday: 0,
    delayedStages: 0,
    activeOperators: 0
  });
  const [loading, setLoading] = useState(true);

  // Carregar dados em tempo real
  useEffect(() => {
    const fetchRealTimeData = async () => {
      try {
        // Buscar pedidos ativos
        const ordersSnapshot = await getDocs(
          query(
            collection(db, "companies", "mecald", "orders"),
            where("status", "in", ["Em Produção", "Aguardando Produção"])
          )
        );
        
        const ordersList = ordersSnapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data(),
          deliveryDate: doc.data().deliveryDate?.toDate(),
        }));

        // Buscar apontamentos recentes (últimas 24h)
        const yesterday = new Date();
        yesterday.setDate(yesterday.getDate() - 1);
        
        const appointmentsSnapshot = await getDocs(
          query(
            collection(db, "companies", "mecald", "appointments"),
            where("timestamp", ">=", Timestamp.fromDate(yesterday)),
            orderBy("timestamp", "desc")
          )
        );

        const appointmentsList = appointmentsSnapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data(),
          timestamp: doc.data().timestamp?.toDate(),
        }));

        setOrders(ordersList);
        setAppointments(appointmentsList);
        
        // Calcular estatísticas
        calculateStats(ordersList, appointmentsList);
        
      } catch (error) {
        console.error('Erro ao carregar dados:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchRealTimeData();
    
    // Atualizar a cada 30 segundos
    const interval = setInterval(fetchRealTimeData, 30000);
    return () => clearInterval(interval);
  }, []);

  const calculateStats = (ordersList, appointmentsList) => {
    let activeStages = 0;
    let delayedStages = 0;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    const completedToday = appointmentsList.filter(
      apt => apt.action === 'finish' && apt.timestamp >= today
    ).length;

    const activeOperators = new Set(
      appointmentsList
        .filter(apt => apt.timestamp >= today)
        .map(apt => apt.operator?.id)
    ).size;

    ordersList.forEach(order => {
      order.items?.forEach(item => {
        item.productionPlan?.forEach(stage => {
          if (stage.status === 'Em Andamento') {
            activeStages++;
          }
          
          // Verificar atrasos
          if (stage.completedDate && stage.status !== 'Concluído') {
            const expectedDate = stage.completedDate.toDate ? stage.completedDate.toDate() : stage.completedDate;
            if (expectedDate < new Date()) {
              delayedStages++;
            }
          }
        });
      });
    });

    setStats({
      activeStages,
      completedToday,
      delayedStages,
      activeOperators
    });
  };

  return (
    <div className="space-y-6">
      {/* Header com estatísticas */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Etapas Ativas</CardTitle>
            <Activity className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.activeStages}</div>
            <p className="text-xs text-muted-foreground">Em andamento agora</p>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Concluídas Hoje</CardTitle>
            <CheckCircle className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.completedToday}</div>
            <p className="text-xs text-muted-foreground">Finalizadas nas últimas 24h</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Atrasadas</CardTitle>
            <AlertTriangle className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-red-600">{stats.delayedStages}</div>
            <p className="text-xs text-muted-foreground">Etapas em atraso</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Operadores Ativos</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.activeOperators}</div>
            <p className="text-xs text-muted-foreground">Trabalhando hoje</p>
          </CardContent>
        </Card>
      </div>

      {/* Timeline de atividades recentes */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>Atividades Recentes</CardTitle>
            <Button variant="outline" size="sm">
              <RefreshCw className="h-4 w-4 mr-2" />
              Atualizar
            </Button>
          </div>
          <CardDescription>
            Apontamentos realizados nas últimas 24 horas
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4 max-h-96 overflow-y-auto">
            {appointments.slice(0, 20).map((appointment, index) => (
              <AppointmentTimelineItem key={appointment.id} appointment={appointment} />
            ))}
            
            {appointments.length === 0 && (
              <div className="text-center text-muted-foreground py-8">
                Nenhuma atividade recente encontrada
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Status de pedidos em produção */}
      <Card>
        <CardHeader>
          <CardTitle>Pedidos em Produção</CardTitle>
          <CardDescription>
            Acompanhamento detalhado do progresso
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-6">
            {orders.map(order => (
              <OrderProgressCard key={order.id} order={order} appointments={appointments} />
            ))}
            
            {orders.length === 0 && (
              <div className="text-center text-muted-foreground py-8">
                Nenhum pedido em produção no momento
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// Componente para item na timeline
function AppointmentTimelineItem({ appointment }) {
  const isStart = appointment.action === 'start';
  const timeDiff = differenceInHours(new Date(), appointment.timestamp);
  
  return (
    <div className="flex items-start gap-3 p-3 border rounded-lg">
      <div className={`p-2 rounded-full ${isStart ? 'bg-blue-100 text-blue-600' : 'bg-green-100 text-green-600'}`}>
        {isStart ? <PlayCircle className="h-4 w-4" /> : <CheckCircle className="h-4 w-4" />}
      </div>
      
      <div className="flex-1 space-y-1">
        <div className="flex items-center justify-between">
          <p className="font-medium">
            {isStart ? 'Iniciou' : 'Finalizou'}: {appointment.stageName}
          </p>
          <span className="text-xs text-muted-foreground">
            {timeDiff < 1 ? 'Agora' : `${timeDiff}h atrás`}
          </span>
        </div>
        
        <p className="text-sm text-muted-foreground">
          {appointment.operator?.name} • {format(appointment.timestamp, 'HH:mm')}
        </p>
        
        {appointment.notes && (
          <div className="flex items-center gap-1 text-xs text-muted-foreground">
            <MessageSquare className="h-3 w-3" />
            {appointment.notes.substring(0, 50)}...
          </div>
        )}
        
        <div className="flex items-center gap-4 text-xs text-muted-foreground">
          {appointment.location && (
            <div className="flex items-center gap-1">
              <MapPin className="h-3 w-3" />
              <span>Localização registrada</span>
            </div>
          )}
          
          {appointment.photo && (
            <div className="flex items-center gap-1">
              <Camera className="h-3 w-3" />
              <span>Com foto</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// Componente para card de progresso do pedido
function OrderProgressCard({ order, appointments }) {
  const orderAppointments = appointments.filter(apt => apt.orderId === order.id);
  
  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-lg">Pedido {order.quotationNumber}</CardTitle>
            <CardDescription>{order.customer?.name}</CardDescription>
          </div>
          <div className="text-right">
            <Badge variant="outline">{order.status}</Badge>
            {order.deliveryDate && (
              <p className="text-xs text-muted-foreground mt-1">
                Entrega: {format(order.deliveryDate, 'dd/MM/yyyy')}
              </p>
            )}
          </div>
        </div>
      </CardHeader>
      
      <CardContent>
        <div className="space-y-4">
          {order.items?.map((item, itemIndex) => (
            <ItemProgressDetail 
              key={item.id} 
              item={item} 
              orderAppointments={orderAppointments}
              orderId={order.id}
            />
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

// Componente detalhado do progresso do item
function ItemProgressDetail({ item, orderAppointments, orderId }) {
  const itemAppointments = orderAppointments.filter(apt => apt.itemId === item.id);
  const totalStages = item.productionPlan?.length || 0;
  const completedStages = item.productionPlan?.filter(stage => stage.status === 'Concluído').length || 0;
  const progress = totalStages > 0 ? (completedStages / totalStages) * 100 : 0;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h4 className="font-medium">{item.description}</h4>
        <div className="flex items-center gap-2">
          <span className="text-sm text-muted-foreground">{Math.round(progress)}%</span>
          <AppointmentSheetButton order={{ id: orderId, quotationNumber: '', customer: { name: '' } }} item={item} />
        </div>
      </div>
      
      <Progress value={progress} className="h-2" />
      
      <div className="grid gap-2">
        {item.productionPlan?.map((stage, stageIndex) => {
          const stageAppointments = itemAppointments.filter(apt => apt.stageIndex === stageIndex);
          const lastAppointment = stageAppointments[0]; // Mais recente
          
          return (
            <StageProgressRow 
              key={stageIndex} 
              stage={stage} 
              stageIndex={stageIndex}
              lastAppointment={lastAppointment}
            />
          );
        })}
      </div>
      
      {itemAppointments.length > 0 && (
        <details className="text-xs">
          <summary className="cursor-pointer text-muted-foreground hover:text-foreground">
            Ver histórico de apontamentos ({itemAppointments.length})
          </summary>
          <div className="mt-2 space-y-1 pl-4 border-l-2 border-muted">
            {itemAppointments.slice(0, 5).map(apt => (
              <div key={apt.id} className="flex items-center justify-between">
                <span>{apt.action === 'start' ? '▶️' : '✅'} {apt.stageName}</span>
                <span>{format(apt.timestamp, 'dd/MM HH:mm')} - {apt.operator?.name}</span>
              </div>
            ))}
          </div>
        </details>
      )}
    </div>
  );
}

// Componente para linha de progresso da etapa
function StageProgressRow({ stage, stageIndex, lastAppointment }) {
  const getStatusIcon = (status) => {
    switch (status) {
      case 'Concluído':
        return <CheckCircle className="h-4 w-4 text-green-600" />;
      case 'Em Andamento':
        return <PlayCircle className="h-4 w-4 text-blue-600" />;
      default:
        return <Clock className="h-4 w-4 text-gray-400" />;
    }
  };

  const getStatusColor = (status) => {
    switch (status) {
      case 'Concluído':
        return 'text-green-600';
      case 'Em Andamento':
        return 'text-blue-600';
      default:
        return 'text-gray-500';
    }
  };

  // Verificar se está atrasada
  const isDelayed = stage.completedDate && stage.status !== 'Concluído' && 
    new Date(stage.completedDate.toDate ? stage.completedDate.toDate() : stage.completedDate) < new Date();

  return (
    <div className={`flex items-center justify-between p-2 rounded border ${isDelayed ? 'border-red-200 bg-red-50' : 'border-gray-200'}`}>
      <div className="flex items-center gap-3">
        {getStatusIcon(stage.status)}
        <div>
          <p className={`font-medium ${getStatusColor(stage.status)}`}>
            {stage.stageName}
          </p>
          {lastAppointment && (
            <p className="text-xs text-muted-foreground">
              Último registro: {format(lastAppointment.timestamp, 'dd/MM HH:mm')} por {lastAppointment.operator?.name}
            </p>
          )}
        </div>
      </div>
      
      <div className="text-right">
        <Badge 
          variant={stage.status === 'Concluído' ? 'default' : stage.status === 'Em Andamento' ? 'secondary' : 'outline'}
          className={isDelayed ? 'bg-red-100 text-red-800 border-red-300' : ''}
        >
          {isDelayed ? 'Atrasada' : stage.status}
        </Badge>
        
        {stage.completedDate && (
          <p className="text-xs text-muted-foreground mt-1">
            Prev: {format(
              stage.completedDate.toDate ? stage.completedDate.toDate() : stage.completedDate, 
              'dd/MM'
            )}
          </p>
        )}
      </div>
    </div>
  );
}
