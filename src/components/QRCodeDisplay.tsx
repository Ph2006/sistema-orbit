import React, { useRef, useEffect } from 'react';
import { Download } from 'lucide-react';

interface QRCodeDisplayProps {
  value: string;
  size?: number;
  title?: string;
  subtitle?: string;
  downloadFileName?: string;
  color?: string;
}

const QRCodeDisplay: React.FC<QRCodeDisplayProps> = ({
  value,
  size = 200,
  title,
  subtitle,
  downloadFileName = 'qrcode',
  color = '#000000'
}) => {
  const qrRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!qrRef.current) return;

    // We'll use QRious library to generate the QR code
    import('qrious')
      .then(({ default: QRious }) => {
        // Clear previous QR code if any
        if (qrRef.current) {
          qrRef.current.innerHTML = '';
          
          // Create canvas element
          const canvas = document.createElement('canvas');
          qrRef.current.appendChild(canvas);
          
          // Generate QR code
          new QRious({
            element: canvas,
            value: value,
            size: size,
            foreground: color,
            level: 'H', // High error correction level
          });
        }
      })
      .catch(err => {
        console.error('Error loading QRious:', err);
        // Fallback if library fails to load
        if (qrRef.current) {
          qrRef.current.innerHTML = 'Erro ao gerar código QR';
        }
      });
  }, [value, size, color]);

  const handleDownload = () => {
    if (!qrRef.current) return;
    
    const canvas = qrRef.current.querySelector('canvas');
    if (!canvas) return;
    
    const link = document.createElement('a');
    link.download = `${downloadFileName}.png`;
    link.href = canvas.toDataURL('image/png');
    link.click();
  };

  return (
    <div className="flex flex-col items-center">
      {title && (
        <h3 className="text-lg font-semibold mb-1">{title}</h3>
      )}
      {subtitle && (
        <p className="text-sm text-gray-600 mb-3">{subtitle}</p>
      )}
      
      <div 
        ref={qrRef}
        className="border p-4 bg-white rounded-lg shadow-sm"
        style={{ width: size + 32, height: size + 32 }}
      ></div>
      
      <button
        onClick={handleDownload}
        className="mt-3 flex items-center px-3 py-1.5 text-sm bg-blue-100 text-blue-800 rounded-md hover:bg-blue-200"
      >
        <Download className="h-4 w-4 mr-1" />
        Baixar QR Code
      </button>
    </div>
  );
};

export default QRCodeDisplay;