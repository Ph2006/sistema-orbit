import React, { useState } from 'react';
import { ChevronLeft, ChevronRight, AlertTriangle, Package, CheckCircle2, Clock, Hourglass, Ship } from 'lucide-react';
import { Order } from '../types/kanban';
import { format, startOfMonth, endOfMonth, startOfWeek, endOfWeek, addMonths, subMonths, eachDayOfInterval, isToday, isSameMonth, isSameDay, isAfter, isBefore } from 'date-fns';
import { ptBR } from 'date-fns/locale';

interface OrderCalendarProps {
  orders: Order[];
  onOrderClick: (order: Order) => void;
}

const OrderCalendar: React.FC<OrderCalendarProps> = ({ orders, onOrderClick }) => {
  const [currentDate, setCurrentDate] = useState(new Date());
  
  const monthStart = startOfMonth(currentDate);
  const monthEnd = endOfMonth(monthStart);
  const calendarStart = startOfWeek(monthStart, { weekStartsOn: 0 });
  const calendarEnd = endOfWeek(monthEnd, { weekStartsOn: 0 });
  
  const days = eachDayOfInterval({ start: calendarStart, end: calendarEnd });
  
  const renderStatusIcon = (status: string) => {
    switch (status) {
      case 'delayed':
        return <AlertTriangle className="h-4 w-4 text-red-500" />;
      case 'completed':
        return <CheckCircle2 className="h-4 w-4 text-green-500" />;
      case 'urgent':
        return <Clock className="h-4 w-4 text-purple-500" />;
      case 'waiting-docs':
        return <Hourglass className="h-4 w-4 text-yellow-500" />;
      case 'ready':
        return <Ship className="h-4 w-4 text-blue-500" />;
      default: // in-progress
        return <Package className="h-4 w-4 text-orange-500" />;
    }
  };

  const getOrdersByDate = (day: Date) => {
    return orders.filter(order => {
      const deliveryDate = new Date(order.deliveryDate);
      return isSameDay(deliveryDate, day);
    }).sort((a, b) => {
      // Priorizar pedidos atrasados e urgentes
      if (a.status === 'delayed' && b.status !== 'delayed') return -1;
      if (a.status !== 'delayed' && b.status === 'delayed') return 1;
      if (a.status === 'urgent' && b.status !== 'urgent') return -1;
      if (a.status !== 'urgent' && b.status === 'urgent') return 1;
      return 0;
    });
  };

  // Check if a delivery is overdue, but not if it's completed
  const isDeliveryOverdue = (order: Order) => {
    if (order.status === 'completed' || order.completedDate) {
      return false;
    }
    return isBefore(new Date(order.deliveryDate), new Date());
  };

  const handlePreviousMonth = () => {
    setCurrentDate(subMonths(currentDate, 1));
  };
  
  const handleNextMonth = () => {
    setCurrentDate(addMonths(currentDate, 1));
  };
  
  const handleToday = () => {
    setCurrentDate(new Date());
  };

  return (
    <div className="bg-white rounded-lg shadow-lg overflow-hidden">
      <div className="p-4 border-b flex items-center justify-between">
        <div className="flex space-x-2">
          <button 
            onClick={handlePreviousMonth}
            className="p-2 hover:bg-gray-100 rounded-full"
          >
            <ChevronLeft className="h-5 w-5" />
          </button>
          <button 
            onClick={handleToday}
            className="px-4 py-2 text-sm bg-blue-100 text-blue-800 rounded-md"
          >
            Hoje
          </button>
          <button 
            onClick={handleNextMonth}
            className="p-2 hover:bg-gray-100 rounded-full"
          >
            <ChevronRight className="h-5 w-5" />
          </button>
        </div>

        <h2 className="text-xl font-bold text-center">
          {format(currentDate, 'MMMM yyyy', { locale: ptBR })}
        </h2>
      </div>

      <div className="grid grid-cols-7 border-b">
        {['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'].map((day) => (
          <div 
            key={day} 
            className="text-center py-2 font-medium text-sm text-gray-500"
          >
            {day}
          </div>
        ))}
      </div>

      <div className="grid grid-cols-7 auto-rows-fr">
        {days.map((day) => {
          const formattedDate = format(day, 'd');
          const isCurrentMonth = isSameMonth(day, monthStart);
          const isCurrentDay = isToday(day);
          const dayOrders = getOrdersByDate(day);
          const hasOverdueOrders = dayOrders.some(order => isDeliveryOverdue(order));
          
          return (
            <div 
              key={day.toString()} 
              className={`border-t border-r min-h-[120px] ${
                isCurrentMonth ? 'bg-white' : 'bg-gray-50'
              } ${isCurrentDay ? 'bg-blue-50 font-bold' : ''}
              ${hasOverdueOrders ? 'bg-red-50' : ''}`}
            >
              <div className={`p-1 text-right ${
                isCurrentMonth ? 'text-gray-700' : 'text-gray-400'
              }`}>
                {formattedDate}
              </div>
              
              <div className="px-1 overflow-y-auto max-h-[100px]">
                {dayOrders.map((order) => {
                  const isOrderOverdue = isDeliveryOverdue(order);
                  
                  return (
                    <div 
                      key={order.id}
                      onClick={() => onOrderClick(order)}
                      className={`
                        mb-1 p-1 rounded text-xs cursor-pointer truncate flex items-center
                        ${
                          isOrderOverdue ? 'bg-red-100 text-red-800' :
                          order.status === 'completed' ? 'bg-green-100 text-green-800' :
                          order.status === 'urgent' ? 'bg-purple-100 text-purple-800' :
                          order.status === 'waiting-docs' ? 'bg-yellow-100 text-yellow-800' :
                          order.status === 'ready' ? 'bg-blue-100 text-blue-800' :
                          'bg-orange-100 text-orange-800'
                        }
                      `}
                    >
                      <span className="mr-1">{renderStatusIcon(order.status)}</span>
                      <span className="font-medium">#{order.orderNumber}</span>
                      <span className="ml-1 truncate"> - {order.customer}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default OrderCalendar;