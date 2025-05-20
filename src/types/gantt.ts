export interface WorkingHours {
  start: string;
  end: string;
}

export interface WorkingDay {
  enabled: boolean;
  hours: WorkingHours[];
}

export interface CompanyCalendar {
  monday: WorkingDay;
  tuesday: WorkingDay;
  wednesday: WorkingDay;
  thursday: WorkingDay;
  friday: WorkingDay;
  saturday: WorkingDay;
  sunday: WorkingDay;
}

export interface TaskUpdate {
  timestamp: string;
  progress: number;
  notes?: string;
}

export interface TaskAssignment {
  id: string;
  orderId: string;
  taskId: string;
  duration: number;
  startDate: string;
  endDate: string;
  progress: number;
  dependsOn?: string[];
  responsibleEmail: string;
  updates: TaskUpdate[];
}

export interface Task {
  id: string;
  name: string;
  description: string;
  color: string;
  order: number;
}