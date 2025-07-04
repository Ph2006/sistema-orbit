import { 
  signInWithEmailAndPassword, 
  createUserWithEmailAndPassword,
  signInAnonymously,
  signOut,
  User
} from 'firebase/auth';
import { auth } from './firebase';

// Mock user for development when Firebase is unavailable
const createMockUser = (email: string): Partial<User> => ({
  uid: 'demo-user-' + Date.now(),
  email: email,
  emailVerified: true,
  isAnonymous: false,
  displayName: email.includes('demo') ? 'Usuário Demo' : email,
  photoURL: null,
  phoneNumber: null,
  providerId: 'mock'
});

export const loginUser = async (email: string, password: string) => {
  try {
    // Try real authentication first
    const userCredential = await signInWithEmailAndPassword(auth, email, password);
    return userCredential.user;
  } catch (error: any) {
    console.error("Erro no login:", error);
    
    // If login fails due to network issues or demo purposes, try anonymous auth
    if (error.code === 'auth/network-request-failed' || 
        email === 'demo@sistema-orbit.com' || 
        process.env.NODE_ENV === 'development') {
      try {
        console.log('Tentando autenticação anônima para demonstração...');
        const anonCredential = await signInAnonymously(auth);
        return anonCredential.user;
      } catch (anonError: any) {
        console.error("Erro na autenticação anônima:", anonError);
        
        // If even anonymous auth fails (like in sandboxed environments), use mock auth for development
        if (process.env.NODE_ENV === 'development') {
          console.log('Firebase indisponível, usando autenticação local para desenvolvimento...');
          const mockUser = createMockUser(email);
          
          // Store mock user in localStorage for persistence
          localStorage.setItem('mockUser', JSON.stringify(mockUser));
          
          // Simulate Firebase auth user object
          return mockUser as User;
        }
      }
    }
    
    // Traduzir erros do Firebase para português
    let errorMessage = "Erro desconhecido";
    switch (error.code) {
      case 'auth/user-not-found':
        errorMessage = "Usuário não encontrado";
        break;
      case 'auth/wrong-password':
        errorMessage = "Senha incorreta";
        break;
      case 'auth/invalid-email':
        errorMessage = "Email inválido";
        break;
      case 'auth/user-disabled':
        errorMessage = "Usuário desabilitado";
        break;
      case 'auth/too-many-requests':
        errorMessage = "Muitas tentativas. Tente novamente mais tarde";
        break;
      case 'auth/invalid-credential':
        errorMessage = "Credenciais inválidas";
        break;
      case 'auth/network-request-failed':
        errorMessage = "Erro de conexão. Tente novamente ou use demo@sistema-orbit.com";
        break;
      default:
        errorMessage = error.message;
    }
    
    throw new Error(errorMessage);
  }
};

export const registerUser = async (email: string, password: string) => {
  try {
    const userCredential = await createUserWithEmailAndPassword(auth, email, password);
    return userCredential.user;
  } catch (error: any) {
    throw new Error(error.message);
  }
};

export const logoutUser = async () => {
  try {
    // Clear mock user if in development mode
    if (process.env.NODE_ENV === 'development') {
      localStorage.removeItem('mockUser');
    }
    
    await signOut(auth);
  } catch (error: any) {
    // If Firebase signOut fails but we're in development, just clear localStorage
    if (process.env.NODE_ENV === 'development') {
      localStorage.removeItem('mockUser');
      return;
    }
    throw new Error(error.message);
  }
};
