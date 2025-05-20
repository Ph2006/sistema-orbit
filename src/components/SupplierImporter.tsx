import React, { useState } from 'react';
import { X, FileUp, Check, FileText, Download, AlertTriangle } from 'lucide-react';
import { collection, addDoc, writeBatch, doc, setDoc } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { Supplier } from '../types/materials';

const SupplierImporter: React.FC<{ onClose: () => void }> = ({ onClose }) => {
  const [step, setStep] = useState<'upload' | 'preview' | 'success' | 'error'>('upload');
  const [csvData, setCsvData] = useState<string>('');
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [processing, setProcessing] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string>('');
  const [stats, setStats] = useState<{ added: number; failed: number }>({ added: 0, failed: 0 });

  // Function to generate a sample CSV template
  const generateTemplate = () => {
    const headers = "name,cnpj,email,phone,address,contactPerson,category,paymentTerms,deliveryTimeAvg,notes\n";
    const sample = 'Empresa Exemplo,12.345.678/0001-90,contato@exemplo.com.br,(11) 1234-5678,"Rua Exemplo, 123 - São Paulo/SP",João da Silva,"Aço, Parafusos",30/60/90 dias,15,"Fornecedor de produtos de aço"\n';
    
    const csvString = headers + sample;
    
    // Create a blob and save file
    const blob = new Blob([csvString], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'modelo_importacao_fornecedores.csv';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  // Parse CSV file content
  const parseCsv = (csvString: string) => {
    try {
      // Basic CSV parsing
      const lines = csvString.trim().split('\n');
      const headers = lines[0].split(',');
      
      // Validate headers
      const requiredFields = ['name', 'cnpj', 'email', 'phone'];
      const missingFields = requiredFields.filter(field => !headers.includes(field));
      
      if (missingFields.length > 0) {
        setErrorMessage(`Campos obrigatórios faltando: ${missingFields.join(', ')}`);
        setStep('error');
        return;
      }
      
      const parsedSuppliers: Supplier[] = [];
      
      // Start from index 1 to skip headers
      for (let i = 1; i < lines.length; i++) {
        if (!lines[i].trim()) continue; // Skip empty lines
        
        const values = lines[i].split(',');
        
        // Check if line has enough values
        if (values.length < requiredFields.length) {
          continue;
        }
        
        // Map values to supplier object
        const supplier: any = {};
        
        headers.forEach((header, index) => {
          if (header === 'category') {
            // Categories should be an array
            supplier[header] = values[index] ? values[index].split(';') : [];
          } else {
            supplier[header] = values[index] || '';
          }
        });
        
        // Add required fields and defaults
        parsedSuppliers.push({
          id: crypto.randomUUID(),
          name: supplier.name || '',
          cnpj: supplier.cnpj || '',
          email: supplier.email || '',
          phone: supplier.phone || '',
          address: supplier.address || '',
          contactPerson: supplier.contactPerson || '',
          category: supplier.category || [],
          paymentTerms: supplier.paymentTerms || '',
          deliveryTimeAvg: parseInt(supplier.deliveryTimeAvg) || 0,
          evaluationScore: 3, // Default evaluation score
          status: 'active', // Default status
          notes: supplier.notes || '',
          createdAt: new Date().toISOString()
        });
      }
      
      setSuppliers(parsedSuppliers);
      setStep('preview');
    } catch (error) {
      console.error('Error parsing CSV:', error);
      setErrorMessage('Erro ao processar o arquivo. Verifique o formato CSV.');
      setStep('error');
    }
  };

  // Handle file upload
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    
    // Check file type
    if (file.type !== 'text/csv' && !file.name.endsWith('.csv')) {
      setErrorMessage('Por favor, faça upload de um arquivo CSV válido.');
      setStep('error');
      return;
    }
    
    const reader = new FileReader();
    reader.onload = (event) => {
      const content = event.target?.result as string;
      setCsvData(content);
      parseCsv(content);
    };
    reader.onerror = () => {
      setErrorMessage('Erro ao ler o arquivo. Por favor, tente novamente.');
      setStep('error');
    };
    reader.readAsText(file);
  };

  // Import suppliers into Firestore
  const importSuppliers = async () => {
    if (suppliers.length === 0) {
      setErrorMessage('Nenhum fornecedor para importar.');
      setStep('error');
      return;
    }
    
    setProcessing(true);
    
    try {
      // Use batched writes for performance
      const batch = writeBatch(db);
      let added = 0;
      let failed = 0;
      
      for (const supplier of suppliers) {
        try {
          // Create a new document with auto-generated ID
          const newSupplierRef = doc(collection(db, 'suppliers'));
          
          // Remove ID from the data object as it will be the document ID
          const { id, ...supplierData } = supplier;
          
          // Add to batch
          batch.set(newSupplierRef, supplierData);
          added++;
        } catch (error) {
          console.error('Error adding supplier:', error);
          failed++;
        }
      }
      
      // Commit all the batch operations
      await batch.commit();
      
      setStats({ added, failed });
      setStep('success');
    } catch (error) {
      console.error('Error during batch commit:', error);
      setErrorMessage('Erro ao importar fornecedores. Tente novamente.');
      setStep('error');
    } finally {
      setProcessing(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg p-6 max-w-4xl w-full max-h-[90vh] overflow-y-auto">
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-2xl font-bold">Importar Fornecedores</h2>
          <button onClick={onClose}>
            <X className="h-6 w-6" />
          </button>
        </div>

        {step === 'upload' && (
          <div className="space-y-6">
            <div className="p-4 bg-blue-50 rounded-lg border border-blue-200">
              <h3 className="text-lg font-medium text-blue-800 mb-2">Instruções</h3>
              <p className="text-blue-700 mb-3">
                Faça o upload de um arquivo CSV contendo a lista de fornecedores. O arquivo deve:
              </p>
              <ul className="list-disc pl-5 text-blue-700 space-y-1 mb-3">
                <li>Estar no formato CSV (valores separados por vírgula)</li>
                <li>Conter os campos: nome, cnpj, email, telefone (obrigatórios)</li>
                <li>Opcionalmente, incluir outros campos como endereço, contato, etc.</li>
                <li>Para categorias múltiplas, separe-as com ponto e vírgula (;)</li>
              </ul>
              <div className="flex justify-end">
                <button
                  onClick={generateTemplate}
                  className="flex items-center px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
                >
                  <Download className="h-5 w-5 mr-2" />
                  Baixar Modelo CSV
                </button>
              </div>
            </div>

            <div className="border-2 border-dashed border-gray-300 rounded-lg p-12 text-center">
              <FileUp className="h-12 w-12 text-gray-400 mx-auto mb-4" />
              <h3 className="text-lg font-medium text-gray-900 mb-2">Arraste e solte seu arquivo CSV aqui</h3>
              <p className="text-gray-500 mb-4">ou</p>
              <input
                type="file"
                id="csv-upload"
                accept=".csv"
                onChange={handleFileUpload}
                className="hidden"
              />
              <label
                htmlFor="csv-upload"
                className="inline-flex items-center px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 cursor-pointer"
              >
                Selecionar Arquivo
              </label>
            </div>
          </div>
        )}

        {step === 'preview' && (
          <div className="space-y-6">
            <div className="p-4 bg-yellow-50 rounded-lg border border-yellow-200 mb-4">
              <div className="flex items-start">
                <AlertTriangle className="h-5 w-5 text-yellow-500 mr-2 mt-0.5" />
                <div>
                  <h3 className="text-sm font-medium text-yellow-800">Verifique os dados antes de continuar</h3>
                  <p className="text-yellow-700 text-sm mt-1">
                    Serão importados {suppliers.length} fornecedores. Verifique se os dados estão corretos antes de prosseguir.
                  </p>
                </div>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th scope="col" className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Nome
                    </th>
                    <th scope="col" className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      CNPJ
                    </th>
                    <th scope="col" className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Email
                    </th>
                    <th scope="col" className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Telefone
                    </th>
                    <th scope="col" className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Categorias
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {suppliers.slice(0, 10).map((supplier, index) => (
                    <tr key={index}>
                      <td className="px-3 py-3 whitespace-nowrap text-sm font-medium text-gray-900">
                        {supplier.name}
                      </td>
                      <td className="px-3 py-3 whitespace-nowrap text-sm text-gray-500">
                        {supplier.cnpj}
                      </td>
                      <td className="px-3 py-3 whitespace-nowrap text-sm text-gray-500">
                        {supplier.email}
                      </td>
                      <td className="px-3 py-3 whitespace-nowrap text-sm text-gray-500">
                        {supplier.phone}
                      </td>
                      <td className="px-3 py-3 text-sm text-gray-500">
                        {supplier.category.join(', ')}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            
            {suppliers.length > 10 && (
              <p className="text-sm text-gray-500 text-center">
                Mostrando os primeiros 10 de {suppliers.length} fornecedores.
              </p>
            )}

            <div className="flex justify-end space-x-4 mt-6">
              <button
                onClick={() => setStep('upload')}
                className="px-4 py-2 border border-gray-300 rounded-md hover:bg-gray-50"
              >
                Voltar
              </button>
              <button
                onClick={importSuppliers}
                disabled={processing}
                className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 flex items-center disabled:opacity-50"
              >
                {processing ? (
                  <>
                    <div className="animate-spin h-4 w-4 mr-2 border-t-2 border-white rounded-full"></div>
                    Importando...
                  </>
                ) : (
                  <>
                    <Check className="h-5 w-5 mr-2" />
                    Confirmar Importação
                  </>
                )}
              </button>
            </div>
          </div>
        )}

        {step === 'success' && (
          <div className="space-y-6 text-center">
            <div className="p-4 bg-green-50 rounded-full w-20 h-20 mx-auto">
              <Check className="h-12 w-12 text-green-500 mx-auto" />
            </div>
            <h3 className="text-xl font-medium text-gray-900">Importação Concluída com Sucesso!</h3>
            <div className="grid grid-cols-2 gap-4 max-w-md mx-auto">
              <div className="p-4 bg-green-50 rounded-lg border border-green-200">
                <div className="text-sm text-green-800">Fornecedores adicionados</div>
                <div className="text-2xl font-bold text-green-700">{stats.added}</div>
              </div>
              {stats.failed > 0 && (
                <div className="p-4 bg-red-50 rounded-lg border border-red-200">
                  <div className="text-sm text-red-800">Fornecedores falhos</div>
                  <div className="text-2xl font-bold text-red-700">{stats.failed}</div>
                </div>
              )}
            </div>
            <button
              onClick={onClose}
              className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 inline-flex items-center"
            >
              <Check className="h-5 w-5 mr-2" />
              Concluir
            </button>
          </div>
        )}

        {step === 'error' && (
          <div className="space-y-6 text-center">
            <div className="p-4 bg-red-50 rounded-full w-20 h-20 mx-auto">
              <AlertTriangle className="h-12 w-12 text-red-500 mx-auto" />
            </div>
            <h3 className="text-xl font-medium text-gray-900">Erro na Importação</h3>
            <p className="text-red-600">{errorMessage}</p>
            <button
              onClick={() => setStep('upload')}
              className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 inline-flex items-center"
            >
              <FileUp className="h-5 w-5 mr-2" />
              Tentar Novamente
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

export default SupplierImporter;