import type { Metadata } from 'next';

import { getTranslations } from 'next-intl/server';

import { PageHeader } from '@/components/ui/page-header';

import { listMaterialsForOrg } from '@/modules/procurement';

import { listProjectsForOrg } from '@/modules/projects';

import { withOrgContext } from '@/shared/auth/session';

import { Link } from '@/shared/i18n/navigation';

import { hasPermission } from '@/shared/permissions/assert';

import { PERMISSIONS } from '@/shared/permissions/catalog';

import { RfqCreateForm } from './rfq-create-form';
import { textNavLinkMutedClassName } from '@/components/ui/pressable';



export async function generateMetadata({

  params,

}: {

  params: Promise<{ locale: string }>;

}): Promise<Metadata> {

  const { locale } = await params;

  const t = await getTranslations({ locale, namespace: 'procurement' });

  return { title: t('rfq.create.title') };

}



export default async function NewRfqPage() {

  const t = await getTranslations('procurement');



  const { projects, materials, canManage } = await withOrgContext(async (context) => {

    const canReadProjects = hasPermission(context, PERMISSIONS.PROJECTS_READ);

    const canReadMaterials = hasPermission(context, PERMISSIONS.MATERIALS_READ);



    const [projectRows, materialRows] = await Promise.all([

      canReadProjects ? listProjectsForOrg(context, { status: 'active' }) : Promise.resolve([]),

      canReadMaterials ? listMaterialsForOrg(context) : Promise.resolve([]),

    ]);



    return {

      projects: projectRows.map((project) => ({ id: project.id, name: project.name })),

      materials: materialRows.map((item) => ({

        id: item.id,

        name: item.name,

        unit: item.unit,

      })),

      canManage: hasPermission(context, PERMISSIONS.PROCUREMENT_MANAGE),

    };

  });



  return (

    <div className="flex min-w-0 flex-col gap-6">

      <PageHeader

        title={t('rfq.create.title')}

        description={t('rfq.create.description')}

        breadcrumb={

          <Link

            href="/procurement/rfqs"

            className={textNavLinkMutedClassName}

          >

            {t('rfq.title')}

          </Link>

        }

      />



      {canManage ? <RfqCreateForm projects={projects} materials={materials} /> : null}

    </div>

  );

}


