import React, { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { collection, query, where, getDocs, addDoc, updateDoc, doc, getDoc } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { QualityDocument, DocumentValidation } from '../types/quality';
import { Order } from '../types/kanban';
import { Check, X, FileCheck } from 'lucide-react';
import SignatureCanvas from 'react-signature-canvas';

const DocumentValidationPage: React.FC = () => {
  const { orderId } = useParams<{ orderId: string }>();
  const [documents, setDocuments] = useState<QualityDocument[]>([]);
  const [order, setOrder] = useState<Order | null>(null);
  const [validations, setValidations] = useState<Record<string, {
    status: 'approved' | 'rejected';
    comments: string;
  }>>({});
  const [signature, setSignature] = useState<string>('');
  const [signatureRef, setSignatureRef] = useState<SignatureCanvas | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (orderId) {
      loadOrder();
      loadDocuments();
    }
  }, [orderId]);

  const loadOrder = async () => {
    try {
      if (!orderId) return;
      
      const orderRef = doc(db, 'orders', orderId);
      const orderDoc = await getDoc(orderRef);
      
      if (!orderDoc.exists()) {
        setError('Pedido não encontrado');
        return;
      }

      setOrder({ id: orderDoc.id, ...orderDoc.data() } as Order);
    } catch (error) {
      console.error('Error loading order:', error);
      setError('Erro ao carregar pedido');
    } finally {
      setLoading(false);
    }
  };

  const loadDocuments = async () => {
    try {
      if (!orderId) return;
      
      const q = query(collection(db, 'qualityDocuments'), where('orderId', '==', orderId));
      const snapshot = await getDocs(q);
      const docs = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as QualityDocument[];
      setDocuments(docs);
    } catch (error) {
      console.error('Error loading documents:', error);
      setError('Erro ao carregar documentos');
    }
  };

  const handleValidation = (documentId: string, status: 'approved' | 'rejected') => {
    setValidations(prev => ({
      ...prev,
      [documentId]: {
        status,
        comments: prev[documentId]?.comments || ''
      }
    }));
  };

  const handleCommentChange = (documentId: string, comments: string) => {
    setValidations(prev => ({
      ...prev,
      [documentId]: {
        ...prev[documentId],
        comments
      }
    }));
  };

  const handleSubmit = async () => {
    if (!signatureRef?.isEmpty()) {
      const signatureData = signatureRef.toDataURL();
      
      try {
        // Create validation records
        const validationPromises = Object.entries(validations).map(([documentId, validation]) => 
          addDoc(collection(db, 'documentValidations'), {
            documentId,
            orderId,
            validatedAt: new Date().toISOString(),
            validatedBy: order?.customerEmail,
            status: validation.status,
            comments: validation.comments,
            signature: signatureData
          })
        );

        await Promise.all(validationPromises);

        // Update documents status
        const documentPromises = Object.entries(validations).map(([documentId, validation]) =>
          updateDoc(doc(db, 'qualityDocuments', documentId), {
            status: validation.status === 'approved' ? 'verified' : 'unverified',
            validatedAt: new Date().toISOString()
          })
        );

        await Promise.all(documentPromises);

        // Update order status if all documents are approved
        const allApproved = Object.values(validations).every(v => v.status === 'approved');
        if (allApproved && order) {
          await updateDoc(doc(db, 'orders', order.id), {
            status: 'completed'
          });
        }

        alert('Documentos validados com sucesso!');
        window.location.reload();
      } catch (error) {
        console.error('Error saving validations:', error);
        alert('Erro ao salvar validações');
      }
    } else {
      alert('Por favor, adicione sua assinatura antes de enviar');
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-100 flex items-center justify-center">
        <div className="text-lg font-medium text-gray-600">Carregando...</div>
      </div>
    );
  }

  if (error || !order) {
    return (
      <div className="min-h-screen bg-gray-100 flex items-center justify-center">
        <div className="text-lg font-medium text-red-600">{error || 'Pedido não encontrado'}</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-100 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-4xl mx-auto">
        <div className="bg-white rounded-lg shadow-lg p-6">
          <h1 className="text-2xl font-bold mb-6">Validação de Documentos</h1>
          
          <div className="mb-6">
            <h2 className="text-lg font-semibold">Pedido #{order.orderNumber}</h2>
            <p className="text-gray-600">Cliente: {order.customer}</p>
          </div>

          <div className="space-y-6">
            {documents.map(doc => (
              <div key={doc.id} className="border rounded-lg p-4">
                <div className="flex items-start justify-between">
                  <div>
                    <h3 className="font-medium">{doc.name}</h3>
                    <p className="text-sm text-gray-600">{doc.description}</p>
                    {doc.required && (
                      <span className="inline-block mt-2 text-xs bg-red-100 text-red-800 px-2 py-0.5 rounded">
                        Obrigatório
                      </span>
                    )}
                  </div>
                  <a
                    href={doc.driveLink}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="p-2 hover:bg-gray-100 rounded-full"
                  >
                    <FileCheck className="h-5 w-5 text-blue-600" />
                  </a>
                </div>

                <div className="mt-4 space-y-4">
                  <div className="flex space-x-4">
                    <button
                      onClick={() => handleValidation(doc.id, 'approved')}
                      className={`flex-1 py-2 px-4 rounded-lg border ${
                        validations[doc.id]?.status === 'approved'
                          ? 'bg-green-100 border-green-500 text-green-800'
                          : 'hover:bg-gray-50'
                      }`}
                    >
                      <Check className="h-5 w-5 inline-block mr-2" />
                      Aprovar
                    </button>
                    <button
                      onClick={() => handleValidation(doc.id, 'rejected')}
                      className={`flex-1 py-2 px-4 rounded-lg border ${
                        validations[doc.id]?.status === 'rejected'
                          ? 'bg-red-100 border-red-500 text-red-800'
                          : 'hover:bg-gray-50'
                      }`}
                    >
                      <X className="h-5 w-5 inline-block mr-2" />
                      Rejeitar
                    </button>
                  </div>

                  {validations[doc.id] && (
                    <textarea
                      value={validations[doc.id].comments}
                      onChange={(e) => handleCommentChange(doc.id, e.target.value)}
                      placeholder="Adicione comentários sobre sua decisão..."
                      className="w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring focus:ring-blue-200"
                      rows={3}
                    />
                  )}
                </div>
              </div>
            ))}
          </div>

          <div className="mt-8">
            <h3 className="font-medium mb-4">Assinatura Digital</h3>
            <div className="border rounded-lg p-4">
              <SignatureCanvas
                ref={(ref) => setSignatureRef(ref)}
                canvasProps={{
                  className: 'w-full h-40 border rounded',
                }}
              />
              <div className="mt-2 flex justify-end">
                <button
                  onClick={() => signatureRef?.clear()}
                  className="text-sm text-gray-600 hover:text-gray-800"
                >
                  Limpar
                </button>
              </div>
            </div>
          </div>

          <div className="mt-8 flex justify-end">
            <button
              onClick={handleSubmit}
              className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
            >
              Enviar Validação
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default DocumentValidationPage;