import React, { useState, useEffect } from 'react';
import { X, Scan as QrScanner } from 'lucide-react';
import { useProductionOrderStore } from '../store/productionOrderStore';
import { ProductionOrder } from '../types/productionOrder';

interface QRCodeScannerProps {
  onSuccess?: (order: ProductionOrder, action: 'start' | 'complete') => void;
  onError?: (error: string) => void;
}

const QRCodeScanner: React.FC<QRCodeScannerProps> = ({ onSuccess, onError }) => {
  const [scanning, setScanning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [videoDevices, setVideoDevices] = useState<MediaDeviceInfo[]>([]);
  const [selectedDeviceId, setSelectedDeviceId] = useState<string>('');
  const { startProductionOrder, completeProductionOrder, getProductionOrdersByQRCode } = useProductionOrderStore();

  useEffect(() => {
    // Enumerate available video devices
    if (navigator.mediaDevices && navigator.mediaDevices.enumerateDevices) {
      navigator.mediaDevices.enumerateDevices()
        .then(devices => {
          const videoInputs = devices.filter(device => device.kind === 'videoinput');
          setVideoDevices(videoInputs);
          if (videoInputs.length > 0) {
            setSelectedDeviceId(videoInputs[0].deviceId);
          }
        })
        .catch(err => {
          console.error('Error enumerating devices:', err);
          setError('Não foi possível acessar as câmeras disponíveis.');
        });
    }
  }, []);

  const handleStartScan = () => {
    setScanning(true);
    setError(null);

    // Here we'll use a dynamic import for the QR code scanner
    // This ensures the library is only loaded when needed
    import('html5-qrcode')
      .then(module => {
        const Html5QrcodeScanner = module.Html5QrcodeScanner;

        // Create a config for the scanner
        const config = {
          fps: 10,
          qrbox: 250,
          aspectRatio: 1.0,
          videoConstraints: {
            deviceId: selectedDeviceId ? { exact: selectedDeviceId } : undefined,
            facingMode: "environment" // Use the back camera by default
          }
        };

        // Initialize the scanner
        const scanner = new Html5QrcodeScanner(
          "qr-reader",
          config,
          false // Do not show scan type option
        );

        // Start scanning
        scanner.render(onScanSuccess, onScanError);

        // Store the scanner instance for cleanup
        (window as any).qrScanner = scanner;

      })
      .catch(err => {
        console.error('Error loading QR scanner library:', err);
        setError('Erro ao carregar a biblioteca de scanner QR.');
        setScanning(false);
      });
  };

  const handleStopScan = () => {
    try {
      // Clean up the scanner
      if ((window as any).qrScanner) {
        (window as any).qrScanner.clear();
      }
    } catch (err) {
      console.error('Error stopping scanner:', err);
    }
    
    setScanning(false);
  };

  const onScanSuccess = async (decodedText: string) => {
    console.log(`QR Code detected: ${decodedText}`);
    handleStopScan(); // Stop scanning after successful detection
    
    try {
      // Check if this is a valid production order QR code
      const order = await getProductionOrdersByQRCode(decodedText);
      
      if (!order) {
        setError('Código QR inválido ou não encontrado.');
        if (onError) onError('Código QR inválido ou não encontrado.');
        return;
      }
      
      // Determine if this is a start or complete action
      let success: boolean;
      let action: 'start' | 'complete';
      
      if (order.startCode === decodedText) {
        action = 'start';
        success = await startProductionOrder(order.id, decodedText);
      } else {
        action = 'complete';
        success = await completeProductionOrder(order.id, decodedText);
      }
      
      if (success) {
        if (onSuccess) onSuccess(order, action);
      } else {
        const storeError = useProductionOrderStore.getState().error;
        setError(storeError || 'Falha ao processar código QR.');
        if (onError) onError(storeError || 'Falha ao processar código QR.');
      }
      
    } catch (err) {
      console.error('Error processing QR code:', err);
      setError('Erro ao processar o código QR.');
      if (onError) onError('Erro ao processar o código QR.');
    }
  };

  const onScanError = (err: any) => {
    // Only log errors that aren't just failed scans
    if (err !== 'QR code parse error') {
      console.error('QR Scan Error:', err);
      setError('Erro ao escanear: ' + err);
    }
  };

  return (
    <div className="p-4 bg-white rounded-lg shadow-md">
      <h2 className="text-xl font-bold mb-4">Leitor de Código QR</h2>
      
      {!scanning ? (
        <div className="space-y-4">
          <div className="mb-4">
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Selecione a Câmera
            </label>
            <select
              className="w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring focus:ring-blue-200"
              value={selectedDeviceId}
              onChange={(e) => setSelectedDeviceId(e.target.value)}
              disabled={videoDevices.length === 0}
            >
              {videoDevices.length === 0 ? (
                <option value="">Nenhuma câmera disponível</option>
              ) : (
                videoDevices.map(device => (
                  <option key={device.deviceId} value={device.deviceId}>
                    {device.label || `Câmera ${videoDevices.indexOf(device) + 1}`}
                  </option>
                ))
              )}
            </select>
          </div>
          
          <button
            onClick={handleStartScan}
            disabled={videoDevices.length === 0}
            className="w-full flex items-center justify-center px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-300"
          >
            <QrScanner className="h-5 w-5 mr-2" />
            Iniciar Scanner
          </button>
          
          {error && (
            <div className="text-sm text-red-600 mt-2">
              {error}
            </div>
          )}
          
          <div className="text-sm text-gray-600 mt-4">
            <p>Instruções:</p>
            <ol className="list-decimal pl-5 space-y-1">
              <li>Clique em "Iniciar Scanner"</li>
              <li>Aponte a câmera para o código QR na ficha de produção</li>
              <li>O scanner irá capturar automaticamente o código</li>
              <li>O sistema irá iniciar ou concluir a tarefa correspondente</li>
            </ol>
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          <div id="qr-reader" className="w-full"></div>
          
          <button 
            onClick={handleStopScan}
            className="w-full px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700"
          >
            Cancelar Leitura
          </button>
        </div>
      )}
    </div>
  );
};

export default QRCodeScanner;