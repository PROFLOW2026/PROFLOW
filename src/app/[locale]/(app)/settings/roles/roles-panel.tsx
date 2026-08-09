'use client';

import { useActionState, useEffect, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Alert } from '@/components/ui/alert';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import {
  ROLE_TEMPLATE_KEYS,
  TOGGLEABLE_PERMISSIONS,
} from '@/shared/permissions/role-templates';
import type { PermissionKey } from '@/shared/permissions/catalog';
import { setRoleToggleAction, type SettingsActionState } from '../actions';

function RolePermissionToggle({
  roleKey,
  permission,
  enabled,
  label,
  onFeedback,
}: {
  roleKey: string;
  permission: PermissionKey;
  enabled: boolean;
  label: string;
  onFeedback: (state: SettingsActionState) => void;
}) {
  const formRef = useRef<HTMLFormElement>(null);
  const enabledRef = useRef<HTMLInputElement>(null);
  const [state, action, pending] = useActionState(setRoleToggleAction, {} as SettingsActionState);

  useEffect(() => {
    if (state.ok || state.error) onFeedback(state);
  }, [state, onFeedback]);

  return (
    <form ref={formRef} action={action} className="flex items-center justify-between gap-4">
      <input type="hidden" name="roleKey" value={roleKey} />
      <input type="hidden" name="permission" value={permission} />
      <input ref={enabledRef} type="hidden" name="enabled" defaultValue={String(!enabled)} />
      <Label className="text-sm">{label}</Label>
      <Switch
        checked={enabled}
        disabled={pending}
        onCheckedChange={(checked) => {
          if (enabledRef.current) enabledRef.current.value = String(checked);
          formRef.current?.requestSubmit();
        }}
        aria-label={label}
      />
    </form>
  );
}

export function RolesSettingsPanel({
  rolePermissions,
}: {
  rolePermissions: Record<string, PermissionKey[]>;
}) {
  const t = useTranslations('settings.roles');
  const tOrg = useTranslations('organization.roles');
  const tPerm = useTranslations('organization.permissions');
  const [feedback, setFeedback] = useState<SettingsActionState>({});

  return (
    <div className="flex flex-col gap-6">
      {feedback.error ? <Alert tone="danger">{feedback.error}</Alert> : null}
      {feedback.ok ? (
        <Alert tone="success" role="status" aria-live="polite">
          {t('saved')}
        </Alert>
      ) : null}

      <p className="text-sm text-[var(--pf-text-secondary)]">{t('subtitle')}</p>

      {ROLE_TEMPLATE_KEYS.map((roleKey) => {
        const toggles = TOGGLEABLE_PERMISSIONS[roleKey];
        const isOwner = roleKey === 'owner';

        return (
          <section
            key={roleKey}
            className="rounded-lg border border-[var(--pf-border-default)] p-4"
          >
            <h3 className="font-semibold">{tOrg(`${roleKey}.name`)}</h3>
            <p className="mt-1 text-sm text-[var(--pf-text-secondary)]">{tOrg(`${roleKey}.description`)}</p>

            {isOwner ? (
              <p className="mt-3 text-sm text-[var(--pf-text-muted)]">{t('protectedHint')}</p>
            ) : toggles.length === 0 ? null : (
              <div className="mt-4 flex flex-col gap-3">
                <p className="text-sm font-medium">{t('toggleTitle')}</p>
                {toggles.map((permission) => (
                  <RolePermissionToggle
                    key={`${roleKey}-${permission}`}
                    roleKey={roleKey}
                    permission={permission}
                    enabled={rolePermissions[roleKey]?.includes(permission) ?? false}
                    label={tPerm(permission)}
                    onFeedback={setFeedback}
                  />
                ))}
              </div>
            )}
          </section>
        );
      })}
    </div>
  );
}
