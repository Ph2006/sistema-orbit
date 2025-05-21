import React from 'react';

const AboutSystem: React.FC = () => {
  return (
    <div className="p-6">
      <h2 className="text-2xl font-bold mb-4">Sobre o Sistema</h2>
      <div className="bg-white rounded-lg shadow-lg p-6 max-w-md">
        <p className="text-lg font-semibold">Sistema Orbit</p>
        <p className="text-gray-600 mt-2">Versão 1.0</p>
        <p className="text-gray-600 mt-1">Desenvolvido por Paulo Henrique Nascimento Ribeiro</p>
        <p className="text-gray-600 mt-1">© 2025 - Todos os direitos reservados</p>
      </div>
    </div>
  );
};

export default AboutSystem; 