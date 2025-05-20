import React, { useState } from 'react';
import { X, Plus, Trash2 } from 'lucide-react';
import { CompanyCalendar, WorkingDay, WorkingHours } from '../types/gantt';

interface CalendarSettingsModalProps {
  calendar: CompanyCalendar;
  onClose: () => void;
  onSave: (calendar: CompanyCalendar) => void;
}

const CalendarSettingsModal: React.FC<CalendarSettingsModalProps> = ({
  calendar,
  onClose,
  onSave,
}) => {
  const [formData, setFormData] = useState<CompanyCalendar>(calendar);

  const handleDayToggle = (day: keyof CompanyCalendar) => {
    setFormData(prev => ({
      ...prev,
      [day]: {
        ...prev[day],
        enabled: !prev[day].enabled,
      },
    }));
  };

  const handleAddHours = (day: keyof CompanyCalendar) => {
    const currentHours = formData[day].hours;
    let newPeriod: WorkingHours;

    if (currentHours.length === 0) {
      // First period of the day
      newPeriod = { start: '08:00', end: '12:00' };
    } else if (currentHours.length === 1) {
      // Second period (after lunch)
      newPeriod = { start: '13:00', end: '17:00' };
    } else {
      // Additional periods
      const lastPeriod = currentHours[currentHours.length - 1];
      const [hours] = lastPeriod.end.split(':');
      const startHour = parseInt(hours);
      newPeriod = {
        start: `${startHour + 1}:00`,
        end: `${startHour + 4}:00`
      };
    }

    setFormData(prev => ({
      ...prev,
      [day]: {
        ...prev[day],
        hours: [...prev[day].hours, newPeriod],
      },
    }));
  };

  const handleRemoveHours = (day: keyof CompanyCalendar, index: number) => {
    setFormData(prev => ({
      ...prev,
      [day]: {
        ...prev[day],
        hours: prev[day].hours.filter((_, i) => i !== index),
      },
    }));
  };

  const handleHoursChange = (
    day: keyof CompanyCalendar,
    index: number,
    field: keyof WorkingHours,
    value: string
  ) => {
    setFormData(prev => ({
      ...prev,
      [day]: {
        ...prev[day],
        hours: prev[day].hours.map((hours, i) =>
          i === index ? { ...hours, [field]: value } : hours
        ),
      },
    }));
  };

  const days: { key: keyof CompanyCalendar; label: string }[] = [
    { key: 'monday', label: 'Segunda-feira' },
    { key: 'tuesday', label: 'Terça-feira' },
    { key: 'wednesday', label: 'Quarta-feira' },
    { key: 'thursday', label: 'Quinta-feira' },
    { key: 'friday', label: 'Sexta-feira' },
    { key: 'saturday', label: 'Sábado' },
    { key: 'sunday', label: 'Domingo' },
  ];

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center">
      <div className="bg-white rounded-lg p-6 max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-2xl font-bold">Configurações do Calendário</h2>
          <button onClick={onClose}>
            <X className="h-6 w-6" />
          </button>
        </div>

        <div className="space-y-6">
          {days.map(({ key, label }) => (
            <div key={key} className="border-b pb-4">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center">
                  <input
                    type="checkbox"
                    checked={formData[key].enabled}
                    onChange={() => handleDayToggle(key)}
                    className="h-4 w-4 text-blue-600 rounded"
                  />
                  <span className="ml-2 font-medium">{label}</span>
                </div>
                {formData[key].enabled && (
                  <button
                    onClick={() => handleAddHours(key)}
                    className="text-blue-600 hover:text-blue-800"
                  >
                    <Plus className="h-5 w-5" />
                  </button>
                )}
              </div>

              {formData[key].enabled && (
                <div className="space-y-3">
                  {formData[key].hours.map((hours, index) => (
                    <div key={index} className="flex items-center space-x-4">
                      <input
                        type="time"
                        value={hours.start}
                        onChange={(e) =>
                          handleHoursChange(key, index, 'start', e.target.value)
                        }
                        className="rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring focus:ring-blue-200"
                      />
                      <span>até</span>
                      <input
                        type="time"
                        value={hours.end}
                        onChange={(e) =>
                          handleHoursChange(key, index, 'end', e.target.value)
                        }
                        className="rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring focus:ring-blue-200"
                      />
                      <button
                        onClick={() => handleRemoveHours(key, index)}
                        className="text-red-600 hover:text-red-800"
                      >
                        <Trash2 className="h-5 w-5" />
                      </button>
                      {index === 0 && formData[key].hours.length > 1 && (
                        <span className="text-sm text-gray-500">Manhã</span>
                      )}
                      {index === 1 && (
                        <span className="text-sm text-gray-500">Tarde</span>
                      )}
                    </div>
                  ))}
                  {formData[key].hours.length === 2 && (
                    <div className="mt-2 text-sm text-gray-500 italic">
                      Intervalo de almoço: {formData[key].hours[0].end} - {formData[key].hours[1].start}
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>

        <div className="mt-6 flex justify-end space-x-4">
          <button
            onClick={onClose}
            className="px-4 py-2 border border-gray-300 rounded-md hover:bg-gray-50"
          >
            Cancelar
          </button>
          <button
            onClick={() => onSave(formData)}
            className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
          >
            Salvar
          </button>
        </div>
      </div>
    </div>
  );
};

export default CalendarSettingsModal;