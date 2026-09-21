'use server';

import { revalidatePath } from 'next/cache';
import { getLocale, getTranslations } from 'next-intl/server';
import { listClientsForOrg, listContactsForClients } from '@/modules/clients';
import { launchProject, listProjectsForOrg } from '@/modules/projects';
import { ensureProjectCreatorAccess } from '@/modules/projects/application/ensure-creator-project-access';
import {
  canManageProjectTeamAtCreate,
  loadProjectCreateTeamPickerOptions,
} from '@/modules/projects/application/load-project-create-team-options';
import { parseProjectCreateForm } from '@/modules/projects/application/parse-project-create-form';
import { listLaunchableUwmProjectTemplates } from '@/modules/tasks';
import type { ProjectCreateTeamPickerOption } from '@/modules/projects/domain/project-create-team';
import { assertEmployeeAppContext } from '@/modules/employee-app/application/session-guard';
import { employeeHasPermission } from '@/modules/employee-app/application/load-employee-app-context';
import type { ProjectFormState } from '@/app/[locale]/(app)/projects/actions';
import { withOrgContext } from '@/shared/auth/session';
import { isRedirectError } from '@/modules/workforce/application/map-workforce-action-error';
import {
  AppError,
  AuthorizationError,
  ValidationError,
  mapServerActionError,
} from '@/shared/errors';
import { redirect } from '@/shared/i18n/navigation';
import { PERMISSIONS } from '@/shared/permissions/catalog';
import { DATE_ORDER_MESSAGE } from '@/modules/projects';

async function mapValidationError(error: ValidationError): Promise<ProjectFormState> {
  const tErrors = await getTranslations('errors');
  const tValidation = await getTranslations('validation');
  return mapServerActionError(error, {
    tErrors: (key) => tErrors(key as 'validationFailed'),
    fieldMessageOverrides: {
      [DATE_ORDER_MESSAGE]: tValidation('endBeforeStart'),
    },
  });
}

export async function employeeCreateProjectAction(
  _prev: ProjectFormState,
  formData: FormData,
): Promise<ProjectFormState> {
  const tErrors = await getTranslations('errors');
  const locale = await getLocale();

  try {
    const projectId = await withOrgContext(async (context) => {
      await assertEmployeeAppContext(context);
      if (!employeeHasPermission(context, PERMISSIONS.PROJECTS_CREATE)) {
        throw new AuthorizationError(PERMISSIONS.PROJECTS_CREATE);
      }

      const templateLocale = locale === 'he-IL' ? 'he-IL' : 'en';
      const form = await parseProjectCreateForm(context, formData, { templateLocale });
      const created = await launchProject(context, {
        create: form.input,
        launch: form.launch,
        team: form.team,
      });
      await ensureProjectCreatorAccess(context, created.projectId);
      return created.projectId;
    });

    revalidatePath('/employee/projects');
    redirect({ href: `/employee/projects/${projectId}`, locale });
  } catch (error) {
    if (isRedirectError(error)) throw error;
    if (error instanceof ValidationError) return await mapValidationError(error);
    if (error instanceof AuthorizationError) return { error: tErrors('notAllowed') };
    if (error instanceof AppError) return { error: tErrors('unexpected') };
    throw error;
  }

  return {};
}

export interface EmployeeProjectCreatePagePayload {
  readonly baseCurrency: string;
  readonly currencySymbol: string;
  readonly clients: {
    id: string;
    name: string;
    contacts: {
      id: string;
      name: string;
      phone: string | null;
      role: string;
      createdAt?: string;
    }[];
  }[];
  readonly taxRatePercent: string | null;
  readonly uwmTemplates: {
    id: string;
    name: string;
    description: string | null;
    stageCount: number;
    taskCount: number;
  }[];
  readonly cloneSourceProjects: { id: string; name: string }[];
  readonly teamCandidates: ProjectCreateTeamPickerOption[];
  readonly capabilities: {
    readonly canSelectClient: boolean;
    readonly canCreateClient: boolean;
    readonly showFinance: boolean;
    readonly showBillingPlan: boolean;
    readonly showTemplatePicker: boolean;
    readonly showTeamSection: boolean;
  };
}

export async function loadEmployeeProjectCreatePagePayload(): Promise<EmployeeProjectCreatePagePayload | null> {
  return withOrgContext(async (context) => {
    await assertEmployeeAppContext(context);
    if (!employeeHasPermission(context, PERMISSIONS.PROJECTS_CREATE)) return null;

    const canSelectClient = employeeHasPermission(context, PERMISSIONS.CLIENTS_READ);
    const canCreateClient = employeeHasPermission(context, PERMISSIONS.CLIENTS_MANAGE);
    const showFinance = employeeHasPermission(context, PERMISSIONS.CONTRACTS_MANAGE);
    const showBillingPlan =
      showFinance && employeeHasPermission(context, PERMISSIONS.BILLING_MANAGE);

    let clients: EmployeeProjectCreatePagePayload['clients'] = [];
    if (canSelectClient) {
      const rows = await listClientsForOrg(context, {});
      const contacts = await listContactsForClients(
        context,
        rows.map((client) => client.id),
      );
      const contactsByClient = new Map<string, typeof contacts>();
      for (const contact of contacts) {
        const list = contactsByClient.get(contact.clientId) ?? [];
        list.push(contact);
        contactsByClient.set(contact.clientId, list);
      }
      clients = rows.map((client) => ({
        id: client.id,
        name: client.name,
        contacts: (contactsByClient.get(client.id) ?? []).map((contact) => ({
          id: contact.id,
          name: contact.name,
          phone: contact.phone,
          role: contact.role,
          createdAt: contact.createdAt.toISOString(),
        })),
      }));
    }

    const baseCurrency = context.organization.baseCurrency ?? 'ILS';
    let taxRatePercent: string | null = null;
    if (showFinance) {
      const { resolveApplicableDefaultTax } = await import('@/modules/tax');
      const { todayInTimeZone } = await import('@/shared/dates');
      const tax = await resolveApplicableDefaultTax(
        context,
        todayInTimeZone(context.organization.timezone),
      );
      taxRatePercent = tax.resolved?.ratePercent ?? null;
    }

    const showTeamSection = canManageProjectTeamAtCreate(context);
    const [uwmTemplates, cloneSourceProjects, teamCandidates] = await Promise.all([
      listLaunchableUwmProjectTemplates(context).catch(() => []),
      employeeHasPermission(context, PERMISSIONS.PROJECTS_READ)
        ? listProjectsForOrg(context, { status: 'active' })
            .then((rows) => rows.map((project) => ({ id: project.id, name: project.name })))
            .catch(() => [])
        : Promise.resolve([]),
      showTeamSection ? loadProjectCreateTeamPickerOptions(context) : Promise.resolve([]),
    ]);

    return {
      baseCurrency,
      currencySymbol: baseCurrency === 'ILS' ? '₪' : baseCurrency,
      clients,
      taxRatePercent,
      uwmTemplates: uwmTemplates.map((template) => ({
        id: template.id,
        name: template.name,
        description: template.description,
        stageCount: template.stageCount,
        taskCount: template.taskCount,
      })),
      cloneSourceProjects,
      teamCandidates,
      capabilities: {
        canSelectClient,
        canCreateClient,
        showFinance,
        showBillingPlan,
        showTemplatePicker: true,
        showTeamSection,
      },
    };
  });
}
