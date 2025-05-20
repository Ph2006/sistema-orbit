export const calculateItemProgress = (progress?: Record<string, number>) => {
  if (!progress || Object.keys(progress).length === 0) return 0;
  const values = Object.values(progress);
  return Math.round(values.reduce((sum, val) => sum + val, 0) / values.length);
};

export const calculateOrderProgress = (items: { progress?: Record<string, number> }[]) => {
  if (items.length === 0) return 0;
  return Math.round(
    items.reduce((sum, item) => sum + calculateItemProgress(item.progress), 0) / items.length
  );
};

export const getProgressColor = (value: number) => {
  if (value === 100) return 'bg-green-500';
  if (value >= 70) return 'bg-blue-500';
  if (value >= 30) return 'bg-yellow-500';
  return 'bg-red-500';
};