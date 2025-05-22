import { create } from 'zustand';
// import { persist } from 'zustand/middleware'; // Remove persist middleware
import { CompanyCalendar } from '../types/gantt';
import { useAuthStore } from './authStore'; // Import authStore
import { db } from '../lib/firebase'; // Import db
import { doc, getDoc, setDoc } from 'firebase/firestore'; // Import Firestore functions

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
  
  // New actions for Firestore interaction
  loadSettingsFromFirestore: (companyId: string) => Promise<void>;
  saveSettingsToFirestore: (companyId: string, settings: Partial<SettingsState>) => Promise<void>;
}

const defaultCalendar: CompanyCalendar = {
  monday: { 
    enabled: true, 
    hours: [
      { start: '08:00', end: '12:00', id: '1' },
      { start: '13:00', end: '17:00', id: '2' }
    ] 
  },
  tuesday: { 
    enabled: true, 
    hours: [
      { start: '08:00', end: '12:00', id: '3' },
      { start: '13:00', end: '17:00', id: '4' }
    ] 
  },
  wednesday: { 
    enabled: true, 
    hours: [
      { start: '08:00', end: '12:00', id: '5' },
      { start: '13:00', end: '17:00', id: '6' }
    ] 
  },
  thursday: { 
    enabled: true, 
    hours: [
      { start: '08:00', end: '12:00', id: '7' },
      { start: '13:00', end: '17:00', id: '8' }
    ] 
  },
  friday: { 
    enabled: true, 
    hours: [
      { start: '08:00', end: '12:00', id: '9' },
      { start: '13:00', end: '17:00', id: '10' }
    ] 
  },
  saturday: { enabled: false, hours: [] },
  sunday: { enabled: false, hours: [] },
};

// Settings store without direct Firestore logic, handled externally
export const useSettingsStore = create<SettingsState>()(
  (set, get) => ({
    backgroundImage: null,
    companyLogo: null,
    companyName: null,
    companyCNPJ: null,
    companyResponsible: null,
    calendar: defaultCalendar,

    // Local state setters
    setBackgroundImage: (image) => set({ backgroundImage: image }),
    setCompanyLogo: (logo) => set({ companyLogo: logo }),
    setCompanyName: (name) => set({ companyName: name }),
    setCompanyCNPJ: (cnpj) => set({ companyCNPJ: cnpj }),
    setCompanyResponsible: (responsible) => set({ companyResponsible: responsible }),
    setCalendar: (calendar) => set({ calendar }),

    // Firestore interaction actions
    loadSettingsFromFirestore: async (companyId: string) => {
      try {
        const settingsRef = doc(db, 'companiesSettings', companyId);
        const docSnap = await getDoc(settingsRef);
        if (docSnap.exists()) {
          const settingsData = docSnap.data();
          set({
            companyName: settingsData.companyName || null,
            companyCNPJ: settingsData.companyCNPJ || null,
            companyResponsible: settingsData.companyResponsible || null,
            companyLogo: settingsData.companyLogo || null,
            backgroundImage: settingsData.backgroundImage || null,
            // Ensure calendar is loaded correctly, merge with default to include missing days
            calendar: { ...defaultCalendar, ...settingsData.calendar },
          });
          console.log('Settings loaded from Firestore');
        } else {
          console.log('No settings found for company, using defaults.');
          // Optionally save default settings if no document exists
          // This will be handled by saveSettingsToFirestore on the first save
        }
      } catch (error) {
        console.error('Error loading settings from Firestore:', error);
      }
    },

    saveSettingsToFirestore: async (companyId: string, settings: Partial<SettingsState>) => {
      try {
        const settingsRef = doc(db, 'companiesSettings', companyId);
        // Use set with merge: true to update fields without overwriting the entire document
        await setDoc(settingsRef, settings, { merge: true });
        console.log('Settings saved to Firestore');
      } catch (error) {
        console.error('Error saving settings to Firestore:', error);
      }
    },
  })
);

// Example of how to use in a component (not part of the store)
/*
import React, { useEffect } from 'react';
import { useSettingsStore } from '../store/settingsStore';
import { useAuthStore } from '../store/authStore';

const MyComponent = () => {
  const { companyId } = useAuthStore();
  const loadSettings = useSettingsStore((state) => state.loadSettingsFromFirestore);
  const settings = useSettingsStore();
  const saveSettings = useSettingsStore((state) => state.saveSettingsToFirestore);

  useEffect(() => {
    if (companyId) {
      loadSettings(companyId);
    }
  }, [companyId, loadSettings]);

  const handleSaveClick = () => {
    if (companyId) {
      // Get current state to save
      const currentSettings = useSettingsStore.getState();
      const settingsToSave = {
        companyName: currentSettings.companyName,
        companyCNPJ: currentSettings.companyCNPJ,
        companyResponsible: currentSettings.companyResponsible,
        companyLogo: currentSettings.companyLogo,
        backgroundImage: currentSettings.backgroundImage,
        calendar: currentSettings.calendar,
      };
      saveSettings(companyId, settingsToSave);
    }
  };

  return (
    <div>
      <h1>Settings</h1>
      <p>Company Name: {settings.companyName}</p>
      <button onClick={handleSaveClick}>Save Settings</button>
    </div>
  );
};
*/