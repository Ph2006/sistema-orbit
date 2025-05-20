import React, { useMemo } from 'react';
import { format, addDays, eachDayOfInterval, isWeekend, isSameDay } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { CompanyCalendar, TaskAssignment, Task } from '../types/gantt';
import { Order } from '../types/kanban';

interface GanttChartProps {
  tasks: Task[];
  taskAssignments: TaskAssignment[];
  orders: Order[];
  calendar: CompanyCalendar;
  selectedOrder: Order | null;
  onTaskUpdate: (assignment: TaskAssignment) => void;
}

const GanttChart: React.FC<GanttChartProps> = ({
  tasks,
  taskAssignments,
  orders,
  calendar,
  selectedOrder,
  onTaskUpdate,
}) => {
  const today = new Date();

  // Filter assignments for selected order
  const filteredAssignments = selectedOrder
    ? taskAssignments.filter(assignment => assignment.orderId === selectedOrder.id)
    : taskAssignments;

  // Calculate date range for the chart
  const dateRange = useMemo(() => {
    if (filteredAssignments.length === 0) return { start: today, end: addDays(today, 30) };

    const startDates = filteredAssignments.map(a => new Date(a.startDate));
    const endDates = filteredAssignments.map(a => new Date(a.endDate));
    
    const minDate = new Date(Math.min(...startDates.map(d => d.getTime())));
    const maxDate = new Date(Math.max(...endDates.map(d => d.getTime())));
    
    // Add padding days
    return {
      start: addDays(minDate, -2),
      end: addDays(maxDate, 2)
    };
  }, [filteredAssignments]);

  // Generate array of dates for the chart
  const dates = useMemo(() => {
    return eachDayOfInterval({ start: dateRange.start, end: dateRange.end });
  }, [dateRange]);

  // Check if a date is a working day based on calendar settings
  const isWorkingDay = (date: Date) => {
    const dayOfWeek = format(date, 'EEEE', { locale: ptBR }).toLowerCase() as keyof CompanyCalendar;
    return calendar[dayOfWeek]?.enabled;
  };

  // Get working hours for a specific day
  const getWorkingHours = (date: Date) => {
    const dayOfWeek = format(date, 'EEEE', { locale: ptBR }).toLowerCase() as keyof CompanyCalendar;
    return calendar[dayOfWeek]?.hours || [];
  };

  // Calculate task position and width based on dates
  const getTaskStyle = (startDate: Date, endDate: Date, rowIndex: number) => {
    const startIndex = dates.findIndex(d => isSameDay(d, startDate));
    const daysWidth = dates.findIndex(d => isSameDay(d, endDate)) - startIndex + 1;
    
    return {
      left: `${startIndex * 40}px`,
      width: `${daysWidth * 40 - 4}px`,
      top: `${rowIndex * 40 + 4}px`,
      height: '32px',
    };
  };

  // Draw dependency lines between tasks
  const renderDependencyLines = (assignments: TaskAssignment[]) => {
    return assignments.map(assignment => {
      if (!assignment.dependsOn?.length) return null;

      return assignment.dependsOn.map(depId => {
        const dependentTask = assignments.find(a => a.id === depId);
        if (!dependentTask) return null;

        const startTask = new Date(dependentTask.endDate);
        const endTask = new Date(assignment.startDate);
        const startIndex = dates.findIndex(d => isSameDay(d, startTask));
        const endIndex = dates.findIndex(d => isSameDay(d, endTask));

        const startTaskRow = assignments.findIndex(a => a.id === depId);
        const endTaskRow = assignments.findIndex(a => a.id === assignment.id);

        const path = `
          M ${(startIndex * 40) + 36} ${startTaskRow * 40 + 20}
          L ${(startIndex * 40) + 46} ${startTaskRow * 40 + 20}
          L ${(startIndex * 40) + 46} ${endTaskRow * 40 + 20}
          L ${endIndex * 40} ${endTaskRow * 40 + 20}
        `;

        return (
          <g key={`dep-${assignment.id}-${depId}`}>
            <path
              d={path}
              stroke="#9CA3AF"
              strokeWidth="2"
              fill="none"
              strokeDasharray="4"
            />
            <circle
              cx={endIndex * 40}
              cy={endTaskRow * 40 + 20}
              r="4"
              fill="#9CA3AF"
            />
          </g>
        );
      });
    });
  };

  return (
    <div className="overflow-x-auto">
      <div className="relative" style={{ 
        width: `${dates.length * 40}px`,
        minHeight: `${filteredAssignments.length * 40 + 60}px` 
      }}>
        {/* Header - Calendar */}
        <div className="sticky top-0 z-10 bg-white border-b">
          {/* Month row */}
          <div className="flex h-8">
            {dates.map((date, i) => (
              <div
                key={`month-${i}`}
                className={`flex-none w-10 border-r text-xs font-medium text-gray-500 flex items-center justify-center
                  ${i === 0 || date.getDate() === 1 ? 'border-l' : ''}
                `}
              >
                {date.getDate() === 1 && format(date, 'MMM', { locale: ptBR })}
              </div>
            ))}
          </div>
          {/* Days row */}
          <div className="flex h-8">
            {dates.map((date, i) => {
              const isWeekendDay = isWeekend(date);
              const isNonWorkingDay = !isWorkingDay(date);
              
              return (
                <div
                  key={`day-${i}`}
                  className={`
                    flex-none w-10 border-r text-xs flex flex-col items-center justify-center
                    ${i === 0 ? 'border-l' : ''}
                    ${isWeekendDay || isNonWorkingDay ? 'bg-gray-100' : ''}
                    ${isSameDay(date, today) ? 'bg-blue-50' : ''}
                  `}
                >
                  <span className="font-medium">{format(date, 'd')}</span>
                  <span className="text-gray-500">{format(date, 'EEE', { locale: ptBR })}</span>
                </div>
              );
            })}
          </div>
        </div>

        {/* Grid lines */}
        <div className="absolute inset-0">
          {dates.map((date, i) => (
            <div
              key={`grid-${i}`}
              className={`absolute border-r border-gray-200 h-full
                ${isWeekend(date) || !isWorkingDay(date) ? 'bg-gray-50/50' : ''}
              `}
              style={{ left: `${i * 40}px` }}
            />
          ))}
        </div>

        {/* Today line */}
        <div
          className="absolute h-full border-l-2 border-red-500"
          style={{
            left: `${dates.findIndex(d => isSameDay(d, today)) * 40}px`,
            zIndex: 5,
          }}
        />

        {/* Tasks */}
        <svg className="absolute inset-0" style={{ zIndex: 10 }}>
          {/* Dependency lines */}
          {renderDependencyLines(filteredAssignments)}
        </svg>

        {filteredAssignments.map((assignment, index) => {
          const task = tasks.find(t => t.id === assignment.taskId);
          const startDate = new Date(assignment.startDate);
          const endDate = new Date(assignment.endDate);
          const style = getTaskStyle(startDate, endDate, index);
          const isDelayed = endDate < today && assignment.progress < 100;

          return (
            <div
              key={assignment.id}
              className={`absolute rounded-sm ${isDelayed ? 'bg-red-200' : 'bg-blue-200'}`}
              style={style}
            >
              <div
                className="h-full rounded-sm"
                style={{
                  width: `${assignment.progress}%`,
                  backgroundColor: isDelayed ? '#EF4444' : task?.color || '#3B82F6',
                }}
              />
              <div className="absolute inset-0 px-2 flex items-center text-xs font-medium truncate">
                {task?.name} - {assignment.progress}%
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default GanttChart;