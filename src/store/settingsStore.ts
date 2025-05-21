import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { CompanyCalendar } from '../types/gantt';
import { useAuthStore } from './authStore'; // Import authStore

interface SettingsState {
  backgroundImage: string | null;
  companyLogo: string | null;
  companyName: string | null;
  companyCNPJ: string | null;
  companyResponsible: string | null;
  calendar: CompanyCalendar;
  setBackgroundImage: (image: string | null) => void;
  setCompanyLogo: (logo: string | null) => void;
  setCompanyName: (name: string) => void;
  setCompanyCNPJ: (cnpj: string) => void;
  setCompanyResponsible: (responsible: string) => void;
  setCalendar: (calendar: CompanyCalendar) => void;
}

const defaultCalendar: CompanyCalendar = {
  monday: { 
    enabled: true, 
    hours: [
      { start: '08:00', end: '12:00' },
      { start: '13:00', end: '17:00' }
    ] 
  },
  tuesday: { 
    enabled: true, 
    hours: [
      { start: '08:00', end: '12:00' },
      { start: '13:00', end: '17:00' }
    ] 
  },
  wednesday: { 
    enabled: true, 
    hours: [
      { start: '08:00', end: '12:00' },
      { start: '13:00', end: '17:00' }
    ] 
  },
  thursday: { 
    enabled: true, 
    hours: [
      { start: '08:00', end: '12:00' },
      { start: '13:00', end: '17:00' }
    ] 
  },
  friday: { 
    enabled: true, 
    hours: [
      { start: '08:00', end: '12:00' },
      { start: '13:00', end: '17:00' }
    ] 
  },
  saturday: { enabled: false, hours: [] },
  sunday: { enabled: false, hours: [] },
};

// Improved settings storage with better error handling and persistence
export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      backgroundImage: null,
      companyLogo: null,
      companyName: null,
      companyCNPJ: null,
      companyResponsible: null,
      calendar: defaultCalendar,
      setBackgroundImage: (image) => set({ backgroundImage: image }),
      setCompanyLogo: (logo) => set({ companyLogo: logo }),
      setCompanyName: (name) => set({ companyName: name }),
      setCompanyCNPJ: (cnpj) => set({ companyCNPJ: cnpj }),
      setCompanyResponsible: (responsible) => set({ companyResponsible: responsible }),
      setCalendar: (calendar) => set({ calendar }),
    }),
    {
      // Include companyId in the storage name
      name: `settings-storage-${useAuthStore.getState().companyId || 'default'}`,
      version: 2, // Increased version to ensure clean migration
      storage: {
        getItem: (name) => {
          try {
            const str = localStorage.getItem(name);
            if (!str) return null;
            return JSON.parse(str);
          } catch (e) {
            console.error("Error parsing settings from localStorage:", e);
            return null;
          }
        },
        setItem: (name, value) => {
          try {
            // Ensure we're storing a valid JSON string
            const jsonValue = JSON.stringify(value);
            localStorage.setItem(name, jsonValue);
            console.log(`Settings saved successfully for ${name}`);
          } catch (e) {
            console.error("Error storing settings to localStorage:", e);
          }
        },
        removeItem: (name) => {
          try {
            localStorage.removeItem(name);
          } catch (e) {
            console.error("Error removing settings from localStorage:", e);
          }
        },
      },
      partialize: (state) => ({
        // Explicitly list all fields to ensure nothing is missed
        backgroundImage: state.backgroundImage,
        companyLogo: state.companyLogo,
        companyName: state.companyName,
        companyCNPJ: state.companyCNPJ,
        companyResponsible: state.companyResponsible,
        calendar: state.calendar,
      }),
      // Add migration to handle version changes
      migrate: (persistedState, version) => {
        if (version === 1) {
          // Migration from version 1 to 2
          console.log("Migrating settings from v1 to v2");
          return {
            ...persistedState,
            // Ensure all fields are present with defaults if missing
            calendar: persistedState.calendar || defaultCalendar,
            companyName: persistedState.companyName || null,
            companyCNPJ: persistedState.companyCNPJ || null,
            companyResponsible: persistedState.companyResponsible || null,
          };
        }
        return persistedState as any;
      },
      // Add onRehydrateStorage to handle rehydration errors
      onRehydrateStorage: () => (state) => {
        console.log("Settings rehydrated successfully");
        if (!state) {
          console.error("Failed to rehydrate settings");
        }
      },
    }
  )
);