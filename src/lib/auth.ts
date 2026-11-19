import { 
  signInWithEmailAndPassword, 
  createUserWithEmailAndPassword,
  signOut,
  User
} from 'firebase/auth';
import { auth } from './firebase';
import { clearFirestoreCache } from './firestore-cache';
import { clearSessionScope, prepareLogin } from './session-scope';

export const loginUser = async (email: string, password: string) => {
  try {
    await prepareLogin('sistema');
    const userCredential = await signInWithEmailAndPassword(auth, email, password);
    return userCredential.user;
  } catch (error: any) {
    console.error("Erro no login:", error);
    
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
    clearFirestoreCache();
    clearSessionScope();
    await signOut(auth);
  } catch (error: any) {
    throw new Error(error.message);
  }
};
