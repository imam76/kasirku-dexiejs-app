import { useState, useRef, useEffect, useCallback } from 'react';

interface UseScannerProps {
  onScan: (text: string) => void;
}

export const useScanner = ({ onScan }: UseScannerProps) => {
  const [scannerOpen, setScannerOpen] = useState(false);
  const [scannerStarting, setScannerStarting] = useState(false);
  const [scannerError, setScannerError] = useState<string | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const controlsRef = useRef<{ stop: () => void } | null>(null);
  const lastScannedRef = useRef<{ text: string; at: number } | null>(null);
  const beepAudioRef = useRef<HTMLAudioElement | null>(null);

  // Use a stable reference for onScan to avoid re-running effect on every render if the parent passes an inline function
  const onScanRef = useRef(onScan);
  useEffect(() => {
    onScanRef.current = onScan;
  }, [onScan]);

  const beepUrl = new URL('../assets/beep.mp3', import.meta.url).href;

  useEffect(() => {
    beepAudioRef.current = new Audio(beepUrl);
  }, [beepUrl]);

  const playBeep = useCallback(() => {
    void beepAudioRef.current?.play().catch(() => { });
  }, []);

  const stopScanner = useCallback(() => {
    controlsRef.current?.stop();
    controlsRef.current = null;

    const video = videoRef.current;
    const stream = (video?.srcObject ?? null) as MediaStream | null;
    if (stream) {
      for (const track of stream.getTracks()) track.stop();
    }
    if (video) video.srcObject = null;
  }, []);

  useEffect(() => {
    if (!scannerOpen) {
      stopScanner();
      setScannerError(null);
      setScannerStarting(false);
      return;
    }

    let cancelled = false;

    setScannerStarting(true);
    setScannerError(null);

    (async () => {
      try {
        const ZXingBrowser = await import('@zxing/browser');
        const codeReader = new ZXingBrowser.BrowserMultiFormatReader();
        const video = videoRef.current;
        if (!video) throw new Error('Video element not available');

        const controls = await codeReader.decodeFromConstraints(
          {
            audio: false,
            video: { facingMode: { ideal: 'environment' } },
          },
          video,
          (result, error) => {
            if (cancelled) return;

            if (result) {
              const text = result.getText().trim();
              const now = Date.now();
              const last = lastScannedRef.current;
              // Debounce same code for 1.5s
              if (last && last.text === text && now - last.at < 1500) return;

              lastScannedRef.current = { text, at: now };

              playBeep();
              onScanRef.current(text);
              return;
            }

            if (error && typeof error === 'object' && 'name' in error && (error as { name: string }).name === 'NotFoundException') {
              return;
            }
          }
        );

        if (cancelled) {
          controls.stop();
          return;
        }

        controlsRef.current = controls;
      } catch {
        if (!cancelled) setScannerError('Gagal mengakses kamera. Pastikan izin kamera diaktifkan.');
      } finally {
        if (!cancelled) setScannerStarting(false);
      }
    })();

    return () => {
      cancelled = true;
      stopScanner();
    };
  }, [scannerOpen, stopScanner, playBeep]);

  return {
    scannerOpen,
    setScannerOpen,
    scannerStarting,
    scannerError,
    videoRef,
  };
};
