// Import the functions you need from the SDKs you need
import { initializeApp, getApps, getApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import { getAnalytics, isSupported } from "firebase/analytics";
import { getStorage, ref, uploadString, getDownloadURL } from "firebase/storage";

// Your web app's Firebase configuration
const firebaseConfig = {
  apiKey: "AIzaSyCf7xDO_k-IMTFLPXQzYlZ_4QVD17yQf6A",
  authDomain: "sistema-orbit.firebaseapp.com",
  projectId: "sistema-orbit",
  storageBucket: "sistema-orbit.firebasestorage.app",
  messagingSenderId: "136954894051",
  appId: "1:136954894051:web:2864457f71d0d84f6317d6",
  measurementId: "G-GERPH0J0WH"
};

// Initialize Firebase
const app = !getApps().length ? initializeApp(firebaseConfig) : getApp();
const db = getFirestore(app);
const auth = getAuth(app);
const analytics = isSupported().then(yes => yes ? getAnalytics(app) : null);
const storage = getStorage(app);

/**
 * Faz upload de uma imagem base64 para o Firebase Storage e retorna a URL pública.
 * @param base64 string base64 da imagem
 * @param path caminho no storage (ex: 'dimensionalReports/arquivo.jpg')
 * @returns URL pública da imagem
 */
export async function uploadBase64ToStorage(base64: string, path: string): Promise<string> {
  const storageRef = ref(storage, path);
  await uploadString(storageRef, base64, 'data_url');
  return await getDownloadURL(storageRef);
}

/**
 * Faz upload de múltiplas fotos para o Firebase Storage específico para relatórios dimensionais
 * @param base64Photos Array de strings base64 das imagens
 * @param reportId ID único do relatório (usado para organizar as fotos)
 * @returns Array de URLs públicas das imagens
 */
export async function uploadDimensionalReportPhotos(base64Photos: string[], reportId: string): Promise<string[]> {
  const uploadPromises = base64Photos.map(async (base64, index) => {
    const timestamp = Date.now();
    const photoPath = `dimensionalReports/${reportId}/photo_${index + 1}_${timestamp}.jpg`;
    return await uploadBase64ToStorage(base64, photoPath);
  });
  
  return await Promise.all(uploadPromises);
}

export { app, db, auth, analytics, storage };
