import React, { useState, useEffect } from 'react';
import { Plus, Settings, Mail, Download, ImageIcon, ChevronDown, ChevronRight } from 'lucide-react';
import { TaskAssignment, Task } from '../types/gantt';
import { Order } from '../types/kanban';
import { collection, getDocs, addDoc, updateDoc, deleteDoc, doc, onSnapshot, query, where } from 'firebase/firestore';
import { db } from '../lib/firebase';
import TaskAssignmentModal from './TaskAssignmentModal';
import TaskModal from './TaskModal';
import CalendarSettingsModal from './CalendarSettingsModal';
import { jsPDF } from 'jspdf';
import { useSettingsStore } from '../store/settingsStore';
import { useOrderStore } from '../store/orderStore';
import { useTaskStore } from '../store/taskStore';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { addWorkingDays } from '../utils/calendar';

const Gantt: React.FC = () => {
  const [isAssignmentModalOpen, setIsAssignmentModalOpen] = useState(false);
  const [isTaskModalOpen, setIsTaskModalOpen] = useState(false);
  const [isCalendarModalOpen, setIsCalendarModalOpen] = useState(false);
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);
  const [taskAssignments, setTaskAssignments] = useState<TaskAssignment[]>([]);
  const [expandedOrders, setExpandedOrders] = useState<Set<string>>(new Set());

  const { orders, subscribeToOrders } = useOrderStore();
  const { tasks, loadTasks } = useTaskStore();
  const { companyLogo, calendar, setCalendar, setCompanyLogo } = useSettingsStore();

  useEffect(() => {
    const unsubscribe = subscribeToOrders();
    return () => unsubscribe();
  }, [subscribeToOrders]);

  useEffect(() => {
    loadTasks();
  }, [loadTasks]);

  useEffect(() => {
    if (!orders.length) return;

    const assignmentsRef = collection(db, 'taskAssignments');
    const assignmentsQuery = query(
      assignmentsRef,
      where('orderId', 'in', orders.map(o => o.id))
    );

    const unsubscribe = onSnapshot(assignmentsQuery, (snapshot) => {
      const assignmentsData = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as TaskAssignment[];
      setTaskAssignments(assignmentsData);
    });

    return () => unsubscribe();
  }, [orders]);

  const handleSaveAssignments = async (assignments: TaskAssignment[]) => {
    try {
      // Delete existing assignments
      const q = query(collection(db, 'taskAssignments'), where('orderId', '==', selectedOrder?.id));
      const snapshot = await getDocs(q);
      const deletePromises = snapshot.docs.map(doc => deleteDoc(doc.ref));
      await Promise.all(deletePromises);

      // Process assignments to respect working days
      const processedAssignments = assignments.map(assignment => {
        const startDate = new Date(assignment.startDate);
        const endDate = addWorkingDays(startDate, assignment.duration, calendar);

        return {
          ...assignment,
          endDate: endDate.toISOString()
        };
      });

      // Add new assignments
      const addPromises = processedAssignments.map(assignment => {
        const { id, ...assignmentData } = assignment;
        
        // Create a clean object without undefined values
        const cleanAssignment = {
          ...assignmentData,
          // Only include dependsOn if it exists and has items
          ...(assignment.dependsOn?.length ? { dependsOn: assignment.dependsOn } : {})
        };

        return addDoc(collection(db, 'taskAssignments'), cleanAssignment);
      });
      
      await Promise.all(addPromises);

      setIsAssignmentModalOpen(false);
      setSelectedOrder(null);
    } catch (error) {
      console.error('Error saving assignments:', error);
    }
  };

  const handleTaskUpdate = async (assignment: TaskAssignment) => {
    try {
      const assignmentRef = doc(db, 'taskAssignments', assignment.id);
      const { id, ...assignmentData } = assignment;
      await updateDoc(assignmentRef, assignmentData);
    } catch (error) {
      console.error('Error updating task:', error);
    }
  };

  const handleSaveTask = async (task: Task) => {
    try {
      if (selectedTask) {
        const taskRef = doc(db, 'tasks', task.id);
        await updateDoc(taskRef, task);
      } else {
        await addDoc(collection(db, 'tasks'), task);
      }
      await loadTasks();
      setIsTaskModalOpen(false);
      setSelectedTask(null);
    } catch (error) {
      console.error('Error saving task:', error);
    }
  };

  const handleLogoChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (e) => {
        const dataUrl = e.target?.result as string;
        setCompanyLogo(dataUrl);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleExportSimplifiedPDF = () => {
    const doc = new jsPDF();
    
    // Add logo if available
    let startY = 20;
    if (companyLogo) {
      doc.addImage(companyLogo, 'JPEG', 20, 10, 40, 20);
      doc.setFontSize(16);
      doc.text('Lista de Pedidos', 70, 25);
      startY = 40;
    } else {
      doc.setFontSize(16);
      doc.text('Lista de Pedidos', 20, startY);
    }

    // Add date
    doc.setFontSize(12);
    doc.text(`Data: ${format(new Date(), 'dd/MM/yyyy')}`, 20, startY + 10);
    let y = startY + 30;

    orders.forEach(order => {
      if (y > 250) {
        doc.addPage();
        y = 20;
      }

      // Order header with colored background
      const orderProgress = getOrderProgress(order.id);
      
      // Set colors based on progress
      if (orderProgress === 100) {
        doc.setFillColor(34, 197, 94); // Green
      } else if (orderProgress >= 70) {
        doc.setFillColor(59, 130, 246); // Blue
      } else if (orderProgress >= 30) {
        doc.setFillColor(234, 179, 8); // Yellow
      } else {
        doc.setFillColor(239, 68, 68); // Red
      }

      doc.rect(20, y - 5, 170, 10, 'F');
      doc.setTextColor(255, 255, 255);
      doc.text(`Pedido #${order.orderNumber} - ${order.customer} (${orderProgress}%)`, 25, y);
      y += 10;

      doc.setTextColor(0, 0, 0);
      doc.text(`OS: ${order.internalOrderNumber}`, 25, y);
      y += 7;
      doc.text(`Início: ${format(new Date(order.startDate), 'dd/MM/yyyy', { locale: ptBR })}`, 25, y);
      y += 7;
      doc.text(`Entrega: ${format(new Date(order.deliveryDate), 'dd/MM/yyyy', { locale: ptBR })}`, 25, y);
      y += 15;
    });

    doc.save('lista-pedidos.pdf');
  };

  const handleExportDetailedPDF = (order: Order) => {
    const doc = new jsPDF({
      orientation: 'landscape',
      unit: 'mm',
      format: 'a3'
    });

    // Get page dimensions
    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    const margin = 15;
    const infoColumnWidth = 120; // Increased width for task information
    const ganttWidth = pageWidth - margin * 2 - infoColumnWidth;

    // Add logo and Title
    let y = 15;
    if (companyLogo) {
      doc.addImage(companyLogo, 'JPEG', margin, y, 30, 15);
      doc.setFontSize(18);
      doc.setFont(undefined, 'bold');
      doc.text(`CRONOGRAMA PEDIDO #${order.orderNumber}`, pageWidth / 2, y + 7.5, { align: 'center' });
      y += 20;
    } else {
      doc.setFontSize(18);
      doc.setFont(undefined, 'bold');
      doc.text(`CRONOGRAMA PEDIDO #${order.orderNumber}`, pageWidth / 2, y, { align: 'center' });
      y += 15;
    }

    // Project Name below title (if available)
    if (order.projectName) {
      doc.setFontSize(14);
      doc.setFont(undefined, 'normal');
      doc.text(`PROJETO ${order.projectName}`, pageWidth / 2, y, { align: 'center' });
      y += 10;
    }

    // Order info
    doc.setFontSize(10);
    doc.setFont(undefined, 'normal');
    doc.text(`Cliente: ${order.customer}`, margin, y);
    doc.text(`OS: ${order.internalOrderNumber}`, margin + 60, y);
    doc.text(`Data de Início: ${format(new Date(order.startDate), 'dd/MM/yyyy', { locale: ptBR })}`, margin + 120, y);
    doc.text(`Data de Entrega: ${format(new Date(order.deliveryDate), 'dd/MM/yyyy', { locale: ptBR })}`, margin + 180, y);
    y += 10;

    // Calculate date range for the Gantt chart
    const allDates = order.items.flatMap(item => {
      const itemAssignments = taskAssignments.filter(a => a.orderId === order.id && a.itemId === item.id);
      return itemAssignments.flatMap(a => [
        new Date(a.startDate),
        new Date(a.endDate)
      ]);
    });

    const minDate = new Date(Math.min(...allDates.map(d => d.getTime())));
    const maxDate = new Date(Math.max(...allDates.map(d => d.getTime())));
    
    // Add padding days
    minDate.setDate(minDate.getDate() - 7); // 1 week before first task
    maxDate.setDate(maxDate.getDate() + 14); // 2 weeks after last task

    // Create date header (Daily columns)
    const dateHeader = [];
    const currentDate = new Date(minDate);
    while (currentDate <= maxDate) {
      dateHeader.push(new Date(currentDate));
      currentDate.setDate(currentDate.getDate() + 1);
    }

    // Calculate column width for dates
    const totalDays = dateHeader.length;
    const dateColumnWidth = ganttWidth / totalDays;
    const rowHeight = 8; // Height for each task row

    // Draw date header (Days of the week and Day number)
    let headerY = y + 5;
    let currentHeaderX = margin + infoColumnWidth;

    doc.setFontSize(6);
    doc.setFont(undefined, 'bold');
    dateHeader.forEach((date, index) => {
      // Draw day of the week (Initial letter)
      doc.text(format(date, 'EEE', { locale: ptBR }).substring(0,1).toUpperCase(), currentHeaderX + dateColumnWidth/2, headerY, { align: 'center' });
      // Draw day number
      doc.text(format(date, 'dd'), currentHeaderX + dateColumnWidth/2, headerY + 4, { align: 'center' });

      currentHeaderX += dateColumnWidth;
    });
    headerY += 8;

    // Draw horizontal line below date header
    doc.line(margin + infoColumnWidth, headerY, pageWidth - margin, headerY);

    let currentContentY = headerY + 2;

    // Draw vertical grid lines for dates
    let gridX = margin + infoColumnWidth;
    doc.setDrawColor(220, 220, 220); // Light gray for grid lines
    for (let i = 0; i <= totalDays; i++) {
      doc.line(gridX, headerY, gridX, currentContentY + (order.items.length + taskAssignments.length) * rowHeight * 1.5); // Extend lines down
      gridX += dateColumnWidth;
    }
    doc.setDrawColor(0, 0, 0); // Reset draw color

    // Process each item and its assignments
    order.items.forEach(item => {
      // Item header (on the left)
      doc.setFontSize(8);
      doc.setFont(undefined, 'bold');
      doc.text(`Item ${item.itemNumber}: ${item.code}`, margin, currentContentY + 3);
      doc.setFont(undefined, 'normal');
      doc.text(item.description, margin + 3, currentContentY + 7);

      // Get and sort assignments for this item
      const itemAssignments = taskAssignments
        .filter(a => a.orderId === order.id && a.itemId === item.id)
        .sort((a, b) => {
          const taskA = tasks.find(t => t.id === a.taskId)?.order || 0;
          const taskB = tasks.find(t => t.id === b.taskId)?.order || 0;
          return taskA - taskB;
        });

      currentContentY += 12; // Space after item header

      // Draw assignments as Gantt bars and info on the left
      itemAssignments.forEach(assignment => {
        const task = tasks.find(t => t.id === assignment.taskId);
        if (!task) return;

        // Task info on the left
        doc.setFontSize(7);
        doc.setFont(undefined, 'normal');
        doc.text(`${task.name}`, margin + 5, currentContentY + rowHeight / 2 + 2);
        doc.text(`${assignment.progress}%`, infoColumnWidth - 10, currentContentY + rowHeight / 2 + 2, { align: 'right' });

        // Calculate task bar position
        const startX = margin + infoColumnWidth + 
          (new Date(assignment.startDate).getTime() - minDate.getTime()) / (24 * 60 * 60 * 1000) * dateColumnWidth;
        const endX = margin + infoColumnWidth + 
          (new Date(assignment.endDate).getTime() - minDate.getTime()) / (24 * 60 * 60 * 1000) * dateColumnWidth;
        const width = Math.max(dateColumnWidth / 2, endX - startX); // Ensure minimum width

        // Task status color
        const statusColor = assignment.progress === 100 ? [34, 197, 94] : // Green (Concluído)
                          assignment.progress >= 70 ? [59, 130, 246] : // Blue (Em Andamento)
                          assignment.progress >= 30 ? [234, 179, 8] : // Yellow (Em Progresso)
                          [239, 68, 68]; // Red (Atrasado)

        // Draw task bar
        doc.setFillColor(...statusColor);
        doc.rect(startX, currentContentY, width, rowHeight, 'F');

        // Add progress percentage text on bar
        if (assignment.progress > 0) { // Only show progress if > 0
           doc.setTextColor(255, 255, 255);
           doc.setFontSize(6);
           doc.text(`${assignment.progress}%`, startX + width / 2, currentContentY + rowHeight / 2 + 1, { align: 'center' });
           doc.setTextColor(0, 0, 0); // Reset text color
        }

        // Add dependencies if any
        if (assignment.dependsOn && assignment.dependsOn.length > 0) {
          assignment.dependsOn.forEach(depId => {
            const depAssignment = taskAssignments.find(a => a.id === depId);
            if (depAssignment) {
              const depEndX = margin + infoColumnWidth + 
                (new Date(depAssignment.endDate).getTime() - minDate.getTime()) / (24 * 60 * 60 * 1000) * dateColumnWidth;
              
              // Draw dependency line (from end of dependency to start of current task)
              doc.setDrawColor(100, 100, 100);
              doc.setLineWidth(0.3);
              // Simple line for now, complex routing is difficult with jsPDF directly
              // Draw line from dependency end (centered vertically on its row) to current task start (centered vertically)
              const depY = currentContentY - (itemAssignments.findIndex(a => a.id === assignment.id) - itemAssignments.findIndex(a => a.id === depAssignment.id)) * (rowHeight + 5) + rowHeight/2; // Approximate Y of dependency
              doc.line(depEndX, depY, startX, currentContentY + rowHeight/2);
              
              // Draw arrow at the startX point
              doc.setFillColor(100, 100, 100);
              doc.triangle(
                startX - 2, currentContentY + rowHeight/2,
                startX - 2, currentContentY + rowHeight/2 - 2,
                startX, currentContentY + rowHeight/2,
                'F'
              );
            }
          });
          doc.setDrawColor(0, 0, 0); // Reset draw color
        }

        currentContentY += rowHeight + 5; // Space between task bars
      });

      currentContentY += 10; // Space after item block
    });

    // Add legend
    const legendY = pageHeight - 30;
    doc.setFontSize(8);
    doc.setTextColor(0, 0, 0);
    doc.text('Legenda:', margin, legendY);
    
    // Status colors legend
    const legendItems = [
      { color: [34, 197, 94], label: 'Concluído' },
      { color: [59, 130, 246], label: 'Em Andamento' },
      { color: [234, 179, 8], label: 'Em Progresso' },
      { color: [239, 68, 68], label: 'Atrasado' }
    ];

    let legendX = margin + 25;
    legendItems.forEach(item => {
      doc.setFillColor(...item.color);
      doc.rect(legendX, legendY - 3, 8, 4, 'F');
      doc.text(item.label, legendX + 10, legendY);
      legendX += 40; // Adjust spacing based on label length
    });

    // Add footer with page number and date
    const totalPages = doc.getNumberOfPages();
    for (let i = 1; i <= totalPages; i++) {
      doc.setPage(i);
      doc.setFontSize(8);
      doc.setTextColor(100, 100, 100);
      doc.text(
        `Relatório gerado em ${format(new Date(), 'dd/MM/yyyy HH:mm', { locale: ptBR })}`,
        margin,
        pageHeight - 10
      );
      doc.text(
        `Página ${i} de ${totalPages}`,
        pageWidth - margin,
        pageHeight - 10,
        { align: 'right' }
      );
    }

    doc.save(`cronograma-pedido-${order.orderNumber}.pdf`);
  };

  const getOrderProgress = (orderId: string) => {
    const orderAssignments = taskAssignments.filter(a => a.orderId === orderId);
    if (orderAssignments.length === 0) return 0;
    const totalProgress = orderAssignments.reduce((sum, a) => sum + a.progress, 0);
    return Math.round(totalProgress / orderAssignments.length);
  };

  const toggleOrderExpansion = (orderId: string) => {
    setExpandedOrders(prev => {
      const newSet = new Set(prev);
      if (newSet.has(orderId)) {
        newSet.delete(orderId);
      } else {
        newSet.add(orderId);
      }
      return newSet;
    });
  };

  return (
    <div className="p-6">
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-2xl font-bold">Gerenciamento de Tarefas</h2>
        <div className="flex space-x-4">
          <button
            onClick={() => setIsCalendarModalOpen(true)}
            className="flex items-center px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700"
          >
            <Settings className="h-5 w-5 mr-2" />
            Calendário
          </button>
          <label className="flex items-center px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700 cursor-pointer">
            <ImageIcon className="h-5 w-5 mr-2" />
            Logo do Relatório
            <input
              type="file"
              accept="image/*"
              className="hidden"
              onChange={handleLogoChange}
            />
          </label>
          <button
            onClick={() => setIsTaskModalOpen(true)}
            className="flex items-center px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700"
          >
            <Plus className="h-5 w-5 mr-2" />
            Nova Tarefa
          </button>
          <button
            onClick={handleExportSimplifiedPDF}
            className="flex items-center px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700"
          >
            <Download className="h-5 w-5 mr-2" />
            Exportar Lista
          </button>
        </div>
      </div>

      <div className="space-y-4">
        {orders.map(order => {
          const isExpanded = expandedOrders.has(order.id);
          const orderProgress = getOrderProgress(order.id);

          return (
            <div key={order.id} className="bg-white rounded-lg shadow-lg overflow-hidden">
              <div 
                className="p-4 cursor-pointer hover:bg-gray-50 transition-colors"
                onClick={() => toggleOrderExpansion(order.id)}
              >
                <div className="flex justify-between items-start">
                  <div className="flex items-start space-x-3">
                    {isExpanded ? (
                      <ChevronDown className="h-5 w-5 mt-1 text-gray-500" />
                    ) : (
                      <ChevronRight className="h-5 w-5 mt-1 text-gray-500" />
                    )}
                    <div>
                      <h3 className="text-xl font-bold">Pedido #{order.orderNumber}</h3>
                      <p className="text-gray-600">Cliente: {order.customer}</p>
                      <p className="text-gray-600">
                        Início: {format(new Date(order.startDate), 'dd/MM/yyyy', { locale: ptBR })} | 
                        Entrega: {format(new Date(order.deliveryDate), 'dd/MM/yyyy', { locale: ptBR })}
                      </p>
                      <div className="mt-2">
                        <div className="flex justify-between text-sm text-gray-600 mb-1">
                          <span>Progresso Geral</span>
                          <span>{orderProgress}%</span>
                        </div>
                        <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
                          <div
                            className={`h-full ${
                              orderProgress === 100 ? 'bg-green-500' :
                              orderProgress >= 70 ? 'bg-blue-500' :
                              orderProgress >= 30 ? 'bg-yellow-500' :
                              'bg-red-500'
                            }`}
                            style={{ width: `${orderProgress}%` }}
                          />
                        </div>
                      </div>
                    </div>
                  </div>
                  <div className="flex space-x-2">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleExportDetailedPDF(order);
                      }}
                      className="px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700"
                    >
                      <Download className="h-5 w-5" />
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setSelectedOrder(order);
                        setIsAssignmentModalOpen(true);
                      }}
                      className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
                    >
                      Gerenciar Tarefas
                    </button>
                  </div>
                </div>
              </div>

              {isExpanded && (
                <div className="border-t bg-gray-50 p-4">
                  {order.items.map(item => {
                    const itemAssignments = taskAssignments
                      .filter(a => a.orderId === order.id && a.itemId === item.id)
                      .sort((a, b) => {
                        const taskA = tasks.find(t => t.id === a.taskId)?.order || 0;
                        const taskB = tasks.find(t => t.id === b.taskId)?.order || 0;
                        return taskA - taskB;
                      });

                    return (
                      <div key={item.id} className="mb-6 last:mb-0">
                        <div className="mb-4">
                          <h4 className="font-semibold">
                            Item {item.itemNumber}: {item.code} - {item.description}
                          </h4>
                          <p className="text-sm text-gray-600">
                            Quantidade: {item.quantity} | 
                            Peso: {item.totalWeight.toLocaleString('pt-BR')} kg
                          </p>
                        </div>

                        <div className="space-y-3">
                          {itemAssignments.map(assignment => {
                            const task = tasks.find(t => t.id === assignment.taskId);
                            if (!task) return null;

                            return (
                              <div 
                                key={assignment.id}
                                className={`p-3 rounded-lg ${
                                  assignment.progress === 100 ? 'bg-green-50 border-green-200' :
                                  assignment.progress >= 70 ? 'bg-blue-50 border-blue-200' :
                                  assignment.progress >= 30 ? 'bg-yellow-50 border-yellow-200' :
                                  'bg-red-50 border-red-200'
                                } border`}
                              >
                                <div className="flex justify-between items-start">
                                  <div>
                                    <h5 className="font-medium">{task.name}</h5>
                                    <p className="text-sm text-gray-600">
                                      {format(new Date(assignment.startDate), 'dd/MM/yyyy', { locale: ptBR })} - {format(new Date(assignment.endDate), 'dd/MM/yyyy', { locale: ptBR })}
                                    </p>
                                    <p className="text-sm text-gray-600">
                                      Responsável: {assignment.responsibleEmail}
                                    </p>
                                  </div>
                                  <div className="text-right">
                                    <span className="font-medium">{assignment.progress}%</span>
                                    {assignment.progress < 100 && (
                                      <button
                                        onClick={() => handleTaskUpdate(assignment)}
                                        className="block mt-2 text-blue-600 hover:text-blue-800"
                                      >
                                        <Mail className="h-4 w-4" />
                                      </button>
                                    )}
                                  </div>
                                </div>

                                <div className="mt-2">
                                  <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
                                    <div
                                      className={`h-full ${
                                        assignment.progress === 100 ? 'bg-green-500' :
                                        assignment.progress >= 70 ? 'bg-blue-500' :
                                        assignment.progress >= 30 ? 'bg-yellow-500' :
                                        'bg-red-500'
                                      }`}
                                      style={{ width: `${assignment.progress}%` }}
                                    />
                                  </div>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {isAssignmentModalOpen && selectedOrder && (
        <TaskAssignmentModal
          order={selectedOrder}
          tasks={tasks}
          existingAssignments={taskAssignments.filter(a => a.orderId === selectedOrder.id)}
          onClose={() => {
            setIsAssignmentModalOpen(false);
            setSelectedOrder(null);
          }}
          onSave={handleSaveAssignments}
        />
      )}

      {isTaskModalOpen && (
        <TaskModal
          task={selectedTask}
          onClose={() => {
            setIsTaskModalOpen(false);
            setSelectedTask(null);
          }}
          onSave={handleSaveTask}
        />
      )}

      {isCalendarModalOpen && (
        <CalendarSettingsModal
          calendar={calendar}
          onClose={() => setIsCalendarModalOpen(false)}
          onSave={(newCalendar) => {
            setCalendar(newCalendar);
            setIsCalendarModalOpen(false);
          }}
        />
      )}
    </div>
  );
};

export default Gantt;