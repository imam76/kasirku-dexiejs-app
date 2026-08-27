import { useI18n } from '@/hooks/useI18n';
import { X } from 'lucide-react';
import type { RefObject } from 'react';

type StockProductBarcodeScannerProps = {
  open: boolean;
  videoRef: RefObject<HTMLVideoElement | null>;
  onClose: () => void;
};

export default function StockProductBarcodeScanner({ open, videoRef, onClose }: StockProductBarcodeScannerProps) {
  const { t } = useI18n();

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[1300] flex items-center justify-center bg-black bg-opacity-80 p-4">
      <div className="relative flex w-full max-w-md flex-col overflow-hidden rounded-lg bg-white">
        <div className="absolute right-2 top-2 z-10">
          <button
            type="button"
            onClick={onClose}
            className="rounded-full bg-white p-2 shadow transition-colors hover:bg-gray-100"
          >
            <X size={20} />
          </button>
        </div>
        <div className="relative aspect-square bg-black">
          <video ref={videoRef} className="h-full w-full object-cover" muted autoPlay playsInline />
        </div>
        <div className="bg-white p-4 text-center">
          <p className="text-lg font-bold">{t('stock.form.scanBarcode')}</p>
          <p className="text-sm text-gray-500">{t('stock.form.scanBarcodeDescription')}</p>
        </div>
      </div>
    </div>
  );
}
