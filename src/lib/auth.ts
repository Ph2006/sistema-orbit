import { 
  signInWithEmailAndPassword, 
  createUserWithEmailAndPassword,
  signInAnonymously,
  signOut,
  User
} from 'firebase/auth';
import { auth } from './firebase';
import { createDevUser, setDevUser, clearDevUser, isDevMode } from './dev-auth';

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
        isDevMode()) {
      try {
        console.log('Tentando autenticação anônima para demonstração...');
        const anonCredential = await signInAnonymously(auth);
        return anonCredential.user;
      } catch (anonError: any) {
        console.error("Erro na autenticação anônima:", anonError);
        
        // If even anonymous auth fails (like in sandboxed environments), use dev auth
        if (isDevMode()) {
          console.log('Firebase indisponível, usando autenticação de desenvolvimento...');
          const devUser = createDevUser(email);
          setDevUser(devUser);
          
          // Trigger a page reload to ensure the new auth state is picked up
          setTimeout(() => {
            window.location.href = '/dashboard';
          }, 100);
          
          return devUser as User;
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
    // Clear dev user if in development mode
    if (isDevMode()) {
      clearDevUser();
    }
    
    await signOut(auth);
  } catch (error: any) {
    // If Firebase signOut fails but we're in development, just clear dev user
    if (isDevMode()) {
      clearDevUser();
      return;
    }
    throw new Error(error.message);
  }
};
