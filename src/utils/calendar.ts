import { addDays, format, isWeekend } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { CompanyCalendar } from '../types/gantt';

export const isWorkingDay = (date: Date, calendar: CompanyCalendar): boolean => {
  const dayOfWeek = format(date, 'EEEE', { locale: ptBR }).toLowerCase() as keyof CompanyCalendar;
  return calendar[dayOfWeek]?.enabled || false;
};

export const getNextWorkingDay = (date: Date, calendar: CompanyCalendar): Date => {
  let nextDate = addDays(date, 1);
  while (!isWorkingDay(nextDate, calendar) || isWeekend(nextDate)) {
    nextDate = addDays(nextDate, 1);
  }
  return nextDate;
};

export const addWorkingDays = (startDate: Date, days: number, calendar: CompanyCalendar): Date => {
  // First, check if the start date is a working day; if not, find the next working day
  let adjustedStartDate = startDate;
  if (!isWorkingDay(adjustedStartDate, calendar) || isWeekend(adjustedStartDate)) {
    adjustedStartDate = getNextWorkingDay(startDate);
  }

  // If duration is less than 1 day, the task ends on the same (working) day
  if (days < 1) {
    return adjustedStartDate;
  }

  // For durations of 1+ days, add whole working days
  let currentDate = adjustedStartDate;
  let workingDaysToAdd = Math.floor(days);
  
  while (workingDaysToAdd > 0) {
    currentDate = addDays(currentDate, 1);
    // Only count as a working day if it's neither weekend nor non-working day
    if (isWorkingDay(currentDate, calendar) && !isWeekend(currentDate)) {
      workingDaysToAdd--;
    }
  }
  
  // Handle partial days (0.5 days, etc.)
  // For fractional days > 0, we don't add another day
  
  return currentDate;
};