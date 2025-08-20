/ components/TaskKanban.tsx
import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Clock, User, AlertTriangle } from 'lucide-react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

interface TaskKanbanProps {
  tasks: Task[];
  onTaskClick: (task: Task) => void;
}

export const TaskKanban: React.FC<TaskKanbanProps> = ({ tasks, onTaskClick }) => {
  const columns = [
    { id: 'pendente', title: 'Pendente', color: 'bg-yellow-100 border-yellow-300' },
    { id: 'em_andamento', title: 'Em Andamento', color: 'bg-blue-100 border-blue-300' },
    { id: 'concluida', title: 'Concluída', color: 'bg-green-100 border-green-300' },
    { id: 'cancelada', title: 'Cancelada', color: 'bg-red-100 border-red-300' },
  ];

  const getTasksByStatus = (status: string) => 
    tasks.filter(task => task.status === status);

  const isOverdue = (task: Task) => 
    task.status !== 'concluida' && new Date() > task.endDate;

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
      {columns.map(column => {
        const columnTasks = getTasksByStatus(column.id);
        
        return (
          <div key={column.id} className="space-y-4">
            <Card className={`${column.color} border-2`}>
              <CardHeader className="pb-3">
                <CardTitle className="text-lg flex items-center justify-between">
                  {column.title}
                  <Badge variant="secondary">{columnTasks.length}</Badge>
                </CardTitle>
              </CardHeader>
            </Card>

            <div className="space-y-3 max-h-[600px] overflow-y-auto">
              {columnTasks.map(task => (
                <Card 
                  key={task.id} 
                  className="cursor-pointer hover:shadow-md transition-shadow"
                  onClick={() => onTaskClick(task)}
                >
                  <CardContent className="p-4">
                    <div className="space-y-3">
                      <div className="flex items-start justify-between">
                        <h4 className="font-medium text-sm leading-tight">
                          {task.title}
                        </h4>
                        {isOverdue(task) && (
                          <AlertTriangle className="h-4 w-4 text-red-500 flex-shrink-0 ml-2" />
                        )}
                      </div>

                      {task.description && (
                        <p className="text-xs text-muted-foreground line-clamp-2">
                          {task.description}
                        </p>
                      )}

                      <div className="flex items-center gap-2 text-xs">
                        <Clock className="h-3 w-3" />
                        <span>
                          {format(task.startDate, 'dd/MM', { locale: ptBR })} - 
                          {format(task.endDate, 'dd/MM', { locale: ptBR })}
                        </span>
                      </div>

                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <Avatar className="h-6 w-6">
                            <AvatarFallback className="text-xs">
                              {task.assignedTo?.resourceName?.charAt(0) || 'R'}
                            </AvatarFallback>
                          </Avatar>
                          <span className="text-xs text-muted-foreground">
                            {task.assignedTo?.resourceName}
                          </span>
                        </div>

                        <Badge 
                          variant={
                            task.priority === 'urgente' ? 'destructive' :
                            task.priority === 'alta' ? 'default' :
                            task.priority === 'media' ? 'secondary' :
                            'outline'
                          }
                          className="text-xs"
                        >
                          {task.priority}
                        </Badge>
                      </div>

                      {task.estimatedHours && (
                        <div className="text-xs text-muted-foreground">
                          {formatTaskDuration(task.estimatedHours)} estimado
                        </div>
                      )}
                    </div>
                  </CardContent>
                </Card>
              ))}

              {columnTasks.length === 0 && (
                <div className="text-center py-8 text-muted-foreground">
                  <p className="text-sm">Nenhuma tarefa</p>
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
};
