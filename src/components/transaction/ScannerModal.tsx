import { useEffect } from 'react';
import { X } from 'lucide-react';
import { useScanner } from '@/hooks/useScanner';

interface ScannerModalProps {
  onClose: () => void;
  onScan: (text: string) => void;
}

export default function ScannerModal({ onClose, onScan }: ScannerModalProps) {
  const {
    setScannerOpen,
    scannerStarting,
    scannerError,
    videoRef,
  } = useScanner({ onScan });

  // Start scanner when modal opens
  useEffect(() => {
    setScannerOpen(true);
    return () => setScannerOpen(false);
  }, [setScannerOpen]);

  return (
    <div className="fixed inset-0 z-[60]">
      <div className="absolute inset-0 bg-black bg-opacity-50" onClick={onClose} />
      <div className="absolute inset-x-0 top-0 sm:top-16 mx-auto w-full h-full sm:h-auto sm:w-[92vw] sm:max-w-xl bg-white sm:rounded-2xl shadow-2xl overflow-hidden flex flex-col">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 flex-shrink-0">
          <div>
            <h3 className="text-lg font-semibold text-gray-800">Scan Barcode</h3>
            <p className="text-xs text-gray-500">Arahkan kamera ke barcode/SKU produk</p>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-full hover:bg-gray-100 text-gray-500"
            aria-label="Tutup scanner"
          >
            <X size={20} />
          </button>
        </div>

        <div className="p-5 space-y-3 flex-1 overflow-y-auto">
          <div className="bg-black rounded-xl overflow-hidden aspect-video w-full">
            <video ref={videoRef} className="w-full h-full object-cover" muted autoPlay playsInline />
          </div>

          {scannerStarting && (
            <div className="text-sm text-gray-600">Menyalakan kamera...</div>
          )}
          {scannerError && (
            <div className="text-sm text-red-600">{scannerError}</div>
          )}

          <div className="flex justify-end">
            <button
              type="button"
              onClick={onClose}
              className="bg-gray-600 hover:bg-gray-700 text-white px-4 py-2 rounded-lg font-semibold transition-colors"
            >
              Tutup
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
