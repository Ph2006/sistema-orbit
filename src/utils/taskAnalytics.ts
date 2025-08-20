// src/utils/taskAnalytics.ts
export interface TaskAnalyticsData {
  totalTasks: number;
  completedTasks: number;
  pendingTasks: number;
  inProgressTasks: number;
  overdueTasks: number;
  completionRate: number;
  onTimeRate: number;
  averageDelay: number;
  resourceUtilization: Array<{
    resourceId: string;
    resourceName: string;
    tasksAssigned: number;
    tasksCompleted: number;
    utilizationRate: number;
  }>;
  supervisorPerformance: Array<{
    supervisorId: string;
    supervisorName: string;
    tasksSupervised: number;
    tasksCompletedOnTime: number;
    performanceRate: number;
  }>;
  weeklyTrend: Array<{
    week: string;
    completed: number;
    total: number;
    rate: number;
  }>;
}

export const calculateTaskAnalytics = (
  tasks: any[], 
  resources: any[], 
  teamMembers: any[]
): TaskAnalyticsData => {
  const totalTasks = tasks.length;
  const completedTasks = tasks.filter(t => t.status === 'concluida').length;
  const pendingTasks = tasks.filter(t => t.status === 'pendente').length;
  const inProgressTasks = tasks.filter(t => t.status === 'em_andamento').length;
  const overdueTasks = tasks.filter(t => 
    t.status !== 'concluida' && new Date() > new Date(t.endDate)
  ).length;

  const completionRate = totalTasks > 0 ? (completedTasks / totalTasks) * 100 : 0;

  // Calcular taxa de pontualidade
  const completedOnTime = tasks.filter(t => 
    t.status === 'concluida' && 
    t.actualEndDate && 
    new Date(t.actualEndDate) <= new Date(t.endDate)
  ).length;
  const onTimeRate = completedTasks > 0 ? (completedOnTime / completedTasks) * 100 : 0;

  // Calcular atraso médio
  const delayedTasks = tasks.filter(t => 
    t.status === 'concluida' && 
    t.actualEndDate && 
    new Date(t.actualEndDate) > new Date(t.endDate)
  );
  
  const totalDelay = delayedTasks.reduce((acc, task) => {
    const delay = (new Date(task.actualEndDate).getTime() - new Date(task.endDate).getTime()) / (1000 * 60 * 60 * 24);
    return acc + delay;
  }, 0);
  
  const averageDelay = delayedTasks.length > 0 ? totalDelay / delayedTasks.length : 0;

  // Utilização de recursos
  const resourceUtilization = resources.map(resource => {
    const resourceTasks = tasks.filter(t => t.assignedTo?.resourceId === resource.id);
    const resourceCompleted = resourceTasks.filter(t => t.status === 'concluida');
    
    return {
      resourceId: resource.id,
      resourceName: resource.name,
      tasksAssigned: resourceTasks.length,
      tasksCompleted: resourceCompleted.length,
      utilizationRate: resourceTasks.length > 0 ? (resourceCompleted.length / resourceTasks.length) * 100 : 0,
    };
  });

  // Performance de supervisores
  const supervisorPerformance = teamMembers.map(member => {
    const supervisedTasks = tasks.filter(t => t.supervisor?.memberId === member.id);
    const completedOnTimeBySuper = supervisedTasks.filter(t => 
      t.status === 'concluida' && 
      t.actualEndDate && 
      new Date(t.actualEndDate) <= new Date(t.endDate)
    );
    
    const supervisedCompleted = supervisedTasks.filter(t => t.status === 'concluida');
    
    return {
      supervisorId: member.id,
      supervisorName: member.name,
      tasksSupervised: supervisedTasks.length,
      tasksCompletedOnTime: completedOnTimeBySuper.length,
      performanceRate: supervisedCompleted.length > 0 ? 
        (completedOnTimeBySuper.length / supervisedCompleted.length) * 100 : 0,
    };
  });

  // Tendência semanal (últimas 4 semanas)
  const weeklyTrend = Array.from({ length: 4 }, (_, index) => {
    const weekStart = new Date();
    weekStart.setDate(weekStart.getDate() - ((3 - index) * 7 + 7));
    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekEnd.getDate() + 6);
    
    const weekTasks = tasks.filter(task => {
      const taskDate = new Date(task.startDate);
      return taskDate >= weekStart && taskDate <= weekEnd;
    });
    
    const weekCompleted = weekTasks.filter(t => t.status === 'concluida');
    
    return {
      week: `Sem ${index + 1}`,
      completed: weekCompleted.length,
      total: weekTasks.length,
      rate: weekTasks.length > 0 ? (weekCompleted.length / weekTasks.length) * 100 : 0,
    };
  });

  return {
    totalTasks,
    completedTasks,
    pendingTasks,
    inProgressTasks,
    overdueTasks,
    completionRate,
    onTimeRate,
    averageDelay,
    resourceUtilization,
    supervisorPerformance,
    weeklyTrend,
  };
};
