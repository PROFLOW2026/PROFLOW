import { Plus } from 'lucide-react';

import type { Metadata } from 'next';

import { getTranslations } from 'next-intl/server';

import { Button } from '@/components/ui/button';

import { EmptyState } from '@/components/ui/empty-state';

import { PageHeader } from '@/components/ui/page-header';

import { StatusBadge } from '@/components/ui/status-badge';

import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';

import { listClientsForOrg } from '@/modules/clients';

import { getShellContext, withOrgContext } from '@/shared/auth/session';

import { PERMISSIONS } from '@/shared/permissions/catalog';

import { Link } from '@/shared/i18n/navigation';

import { ClientListFilters } from './client-list-filters';



export async function generateMetadata({

  params,

}: {

  params: Promise<{ locale: string }>;

}): Promise<Metadata> {

  const { locale } = await params;

  const t = await getTranslations({ locale, namespace: 'clients' });

  return { title: t('title') };

}



interface ClientsPageProps {

  searchParams: Promise<{ q?: string }>;

}



export default async function ClientsPage({ searchParams }: ClientsPageProps) {

  const t = await getTranslations('clients');

  const tStatus = await getTranslations('status.generic');

  const params = await searchParams;

  const shell = await getShellContext();

  const canManage = shell?.permissions.has(PERMISSIONS.CLIENTS_MANAGE) ?? false;



  const clients = await withOrgContext((context) =>

    listClientsForOrg(context, { search: params.q }),

  );



  return (

    <div className="flex flex-col gap-6">

      <PageHeader

        title={t('title')}

        actions={

          canManage ? (

            <Button asChild>

              <Link href="/clients/new">

                <Plus aria-hidden />

                {t('newClient')}

              </Link>

            </Button>

          ) : null

        }

      />



      <ClientListFilters initialQuery={params.q ?? ''} />



      {clients.length === 0 ? (

        <EmptyState

          title={t('empty.title')}

          description={t('empty.body')}

          action={

            canManage ? (

              <Button asChild>

                <Link href="/clients/new">{t('empty.action')}</Link>

              </Button>

            ) : undefined

          }

        />

      ) : (

        <>

          <div className="hidden md:block">

            <Table>

              <TableHeader>

                <TableRow>

                  <TableHead>{t('list.columns.name')}</TableHead>

                  <TableHead numeric>{t('list.columns.projects')}</TableHead>

                  <TableHead>{t('list.columns.status')}</TableHead>

                </TableRow>

              </TableHeader>

              <TableBody>

                {clients.map((client) => (

                  <TableRow key={client.id}>

                    <TableCell>

                      <Link href={`/clients/${client.id}`} className="font-medium hover:underline">

                        {client.name}

                      </Link>

                    </TableCell>

                    <TableCell numeric>{client.projectCount}</TableCell>

                    <TableCell>

                      <StatusBadge

                        shape={client.status === 'active' ? 'active' : 'archived'}

                        label={tStatus(client.status)}

                      />

                    </TableCell>

                  </TableRow>

                ))}

              </TableBody>

            </Table>

          </div>



          <div className="flex flex-col gap-3 md:hidden">

            {clients.map((client) => (

              <Link

                key={client.id}

                href={`/clients/${client.id}`}

                className="rounded-lg border border-[var(--pf-border-default)] bg-[var(--pf-bg-surface)] p-4"

              >

                <div className="flex items-start justify-between gap-2">

                  <span className="font-semibold">{client.name}</span>

                  <StatusBadge

                    shape={client.status === 'active' ? 'active' : 'archived'}

                    label={tStatus(client.status)}

                  />

                </div>

                <p className="mt-1 text-sm text-[var(--pf-text-secondary)]">

                  {t('list.columns.projects')}: {client.projectCount}

                </p>

              </Link>

            ))}

          </div>

        </>

      )}

    </div>

  );

}


