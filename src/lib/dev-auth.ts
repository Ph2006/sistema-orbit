// Development-only authentication system for when Firebase is unavailable
import { User } from 'firebase/auth';

export interface MockUser extends Partial<User> {
  uid: string;
  email: string;
  emailVerified: boolean;
  isAnonymous: boolean;
  displayName: string | null;
  photoURL: string | null;
  phoneNumber: string | null;
  providerId: string;
}

const STORAGE_KEY = 'sistema-orbit-dev-user';

export const createDevUser = (email: string): MockUser => ({
  uid: 'dev-user-' + Date.now(),
  email: email,
  emailVerified: true,
  isAnonymous: false,
  displayName: email.includes('demo') ? 'Usuário Demo' : email.split('@')[0],
  photoURL: null,
  phoneNumber: null,
  providerId: 'dev-auth'
});

export const setDevUser = (user: MockUser): void => {
  if (typeof window !== 'undefined') {
    console.log('Setting development user:', user);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(user));
    console.log('Development user stored in localStorage');
  }
};

export const getDevUser = (): MockUser | null => {
  if (typeof window === 'undefined') return null;
  
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    console.log('Getting development user from localStorage:', stored);
    return stored ? JSON.parse(stored) : null;
  } catch (e) {
    console.error('Error getting development user:', e);
    return null;
  }
};

export const clearDevUser = (): void => {
  if (typeof window !== 'undefined') {
    localStorage.removeItem(STORAGE_KEY);
  }
};

export const isDevMode = (): boolean => {
  return process.env.NODE_ENV === 'development';
};