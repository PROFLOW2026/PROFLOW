'use client';

import { Camera, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { INFRA_TEXT } from './texts';

/**
 * In-page rear-camera capture for continuous shooting: the stream stays open between shots, every
 * shot is handed to `onCapture` (preview / approval happens elsewhere) and the next one can be
 * taken immediately. Releases the camera on close / unmount.
 */
export function InfraCamera({
  onCapture,
  onClose,
}: {
  readonly onCapture: (file: File) => void;
  readonly onClose: () => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [failed, setFailed] = useState(false);
  const [ready, setReady] = useState(false);
  const [flash, setFlash] = useState(false);

  useEffect(() => {
    let cancelled = false;
    let stream: MediaStream | null = null;
    (async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          audio: false,
          video: { facingMode: { ideal: 'environment' }, width: { ideal: 2560 }, height: { ideal: 1440 } },
        });
        if (cancelled) {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }
        const video = videoRef.current;
        if (video) {
          video.srcObject = stream;
          await video.play().catch(() => undefined);
          setReady(true);
        }
      } catch {
        if (!cancelled) setFailed(true);
      }
    })();
    return () => {
      cancelled = true;
      stream?.getTracks().forEach((track) => track.stop());
    };
  }, []);

  function shoot() {
    const video = videoRef.current;
    if (!video || !video.videoWidth) return;
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.drawImage(video, 0, 0);
    setFlash(true);
    window.setTimeout(() => setFlash(false), 120);
    canvas.toBlob(
      (blob) => {
        if (!blob) return;
        onCapture(new File([blob], `camera-${Date.now()}.jpg`, { type: 'image/jpeg' }));
      },
      'image/jpeg',
      0.92,
    );
  }

  if (failed) {
    return (
      <div className="flex flex-col gap-2 rounded-md border border-[var(--pf-border-default)] p-3 text-sm" role="alert">
        <p>{INFRA_TEXT.capture.cameraFailed}</p>
        <Button type="button" variant="secondary" size="sm" onClick={onClose} className="w-fit">
          {INFRA_TEXT.close}
        </Button>
      </div>
    );
  }

  return (
    <div data-pf-style="classic" className="relative overflow-hidden rounded-lg bg-(--pf-lit-black)" data-testid="infra-camera">
      <video ref={videoRef} playsInline muted autoPlay className="aspect-[4/3] max-h-[60dvh] w-full object-cover" />
      {flash ? <div className="pointer-events-none absolute inset-0 bg-(--pf-lit-white)/70" /> : null}
      <div className="absolute inset-x-0 bottom-0 flex items-center justify-center gap-3 bg-gradient-to-t from-(--pf-lit-black)/70 to-transparent p-3">
        <Button type="button" size="lg" onClick={shoot} disabled={!ready} data-testid="infra-camera-shoot">
          <Camera aria-hidden />
          {INFRA_TEXT.capture.shoot}
        </Button>
        <Button type="button" variant="secondary" size="lg" onClick={onClose} aria-label={INFRA_TEXT.capture.stopCamera}>
          <X aria-hidden />
          {INFRA_TEXT.capture.stopCamera}
        </Button>
      </div>
    </div>
  );
}
