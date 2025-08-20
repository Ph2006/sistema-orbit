// src/components/tasks/TaskCard.tsx
import React from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Clock, User, Calendar, Edit, Eye, AlertTriangle } from 'lucide-react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

interface TaskCardProps {
  task: {
    id: string;
    title: string;
    description?: string;
    assignedTo: { resourceName: string };
    supervisor: { memberName: string };
    priority: string;
    status: string;
    estimatedHours: number;
    startDate: Date;
    endDate: Date;
    isFromOrder?: boolean;
  };
  onView: () => void;
  onEdit: () => void;
  showActions?: boolean;
}

export const TaskCard: React.FC<TaskCardProps> = ({ 
  task, 
  onView, 
  onEdit, 
  showActions = true 
}) => {
  const isOverdue = task.status !== 'concluida' && new Date() > task.endDate;
  
  const getStatusColor = (status: string) => {
    switch (status) {
      case 'pendente': return 'bg-yellow-100 text-yellow-800';
      case 'em_andamento': return 'bg-blue-100 text-blue-800';
      case 'concluida': return 'bg-green-100 text-green-800';
      case 'cancelada': return 'bg-red-100 text-red-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case 'baixa': return 'bg-gray-100 text-gray-800';
      case 'media': return 'bg-blue-100 text-blue-800';
      case 'alta': return 'bg-orange-100 text-orange-800';
      case 'urgente': return 'bg-red-100 text-red-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  return (
    <Card className={`cursor-pointer hover:shadow-md transition-shadow ${isOverdue ? 'border-red-300' : ''}`}>
      <CardContent className="p-4">
        <div className="space-y-3">
          <div className="flex items-start justify-between">
            <div className="flex-1">
              <div className="flex items-center gap-2 mb-1">
                <h4 className="font-semibold text-sm">{task.title}</h4>
                {isOverdue && (
                  <AlertTriangle className="h-4 w-4 text-red-500" />
                )}
              </div>
              
              {task.description && (
                <p className="text-xs text-muted-foreground line-clamp-2 mb-2">
                  {task.description}
                </p>
              )}

              <div className="flex items-center gap-2 mb-2">
                {task.isFromOrder && (
                  <Badge variant="outline" className="text-xs">
                    Do Pedido
                  </Badge>
                )}
                <Badge className={`text-xs ${getStatusColor(task.status)}`}>
                  {task.status === 'pendente' ? 'Pendente' :
                   task.status === 'em_andamento' ? 'Em Andamento' :
                   task.status === 'concluida' ? 'Concluída' : 'Cancelada'}
                </Badge>
                <Badge className={`text-xs ${getPriorityColor(task.priority)}`}>
                  {task.priority === 'baixa' ? 'Baixa' :
                   task.priority === 'media' ? 'Média' :
                   task.priority === 'alta' ? 'Alta' : 'Urgente'}
                </Badge>
              </div>
            </div>

            {showActions && (
              <div className="flex items-center gap-1 ml-2">
                <Button variant="ghost" size="sm" onClick={onView}>
                  <Eye className="h-4 w-4" />
                </Button>
                <Button variant="ghost" size="sm" onClick={onEdit}>
                  <Edit className="h-4 w-4" />
                </Button>
              </div>
            )}
          </div>

          <div className="grid grid-cols-2 gap-2 text-xs">
            <div className="flex items-center gap-1">
              <User className="h-3 w-3" />
              <span className="truncate">{task.assignedTo.resourceName}</span>
            </div>
            <div className="flex items-center gap-1">
              <Clock className="h-3 w-3" />
              <span>{task.estimatedHours}h</span>
            </div>
          </div>

          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <div className="flex items-center gap-1">
              <Calendar className="h-3 w-3" />
              <span>
                {format(task.startDate, 'dd/MM', { locale: ptBR })} - 
                {format(task.endDate, 'dd/MM', { locale: ptBR })}
              </span>
            </div>
            <span>Sup: {task.supervisor.memberName}</span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};
