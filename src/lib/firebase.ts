// Import the functions you need from the SDKs you need
import { initializeApp, getApps, getApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import { getAnalytics, isSupported } from "firebase/analytics";

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


export { app, db, auth, analytics };
