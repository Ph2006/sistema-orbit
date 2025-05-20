import React, { useState, useEffect } from 'react';
import { X, Trash2 } from 'lucide-react';
import { Task, TaskAssignment } from '../types/gantt';
import { Order } from '../types/kanban';
import { format, addDays, startOfDay } from 'date-fns';
import { collection, getDocs, deleteDoc, doc } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { useSettingsStore } from '../store/settingsStore';
import { addWorkingDays } from '../utils/calendar';

interface TaskAssignmentModalProps {
  order: Order;
  tasks: Task[];
  existingAssignments: TaskAssignment[];
  onClose: () => void;
  onSave: (assignments: TaskAssignment[]) => void;
}

const TaskAssignmentModal: React.FC<TaskAssignmentModalProps> = ({
  order,
  tasks,
  existingAssignments,
  onClose,
  onSave,
}) => {
  const { calendar } = useSettingsStore();
  const [assignments, setAssignments] = useState<TaskAssignment[]>(
    existingAssignments.map(assignment => ({
      ...assignment,
      updates: assignment.updates || []
    }))
  );
  const [availableTasks, setAvailableTasks] = useState<Task[]>([]);
  const [dependencyEnabled, setDependencyEnabled] = useState<Record<string, boolean>>({});

  useEffect(() => {
    loadTasks();
    const initialDependencyState: Record<string, boolean> = {};
    existingAssignments.forEach(assignment => {
      initialDependencyState[assignment.id] = !!assignment.dependsOn?.length;
    });
    setDependencyEnabled(initialDependencyState);
  }, []);

  const loadTasks = async () => {
    try {
      const querySnapshot = await getDocs(collection(db, 'tasks'));
      const tasksData = querySnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as Task[];
      setAvailableTasks(tasksData);
    } catch (error) {
      console.error('Error loading tasks:', error);
    }
  };

  const handleAddAssignment = () => {
    const newAssignmentId = crypto.randomUUID();
    const orderAssignments = assignments;
    
    let startDate = new Date(order.startDate);
    if (orderAssignments.length > 0) {
      const lastAssignment = orderAssignments[orderAssignments.length - 1];
      startDate = new Date(lastAssignment.endDate);
    }

    const endDate = addWorkingDays(startDate, 1, calendar);

    const newAssignment: TaskAssignment = {
      id: newAssignmentId,
      orderId: order.id,
      taskId: availableTasks[0]?.id || '',
      duration: 1,
      startDate: startDate.toISOString(),
      endDate: endDate.toISOString(),
      progress: 0,
      responsibleEmail: '',
      dependsOn: orderAssignments.length > 0 ? [orderAssignments[orderAssignments.length - 1].id] : undefined,
      updates: [],
    };

    setAssignments(prev => [...prev, newAssignment]);
    setDependencyEnabled(prev => ({
      ...prev,
      [newAssignmentId]: orderAssignments.length > 0
    }));
  };

  const handleDeleteAssignment = async (assignmentId: string) => {
    if (window.confirm('Tem certeza que deseja excluir esta tarefa?')) {
      try {
        if (assignmentId.includes('/')) {
          await deleteDoc(doc(db, 'taskAssignments', assignmentId));
        }
        
        setAssignments(prev => {
          const updatedAssignments = prev.filter(a => a.id !== assignmentId);
          return updatedAssignments.map(assignment => ({
            ...assignment,
            dependsOn: assignment.dependsOn?.filter(depId => depId !== assignmentId)
          }));
        });
      } catch (error) {
        console.error('Error deleting assignment:', error);
      }
    }
  };

  const updateDependentDates = (assignments: TaskAssignment[], startingAssignmentId: string) => {
    const updatedAssignments = [...assignments];
    const processedIds = new Set<string>();

    const updateDate = (assignmentId: string) => {
      if (processedIds.has(assignmentId)) return;
      processedIds.add(assignmentId);

      const assignment = updatedAssignments.find(a => a.id === assignmentId);
      if (!assignment) return;

      const dependentAssignments = updatedAssignments.filter(a => 
        a.dependsOn?.includes(assignmentId) && dependencyEnabled[a.id]
      );

      dependentAssignments.forEach(depAssignment => {
        // Get the previous assignment's end date
        const dependencyEndDate = new Date(assignment.endDate);
        
        // Set the start date to be the SAME as the dependency's end date
        // This is the key change - we're using the exact same date, not adding a day
        let startDate = dependencyEndDate;
        
        // Calculate end date based on duration and working days
        const endDate = addWorkingDays(startDate, depAssignment.duration, calendar);
        
        const index = updatedAssignments.findIndex(a => a.id === depAssignment.id);
        if (index !== -1) {
          updatedAssignments[index] = {
            ...depAssignment,
            startDate: startDate.toISOString(),
            endDate: endDate.toISOString(),
          };
          updateDate(depAssignment.id);
        }
      });
    };

    updateDate(startingAssignmentId);
    return updatedAssignments;
  };

  const handleUpdateAssignment = (
    assignmentId: string,
    field: keyof TaskAssignment,
    value: any
  ) => {
    setAssignments(prev => {
      const updatedAssignments = prev.map(assignment => {
        if (assignment.id !== assignmentId) return assignment;

        const updatedAssignment = { ...assignment };

        if (field === 'startDate') {
          const startDate = startOfDay(new Date(value));
          if (!isNaN(startDate.getTime())) {
            updatedAssignment.startDate = startDate.toISOString();
            updatedAssignment.endDate = addWorkingDays(
              startDate,
              updatedAssignment.duration,
              calendar
            ).toISOString();
          }
        } else if (field === 'duration') {
          const duration = parseFloat(value);
          if (!isNaN(duration) && duration > 0) {
            updatedAssignment.duration = duration;
            const startDate = new Date(updatedAssignment.startDate);
            updatedAssignment.endDate = addWorkingDays(
              startDate,
              duration,
              calendar
            ).toISOString();
          }
        } else if (field === 'progress') {
          updatedAssignment.progress = Math.max(0, Math.min(100, Number(value)));
        } else {
          updatedAssignment[field] = value;
        }

        return updatedAssignment;
      });

      return updateDependentDates(updatedAssignments, assignmentId);
    });
  };

  const handleToggleDependency = (assignmentId: string) => {
    setDependencyEnabled(prev => ({
      ...prev,
      [assignmentId]: !prev[assignmentId]
    }));

    setAssignments(prev => {
      const orderAssignments = prev.sort((a, b) => {
        const taskA = availableTasks.find(t => t.id === a.taskId)?.order || 0;
        const taskB = availableTasks.find(t => t.id === b.taskId)?.order || 0;
        return taskA - taskB;
      });

      const currentIndex = orderAssignments.findIndex(a => a.id === assignmentId);
      const previousAssignment = orderAssignments[currentIndex - 1];

      const updatedAssignments = prev.map(assignment => {
        if (assignment.id !== assignmentId) return assignment;

        const updatedAssignment = {
          ...assignment,
          dependsOn: !dependencyEnabled[assignmentId] && previousAssignment
            ? [previousAssignment.id]
            : undefined
        };

        if (!dependencyEnabled[assignmentId] && previousAssignment) {
          const prevEndDate = new Date(previousAssignment.endDate);
          
          // Start date is SAME as previous task's end date, not the day after
          // This is the key change - setting exact same date
          const nextStartDate = prevEndDate;
          
          updatedAssignment.startDate = nextStartDate.toISOString();
          updatedAssignment.endDate = addWorkingDays(
            nextStartDate,
            assignment.duration,
            calendar
          ).toISOString();
        }

        return updatedAssignment;
      });

      return updateDependentDates(updatedAssignments, assignmentId);
    });
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSave(assignments);
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center">
      <div className="bg-white rounded-lg p-6 max-w-4xl w-full max-h-[90vh] overflow-y-auto">
        <div className="flex justify-between items-center mb-6">
          <div>
            <h2 className="text-2xl font-bold">
              Atribuir Tarefas - Pedido #{order.orderNumber}
            </h2>
            <p className="text-gray-600 mt-1">
              Cliente: {order.customer}
            </p>
          </div>
          <button onClick={onClose}>
            <X className="h-6 w-6" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="flex justify-end">
            <button
              type="button"
              onClick={handleAddAssignment}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
            >
              Adicionar Tarefa
            </button>
          </div>

          <div className="space-y-4">
            {assignments
              .sort((a, b) => {
                const taskA = availableTasks.find(t => t.id === a.taskId)?.order || 0;
                const taskB = availableTasks.find(t => t.id === b.taskId)?.order || 0;
                return taskA - taskB;
              })
              .map((assignment, index, sortedAssignments) => (
                <div
                  key={assignment.id}
                  className="space-y-4 bg-gray-50 p-4 rounded-lg"
                >
                  <div className="grid grid-cols-6 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700">
                        Tarefa
                      </label>
                      <select
                        value={assignment.taskId}
                        onChange={(e) =>
                          handleUpdateAssignment(
                            assignment.id,
                            'taskId',
                            e.target.value
                          )
                        }
                        className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring focus:ring-blue-200"
                        required
                      >
                        {availableTasks
                          .sort((a, b) => a.order - b.order)
                          .map((task) => (
                            <option key={task.id} value={task.id}>
                              {task.name}
                            </option>
                          ))
                        }
                      </select>
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700">
                        Data de Início
                      </label>
                      <input
                        type="date"
                        value={assignment.startDate.split('T')[0]}
                        onChange={(e) =>
                          handleUpdateAssignment(
                            assignment.id,
                            'startDate',
                            e.target.value
                          )
                        }
                        className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring focus:ring-blue-200"
                        required
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700">
                        Duração (dias)
                      </label>
                      <input
                        type="number"
                        step="0.1"
                        min="0.1"
                        value={assignment.duration}
                        onChange={(e) =>
                          handleUpdateAssignment(
                            assignment.id,
                            'duration',
                            parseFloat(e.target.value)
                          )
                        }
                        className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring focus:ring-blue-200"
                        required
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700">
                        Responsável (email)
                      </label>
                      <input
                        type="email"
                        value={assignment.responsibleEmail}
                        onChange={(e) =>
                          handleUpdateAssignment(
                            assignment.id,
                            'responsibleEmail',
                            e.target.value
                          )
                        }
                        className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring focus:ring-blue-200"
                        required
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700">
                        Progresso (%)
                      </label>
                      <input
                        type="number"
                        min="0"
                        max="100"
                        value={assignment.progress}
                        onChange={(e) =>
                          handleUpdateAssignment(
                            assignment.id,
                            'progress',
                            parseInt(e.target.value)
                          )
                        }
                        className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring focus:ring-blue-200"
                        required
                      />
                    </div>

                    <div className="flex items-end space-x-2">
                      {index > 0 && (
                        <div className="flex items-center">
                          <input
                            type="checkbox"
                            id={`dependency-${assignment.id}`}
                            checked={dependencyEnabled[assignment.id]}
                            onChange={() => handleToggleDependency(assignment.id)}
                            className="h-4 w-4 text-blue-600 rounded focus:ring-blue-500"
                          />
                          <label
                            htmlFor={`dependency-${assignment.id}`}
                            className="ml-2 text-sm text-gray-600"
                          >
                            Depende da anterior
                          </label>
                        </div>
                      )}
                      <button
                        type="button"
                        onClick={() => handleDeleteAssignment(assignment.id)}
                        className="text-red-600 hover:text-red-800 p-2"
                        title="Excluir tarefa"
                      >
                        <Trash2 className="h-5 w-5" />
                      </button>
                    </div>
                  </div>

                  {dependencyEnabled[assignment.id] && index > 0 && (
                    <div className="col-span-6 text-sm text-gray-600">
                      Depende da conclusão de: {availableTasks.find(t => t.id === sortedAssignments[index - 1].taskId)?.name}
                    </div>
                  )}

                  <div className="text-sm text-gray-600">
                    Data de término: {format(new Date(assignment.endDate), 'dd/MM/yyyy')}
                  </div>
                </div>
              ))}
          </div>

          <div className="flex justify-end space-x-4">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 border border-gray-300 rounded-md hover:bg-gray-50"
            >
              Cancelar
            </button>
            <button
              type="submit"
              className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
            >
              Salvar
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default TaskAssignmentModal;