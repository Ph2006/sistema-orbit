import React, { useEffect, useState } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { onAuthStateChanged } from 'firebase/auth';
import { auth } from './lib/firebase';
import { useAuthStore } from './store/authStore';
import LoginForm from './components/LoginForm';
// ... importações existentes ...

function App() {
  // Adicionar um estado local para gerenciar o carregamento inicial
  const [initialLoading, setInitialLoading] = useState(true);
  const { setUser, setLoading, companyId } = useAuthStore();

  useEffect(() => {
    // Use uma verificação para garantir que setLoading existe e é uma função
    if (typeof setLoading === 'function') {
      setLoading(true);
    } else {
      console.error("setLoading não é uma função:", setLoading);
      // Use o estado local como fallback
      setInitialLoading(true);
    }

    const unsubscribe = onAuthStateChanged(auth, (user) => {
      // Verificar se setUser é uma função antes de chamar
      if (typeof setUser === 'function') {
        setUser(user);
      } else {
        console.error("setUser não é uma função:", setUser);
      }
      
      // Verificar se setLoading é uma função antes de chamar
      if (typeof setLoading === 'function') {
        setLoading(false);
      } else {
        // Use o estado local como fallback
        setInitialLoading(false);
      }
      
      console.log(`Company ID after auth state change: ${companyId}`);
    });

    return () => unsubscribe();
  }, [setUser, setLoading, companyId]);

  // O resto do componente permanece o mesmo
  return (
    <Router>
      {/* ... routes ... */}
    </Router>
  );
}

export default App;
