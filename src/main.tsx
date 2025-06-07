import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import './index.css';

// Inicializar com try/catch para detectar erros de renderização
try {
  const rootElement = document.getElementById('root');
  if (rootElement) {
    createRoot(rootElement).render(
      <StrictMode>
        <App />
      </StrictMode>
    );
    console.log("Renderização inicial bem-sucedida");
  } else {
    console.error("Elemento 'root' não encontrado no DOM");
  }
} catch (error) {
  console.error("Erro crítico na renderização inicial:", error);
  
  // Tentar renderizar uma mensagem de erro simples
  document.body.innerHTML = `
    <div style="padding: 20px; color: red; font-family: sans-serif;">
      <h1>Erro de Renderização</h1>
      <p>Ocorreu um erro ao inicializar o aplicativo.</p>
      <p>Detalhes: ${error instanceof Error ? error.message : String(error)}</p>
    </div>
  `;
}
