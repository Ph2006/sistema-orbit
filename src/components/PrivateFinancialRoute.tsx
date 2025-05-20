import React, { useState } from 'react';
import { Navigate } from 'react-router-dom';

const ACCESS_KEY = 'OP4484210640';

interface PrivateFinancialRouteProps {
  children: React.ReactNode;
}

const PrivateFinancialRoute: React.FC<PrivateFinancialRouteProps> = ({ children }) => {
  const [accessKey, setAccessKey] = useState('');
  const [showPrompt, setShowPrompt] = useState(true);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (accessKey === ACCESS_KEY) {
      setShowPrompt(false);
    } else {
      alert('Chave de acesso inválida');
    }
  };

  if (showPrompt) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-100">
        <div className="bg-white p-8 rounded-lg shadow-md w-full max-w-md">
          <h2 className="text-2xl font-bold text-gray-900 mb-6">
            Acesso Restrito
          </h2>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700">
                Chave de Acesso
              </label>
              <input
                type="password"
                value={accessKey}
                onChange={(e) => setAccessKey(e.target.value)}
                className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring focus:ring-blue-200"
                required
              />
            </div>
            <button
              type="submit"
              className="w-full flex justify-center py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
            >
              Acessar
            </button>
          </form>
        </div>
      </div>
    );
  }

  return <>{children}</>;
};

export default PrivateFinancialRoute;