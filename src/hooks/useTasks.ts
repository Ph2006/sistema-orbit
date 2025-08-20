// src/hooks/useTasks.ts
import { useState, useEffect } from 'react';
import { TaskDocument, subscribeToTasks } from '@/lib/firestore/tasks';

export const useTasks = () => {
  const [tasks, setTasks] = useState<TaskDocument[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const unsubscribe = subscribeToTasks((newTasks) => {
      setTasks(newTasks);
      setLoading(false);
    });

    return unsubscribe;
  }, []);

  return { tasks, loading, error };
};
