import React, { useEffect, useState } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { onAuthStateChanged } from 'firebase/auth';
import { auth } from './lib/firebase';
import { useAuthStore } from './store/authStore';
import LoginForm from './components/LoginForm';
// ... outras importações ...

function App() {
  // Adicione um estado local para controlar a renderização
  const [isReady, setIsReady] = useState(false);
  const { setUser, setLoading, companyId } = useAuthStore();

  useEffect(() => {
    // Adicione log para depuração
    console.log("App.tsx renderizando");
    
    try {
      console.log("Configurando autenticação");
      
      // Usar try/catch para lidar com exceções
      try {
        if (typeof setLoading === 'function') {
          setLoading(true);
          console.log("setLoading(true) executado com sucesso");
        } else {
          console.error("setLoading não é uma função válida", setLoading);
        }
      } catch (error) {
        console.error("Erro ao executar setLoading:", error);
      }
      
      const unsubscribe = onAuthStateChanged(auth, (user) => {
        console.log("Auth state changed:", user?.email);
        
        try {
          if (typeof setUser === 'function') {
            setUser(user);
          }
        } catch (error) {
          console.error("Erro ao executar setUser:", error);
        }
        
        try {
          if (typeof setLoading === 'function') {
            setLoading(false);
          }
        } catch (error) {
          console.error("Erro ao executar setLoading(false):", error);
        }
        
        // Marcar aplicativo como pronto para renderização
        setIsReady(true);
      });

      return () => unsubscribe();
    } catch (error) {
      console.error("Erro crítico em App.tsx:", error);
      // Garantir que o app continue a renderizar mesmo com erro
      setIsReady(true);
      return () => {}; // cleanup vazio
    }
  }, [setUser, setLoading]);

  // Renderização simples enquanto aguarda inicialização
  if (!isReady) {
    return (
      <div style={{ 
        display: 'flex', 
        justifyContent: 'center', 
        alignItems: 'center', 
        height: '100vh',
        fontSize: '1.5rem',
        fontFamily: 'sans-serif'
      }}>
        Carregando Sistema Orbit...
      </div>
    );
  }

  // O resto do seu componente permanece igual
  return (
    <Router>
      <Routes>
        <Route path="/" element={<LoginForm />} />
        {/* Outras rotas... */}
      </Routes>
    </Router>
  );
}

export default App;
