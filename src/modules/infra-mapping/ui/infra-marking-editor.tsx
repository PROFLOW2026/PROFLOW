'use client';

import { ArrowUpRight, Circle, Loader2, MousePointer2, Pencil, Slash, Square, Type, Undo2, Eraser } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import {
  DEFAULT_MARKING_COLOR,
  MARKING_COLORS,
  simplifyStroke,
  toUnitPoint,
  type DraftMarking,
} from '../domain/markings';
import type { InfraMarkingKind, UnitPoint } from '../domain/types';
import { INFRA_TEXT } from './texts';

const TOOLS: readonly { kind: InfraMarkingKind; label: string; icon: typeof Circle }[] = [
  { kind: 'point', label: INFRA_TEXT.marks.point, icon: MousePointer2 },
  { kind: 'arrow', label: INFRA_TEXT.marks.arrow, icon: ArrowUpRight },
  { kind: 'line', label: INFRA_TEXT.marks.line, icon: Slash },
  { kind: 'rect', label: INFRA_TEXT.marks.rect, icon: Square },
  { kind: 'ellipse', label: INFRA_TEXT.marks.ellipse, icon: Circle },
  { kind: 'freehand', label: INFRA_TEXT.marks.freehand, icon: Pencil },
  { kind: 'text', label: INFRA_TEXT.marks.text, icon: Type },
];

const MAX_RENDER_SIDE = 2400;

/** Draws markings over whatever is already on the canvas. Coordinates are normalised (0..1). */
export function drawMarkings(ctx: CanvasRenderingContext2D, markings: readonly DraftMarking[], width: number, height: number): void {
  const unit = Math.max(width, height);
  const stroke = Math.max(2, unit / 220);
  const px = (point: UnitPoint) => ({ x: point[0] * width, y: point[1] * height });
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  for (const marking of markings) {
    const points = marking.points.map(px);
    const first = points[0];
    if (!first) continue;
    ctx.strokeStyle = marking.color;
    ctx.fillStyle = marking.color;
    ctx.lineWidth = stroke;
    ctx.beginPath();
    switch (marking.kind) {
      case 'point': {
        const r = stroke * 3;
        ctx.arc(first.x, first.y, r, 0, Math.PI * 2);
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(first.x, first.y, stroke, 0, Math.PI * 2);
        ctx.fill();
        break;
      }
      case 'line':
      case 'arrow': {
        const last = points[points.length - 1]!;
        ctx.moveTo(first.x, first.y);
        ctx.lineTo(last.x, last.y);
        ctx.stroke();
        if (marking.kind === 'arrow') {
          const angle = Math.atan2(last.y - first.y, last.x - first.x);
          const head = stroke * 6;
          ctx.beginPath();
          ctx.moveTo(last.x, last.y);
          ctx.lineTo(last.x - head * Math.cos(angle - Math.PI / 7), last.y - head * Math.sin(angle - Math.PI / 7));
          ctx.lineTo(last.x - head * Math.cos(angle + Math.PI / 7), last.y - head * Math.sin(angle + Math.PI / 7));
          ctx.closePath();
          ctx.fill();
        }
        break;
      }
      case 'rect': {
        const last = points[points.length - 1]!;
        ctx.strokeRect(Math.min(first.x, last.x), Math.min(first.y, last.y), Math.abs(last.x - first.x), Math.abs(last.y - first.y));
        break;
      }
      case 'ellipse': {
        const last = points[points.length - 1]!;
        ctx.ellipse(
          (first.x + last.x) / 2,
          (first.y + last.y) / 2,
          Math.max(1, Math.abs(last.x - first.x) / 2),
          Math.max(1, Math.abs(last.y - first.y) / 2),
          0,
          0,
          Math.PI * 2,
        );
        ctx.stroke();
        break;
      }
      case 'freehand': {
        ctx.moveTo(first.x, first.y);
        for (const point of points.slice(1)) ctx.lineTo(point.x, point.y);
        ctx.stroke();
        break;
      }
      case 'text': {
        const size = Math.max(16, unit / 28);
        ctx.font = `600 ${size}px sans-serif`;
        ctx.textBaseline = 'top';
        const text = marking.label ?? '';
        ctx.lineWidth = Math.max(3, size / 6);
        ctx.strokeStyle = 'rgba(0,0,0,0.65)';
        ctx.strokeText(text, first.x, first.y);
        ctx.fillText(text, first.x, first.y);
        break;
      }
    }
  }
}

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('image'));
    image.src = url;
  });
}

export interface MarkingEditorSave {
  readonly markings: readonly DraftMarking[];
  readonly annotated: File;
}

/**
 * Marks up a photo (point / arrow / line / rect / ellipse / freehand / text). The original is never
 * touched: saving produces the marking set plus a separate rendered JPEG ("marked version").
 */
export function InfraMarkingEditor({
  imageUrl,
  initial,
  onSave,
  onCancel,
}: {
  readonly imageUrl: string;
  readonly initial: readonly DraftMarking[];
  readonly onSave: (result: MarkingEditorSave) => Promise<string | null>;
  readonly onCancel: () => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const imageRef = useRef<HTMLImageElement | null>(null);
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);
  const [tool, setTool] = useState<InfraMarkingKind>('arrow');
  const [color, setColor] = useState<string>(DEFAULT_MARKING_COLOR);
  const [markings, setMarkings] = useState<DraftMarking[]>(() => [...initial]);
  const [draft, setDraft] = useState<DraftMarking | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedOk, setSavedOk] = useState(false);

  useEffect(() => {
    let cancelled = false;
    loadImage(imageUrl)
      .then((image) => {
        if (cancelled) return;
        imageRef.current = image;
        setReady(true);
      })
      .catch(() => !cancelled && setFailed(true));
    return () => {
      cancelled = true;
    };
  }, [imageUrl]);

  const visible = useMemo(() => (draft ? [...markings, draft] : markings), [markings, draft]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const image = imageRef.current;
    if (!canvas || !image || !ready) return;
    const scale = Math.min(1, 1600 / Math.max(image.naturalWidth, image.naturalHeight));
    canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
    canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
    drawMarkings(ctx, visible, canvas.width, canvas.height);
  }, [ready, visible]);

  const unitAt = useCallback((event: ReactPointerEvent<HTMLCanvasElement>): UnitPoint => {
    const canvas = canvasRef.current!;
    const rect = canvas.getBoundingClientRect();
    return toUnitPoint(event.clientX - rect.left, event.clientY - rect.top, rect.width, rect.height);
  }, []);

  function onPointerDown(event: ReactPointerEvent<HTMLCanvasElement>) {
    if (!ready || saving) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    const start = unitAt(event);
    if (tool === 'point') {
      setMarkings((current) => [...current, { kind: 'point', points: [start], color }]);
      return;
    }
    setDraft({ kind: tool, points: tool === 'freehand' ? [start] : [start, start], color });
  }

  function onPointerMove(event: ReactPointerEvent<HTMLCanvasElement>) {
    if (!draft) return;
    const point = unitAt(event);
    setDraft((current) => {
      if (!current) return current;
      return current.kind === 'freehand'
        ? { ...current, points: [...current.points, point] }
        : { ...current, points: [current.points[0]!, point] };
    });
  }

  function onPointerUp() {
    if (!draft) return;
    const finished = draft;
    setDraft(null);
    if (finished.kind === 'text') {
      const text = window.prompt(INFRA_TEXT.marks.textPrompt)?.trim();
      if (!text) return;
      setMarkings((current) => [...current, { ...finished, points: [finished.points[0]!], label: text.slice(0, 200) }]);
      return;
    }
    const [a, b] = [finished.points[0]!, finished.points[finished.points.length - 1]!];
    const tiny = Math.hypot(a[0] - b[0], a[1] - b[1]) < 0.01;
    if (tiny && finished.kind !== 'freehand') return; // an accidental tap
    if (finished.kind === 'freehand' && finished.points.length < 2) return;
    setMarkings((current) => [
      ...current,
      finished.kind === 'freehand' ? { ...finished, points: simplifyStroke(finished.points) } : finished,
    ]);
  }

  async function save() {
    const image = imageRef.current;
    if (!image || saving) return;
    setSaving(true);
    setError(null);
    try {
      const scale = Math.min(1, MAX_RENDER_SIDE / Math.max(image.naturalWidth, image.naturalHeight));
      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
      canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('canvas');
      ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
      drawMarkings(ctx, markings, canvas.width, canvas.height);
      const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.9));
      if (!blob) throw new Error('encode');
      const message = await onSave({
        markings,
        annotated: new File([blob], 'annotated.jpg', { type: 'image/jpeg' }),
      });
      if (message) setError(message);
      else setSavedOk(true);
    } catch {
      setError(INFRA_TEXT.retry);
    } finally {
      setSaving(false);
    }
  }

  if (failed) return <Alert tone="danger">{INFRA_TEXT.retry}</Alert>;

  return (
    <div className="flex min-w-0 flex-col gap-3" data-testid="infra-marking-editor">
      <p className="text-xs text-[var(--pf-text-secondary)]">{INFRA_TEXT.marks.hint}</p>
      <div className="flex flex-wrap items-center gap-1" role="toolbar" aria-label={INFRA_TEXT.gallery.marksTitle}>
        {TOOLS.map(({ kind, label, icon: Icon }) => (
          <Button
            key={kind}
            type="button"
            size="sm"
            variant={tool === kind ? 'primary' : 'secondary'}
            aria-pressed={tool === kind}
            aria-label={label}
            title={label}
            onClick={() => setTool(kind)}
            data-testid={`infra-tool-${kind}`}
          >
            <Icon aria-hidden />
            <span className="hidden sm:inline">{label}</span>
          </Button>
        ))}
        <Button
          type="button"
          size="sm"
          variant="ghost"
          onClick={() => setMarkings((current) => current.slice(0, -1))}
          disabled={markings.length === 0}
        >
          <Undo2 aria-hidden />
          <span className="hidden sm:inline">{INFRA_TEXT.marks.undo}</span>
        </Button>
        <Button type="button" size="sm" variant="ghost" onClick={() => setMarkings([])} disabled={markings.length === 0}>
          <Eraser aria-hidden />
          <span className="hidden sm:inline">{INFRA_TEXT.marks.clear}</span>
        </Button>
      </div>
      <div className="flex flex-wrap items-center gap-2" aria-label={INFRA_TEXT.marks.color}>
        {MARKING_COLORS.map((swatch) => (
          <button
            key={swatch}
            type="button"
            aria-label={`${INFRA_TEXT.marks.color} ${swatch}`}
            aria-pressed={color === swatch}
            onClick={() => setColor(swatch)}
            className={`size-8 rounded-full border-2 ${color === swatch ? 'border-[var(--pf-text-brand)]' : 'border-[var(--pf-border-default)]'}`}
            style={{ backgroundColor: swatch }}
          />
        ))}
      </div>
      <div className="relative w-full overflow-hidden rounded-md border border-[var(--pf-border-default)] bg-(--pf-lit-black)">
        {!ready ? <Loader2 className="absolute start-1/2 top-1/2 size-6 -translate-x-1/2 animate-spin text-(--pf-lit-white)" aria-hidden /> : null}
        <canvas
          ref={canvasRef}
          className="block h-auto max-h-[65dvh] w-full object-contain"
          style={{ touchAction: 'none' }}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
          data-testid="infra-marking-canvas"
        />
      </div>
      {error ? <Alert tone="danger">{error}</Alert> : null}
      {savedOk ? <Alert tone="success">{INFRA_TEXT.marks.saved}</Alert> : null}
      <div className="flex flex-wrap gap-2">
        <Button type="button" onClick={() => void save()} loading={saving} disabled={!ready} data-testid="infra-marks-save">
          {saving ? INFRA_TEXT.marks.uploading : INFRA_TEXT.marks.save}
        </Button>
        <Button type="button" variant="secondary" onClick={onCancel}>
          {INFRA_TEXT.close}
        </Button>
      </div>
    </div>
  );
}
