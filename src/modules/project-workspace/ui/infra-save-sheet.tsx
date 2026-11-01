'use client';

import { useId, useState } from 'react';
import { Check, Loader2, X } from 'lucide-react';
import type {
  InfraTrialIntegration,
  InfraTrialSaveInput,
  InfraTrialSaveOptions,
} from './infra-trial-integration';

const TEXT = {
  title: 'שמירת תוצאת האיתור',
  intro: 'התוצאה לא נשמרת אוטומטית. בחרו מה לשמור בענן של הארגון, ונתוני היישור יישמרו איתם כדי שאפשר יהיה לפתוח אותה שוב.',
  location: 'מיקום',
  note: 'הערה (לא חובה)',
  saveBefore: 'שמירת תמונת הלפני',
  saveAfter: 'שמירת תמונת האחרי',
  saveResult: 'שמירת תמונת התוצאה (שכבה שקופה מעל)',
  beforeKnown: 'תמונת הלפני כבר שמורה בגלריה.',
  nothing: 'בחרו לפחות פריט אחד לשמירה.',
  noLocation: 'בחרו מיקום לשמירה.',
  save: 'שמירה בענן',
  saving: 'שומר…',
  cancel: 'לא לשמור',
  saved: 'התוצאה נשמרה בענן.',
  done: 'סגירה',
  failed: 'השמירה נכשלה',
  retry: 'נסו שוב',
} as const;

export function InfraSaveSheet({
  input,
  previewUrl,
  integration,
  onClose,
}: {
  readonly input: InfraTrialSaveInput;
  readonly previewUrl: string | null;
  readonly integration: InfraTrialIntegration;
  readonly onClose: () => void;
}) {
  const formId = useId();
  const [locationId, setLocationId] = useState(integration.defaultLocationId ?? '');
  const [note, setNote] = useState('');
  const [saveBefore, setSaveBefore] = useState(Boolean(input.beforeFile && !input.beforeCaptureId));
  const [saveAfter, setSaveAfter] = useState(Boolean(input.afterFile));
  const [saveResult, setSaveResult] = useState(Boolean(input.resultFile));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedOk, setSavedOk] = useState(false);

  const anything =
    Boolean(input.beforeCaptureId) ||
    (saveBefore && Boolean(input.beforeFile)) ||
    (saveAfter && Boolean(input.afterFile)) ||
    (saveResult && Boolean(input.resultFile));
  const canSave = anything && locationId.length > 0 && !busy;

  async function submit() {
    if (!canSave) return;
    setBusy(true);
    setError(null);
    const options: InfraTrialSaveOptions = {
      locationId,
      note: note.trim() || null,
      saveBefore: saveBefore && Boolean(input.beforeFile) && !input.beforeCaptureId,
      saveAfter: saveAfter && Boolean(input.afterFile),
      saveResult: saveResult && Boolean(input.resultFile),
    };
    try {
      const outcome = await integration.onSave(input, options);
      if (outcome.ok) setSavedOk(true);
      else setError(outcome.error);
    } catch {
      setError(TEXT.failed);
    } finally {
      setBusy(false);
    }
  }

  const checkboxClass = 'flex items-center gap-2 text-sm';
  return (
    <div
      className="absolute inset-0 z-10 flex items-end justify-center bg-black/60 p-2 sm:items-center"
      onPointerDown={(event) => event.stopPropagation()}
      data-testid="infra-save-sheet"
    >
      <form
        id={formId}
        dir="rtl"
        className="flex max-h-full w-full max-w-md flex-col gap-3 overflow-y-auto rounded-lg bg-white p-4 text-neutral-900 shadow-xl"
        onSubmit={(event) => {
          event.preventDefault();
          void submit();
        }}
      >
        <div className="flex items-center gap-2">
          <h2 className="min-w-0 flex-1 text-base font-semibold">{TEXT.title}</h2>
          <button type="button" aria-label={TEXT.cancel} onClick={onClose} className="rounded p-1 hover:bg-neutral-100">
            <X className="size-5" />
          </button>
        </div>

        {savedOk ? (
          <>
            <p className="flex items-center gap-2 text-sm text-emerald-700" data-testid="infra-save-done">
              <Check className="size-4" />
              {TEXT.saved}
            </p>
            <button
              type="button"
              onClick={onClose}
              className="rounded-md bg-[var(--pf-action-primary,#0e7490)] px-4 py-2 text-sm font-medium text-white"
            >
              {TEXT.done}
            </button>
          </>
        ) : (
          <>
            <p className="text-sm text-neutral-600">{TEXT.intro}</p>
            {previewUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={previewUrl} alt="" className="max-h-40 w-full rounded border border-neutral-200 object-contain" />
            ) : null}

            <label className="flex flex-col gap-1 text-sm">
              <span className="font-medium">{TEXT.location}</span>
              <select
                value={locationId}
                onChange={(event) => setLocationId(event.target.value)}
                className="min-h-10 rounded-md border border-neutral-300 bg-white px-2"
                data-testid="infra-save-location"
              >
                <option value="">—</option>
                {integration.locations.map((location) => (
                  <option key={location.id} value={location.id}>
                    {location.label}
                  </option>
                ))}
              </select>
            </label>

            <div className="flex flex-col gap-2">
              {input.beforeCaptureId ? (
                <p className="text-xs text-neutral-500">{TEXT.beforeKnown}</p>
              ) : input.beforeFile ? (
                <label className={checkboxClass}>
                  <input type="checkbox" checked={saveBefore} onChange={(event) => setSaveBefore(event.target.checked)} />
                  {TEXT.saveBefore}
                </label>
              ) : null}
              {input.afterFile ? (
                <label className={checkboxClass}>
                  <input type="checkbox" checked={saveAfter} onChange={(event) => setSaveAfter(event.target.checked)} />
                  {TEXT.saveAfter}
                </label>
              ) : null}
              {input.resultFile ? (
                <label className={checkboxClass}>
                  <input type="checkbox" checked={saveResult} onChange={(event) => setSaveResult(event.target.checked)} />
                  {TEXT.saveResult}
                </label>
              ) : null}
            </div>

            <label className="flex flex-col gap-1 text-sm">
              <span className="font-medium">{TEXT.note}</span>
              <textarea
                value={note}
                onChange={(event) => setNote(event.target.value)}
                rows={2}
                maxLength={1000}
                className="rounded-md border border-neutral-300 px-2 py-1"
              />
            </label>

            {!anything ? <p className="text-xs text-amber-700">{TEXT.nothing}</p> : null}
            {anything && !locationId ? <p className="text-xs text-amber-700">{TEXT.noLocation}</p> : null}
            {error ? (
              <p className="text-sm text-red-600" role="alert" data-testid="infra-save-error">
                {error}
              </p>
            ) : null}

            <div className="flex gap-2">
              <button
                type="submit"
                disabled={!canSave}
                data-testid="infra-save-confirm"
                className="inline-flex flex-1 items-center justify-center gap-2 rounded-md bg-[var(--pf-action-primary,#0e7490)] px-4 py-2 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-50"
              >
                {busy ? <Loader2 className="size-4 animate-spin" /> : null}
                {busy ? TEXT.saving : error ? TEXT.retry : TEXT.save}
              </button>
              <button
                type="button"
                onClick={onClose}
                className="rounded-md border border-neutral-300 px-4 py-2 text-sm font-medium"
              >
                {TEXT.cancel}
              </button>
            </div>
          </>
        )}
      </form>
    </div>
  );
}
