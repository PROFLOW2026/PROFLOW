import { createClient, createClientContact } from '@/modules/clients';
import type { OrgContext } from '@/shared/auth/context';
import { AuthorizationError } from '@/shared/errors';
import { hasPermission } from '@/shared/permissions/assert';
import { PERMISSIONS } from '@/shared/permissions/catalog';
import { employeeHasPermission, isEmployeeAppUser } from '@/modules/employee-app/application/load-employee-app-context';
import type { CreateProjectInput } from '../validation/schemas';
import {
  PROJECT_TEMPLATE_KEYS,
  type ProjectTemplateKey,
  type TemplateLocale,
} from '../domain/templates';
import type { ProjectCreateTeamInput } from '../domain/project-create-team';
import type { ProjectLaunchSource } from './launch-project';
import { canManageProjectTeamAtCreate } from './load-project-create-team-options';

function formValue(formData: FormData, key: string): string | undefined {
  const value = formData.get(key);
  if (value === null) return undefined;
  return String(value);
}

function requiredFormValue(formData: FormData, key: string): string {
  return formValue(formData, key) ?? '';
}

function canManageClients(context: OrgContext): boolean {
  return (
    hasPermission(context, PERMISSIONS.CLIENTS_MANAGE) ||
    (isEmployeeAppUser(context) && employeeHasPermission(context, PERMISSIONS.CLIENTS_MANAGE))
  );
}

function canReadClients(context: OrgContext): boolean {
  return (
    hasPermission(context, PERMISSIONS.CLIENTS_READ) ||
    (isEmployeeAppUser(context) && employeeHasPermission(context, PERMISSIONS.CLIENTS_READ))
  );
}

function canSetContractOnCreate(context: OrgContext): boolean {
  return (
    hasPermission(context, PERMISSIONS.CONTRACTS_MANAGE) ||
    (isEmployeeAppUser(context) && employeeHasPermission(context, PERMISSIONS.CONTRACTS_MANAGE))
  );
}

export interface ParsedProjectCreateForm {
  readonly input: CreateProjectInput;
  readonly launch: ProjectLaunchSource;
  readonly team?: ProjectCreateTeamInput;
  /** @deprecated Use launch */
  readonly templateKey: string | null;
  readonly billingPlanMode: 'none' | 'simple' | 'template';
  readonly billingPlanTemplateKey: string | null;
}

function parseProjectCreateTeam(formData: FormData): ProjectCreateTeamInput {
  const projectManagerKey = formValue(formData, 'projectManagerKey')?.trim() || null;
  const raw = formValue(formData, 'participantKeys');
  let participantKeys: string[] = [];
  if (raw) {
    try {
      const parsed: unknown = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        participantKeys = parsed.filter((key): key is string => typeof key === 'string' && key.length > 0);
      }
    } catch {
      participantKeys = formData
        .getAll('participantKeys')
        .map((value) => String(value).trim())
        .filter(Boolean);
    }
  }
  return {
    projectManagerKey,
    participantKeys: [...new Set(participantKeys)],
  };
}

function parseLaunchSource(formData: FormData, templateLocale: TemplateLocale): ProjectLaunchSource {
  const launchMode = formValue(formData, 'launchMode') ?? 'none';

  if (launchMode === 'structure') {
    const templateKey = formValue(formData, 'structureTemplateKey');
    const allowed = new Set<string>(PROJECT_TEMPLATE_KEYS);
    if (templateKey && allowed.has(templateKey)) {
      return {
        kind: 'structure_template',
        templateKey: templateKey as ProjectTemplateKey,
        locale: templateLocale,
      };
    }
  } else if (launchMode === 'uwm') {
    const templateId = formValue(formData, 'uwmTemplateId');
    if (templateId) return { kind: 'uwm_template', templateId };
  } else if (launchMode === 'clone') {
    const sourceProjectId = formValue(formData, 'cloneSourceProjectId');
    if (sourceProjectId) return { kind: 'clone_structure', sourceProjectId };
  }

  const legacyTemplateKey = formValue(formData, 'templateKey');
  const allowed = new Set<string>(PROJECT_TEMPLATE_KEYS);
  if (legacyTemplateKey && legacyTemplateKey !== 'none' && allowed.has(legacyTemplateKey)) {
    return {
      kind: 'structure_template',
      templateKey: legacyTemplateKey as ProjectTemplateKey,
      locale: templateLocale,
    };
  }

  return { kind: 'blank' };
}

/** Shared FormData → createProject input for owner and employee create actions. */
export async function parseProjectCreateForm(
  context: OrgContext,
  formData: FormData,
  options?: { templateLocale?: TemplateLocale },
): Promise<ParsedProjectCreateForm> {
  const templateLocale = options?.templateLocale ?? 'en';
  const clientMode = String(formData.get('clientMode') ?? 'none');
  const contactMode = String(formData.get('contactMode') ?? 'none');
  let clientId: string | null = null;
  let primaryContactId: string | null = null;

  const contactName = formValue(formData, 'contactName')?.trim();
  const contactPhone = formValue(formData, 'contactPhone')?.trim();
  const contactEmail = formValue(formData, 'contactEmail');

  if (clientMode === 'existing') {
    if (!canReadClients(context)) {
      throw new AuthorizationError(PERMISSIONS.CLIENTS_READ);
    }
    const raw = formData.get('clientId');
    clientId = raw ? String(raw) : null;
  } else if (clientMode === 'new') {
    if (!canManageClients(context)) {
      throw new AuthorizationError(PERMISSIONS.CLIENTS_MANAGE);
    }
    const clientName = String(formData.get('clientName') ?? '').trim();
    if (clientName) {
      const client = await createClient(context, { name: clientName });
      clientId = client.id;
      if (contactName && contactPhone) {
        const contact = await createClientContact(context, {
          clientId,
          name: contactName,
          phone: contactPhone,
          email: contactEmail,
          role: 'primary',
        });
        primaryContactId = contact.id;
      }
    }
  }

  if (clientId && clientMode === 'existing') {
    if (contactMode === 'new') {
      if (!canManageClients(context)) {
        throw new AuthorizationError(PERMISSIONS.CLIENTS_MANAGE);
      }
      if (contactName && contactPhone) {
        const contact = await createClientContact(context, {
          clientId,
          name: contactName,
          phone: contactPhone,
          email: contactEmail,
          role: 'other',
        });
        primaryContactId = contact.id;
      }
    } else if (contactMode === 'existing') {
      const contactId = formValue(formData, 'contactId');
      if (contactId) primaryContactId = contactId;
    }
  }

  const includeFinance = canSetContractOnCreate(context);
  const billingPlanModeRaw = formValue(formData, 'billingPlanMode') ?? 'none';
  const billingPlanMode =
    billingPlanModeRaw === 'simple' || billingPlanModeRaw === 'template'
      ? billingPlanModeRaw
      : 'none';

  const launch = parseLaunchSource(formData, templateLocale);
  const templateKey =
    launch.kind === 'structure_template' ? launch.templateKey : null;
  const teamParsed = parseProjectCreateTeam(formData);
  const hasTeamSelection =
    Boolean(teamParsed.projectManagerKey) || (teamParsed.participantKeys?.length ?? 0) > 0;
  const team = hasTeamSelection && canManageProjectTeamAtCreate(context) ? teamParsed : undefined;

  return {
    input: {
      name: requiredFormValue(formData, 'name'),
      clientId,
      primaryContactId,
      contractValueAmount: includeFinance ? formValue(formData, 'contractValueAmount') : undefined,
      contractValueCurrency: includeFinance ? formValue(formData, 'contractValueCurrency') : undefined,
      amountIncludesTax: includeFinance ? formValue(formData, 'amountIncludesTax') : undefined,
      openingReductionAmount: includeFinance
        ? formValue(formData, 'openingReductionAmount')
        : undefined,
      domainName: formValue(formData, 'domainName'),
      location: formValue(formData, 'location'),
      description: formValue(formData, 'description'),
      startDate: formValue(formData, 'startDate'),
      targetEndDate: formValue(formData, 'targetEndDate'),
      notes: formValue(formData, 'notes'),
    },
    launch,
    team,
    templateKey,
    billingPlanMode: includeFinance ? billingPlanMode : 'none',
    billingPlanTemplateKey:
      includeFinance && billingPlanMode === 'template'
        ? formValue(formData, 'billingPlanTemplateKey') ?? null
        : null,
  };
}
