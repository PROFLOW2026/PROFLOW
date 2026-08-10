import {

  getEntityDocumentPanelData,

} from '@/modules/documents';

import { DocumentAttachments } from '@/modules/documents/ui';

import { withOrgContext } from '@/shared/auth/session';



/**

 * Server half of the project Documents tab: loads the attachments and hands

 * them to the client component, which owns the upload / link interaction.

 *

 * Contract files use the project owner + category `contract` until Lead lands

 * proposed migration `0014_document_contract_owner`.

 */

export async function DocumentsTab({

  projectId,

  hasContract,

}: {

  projectId: string;

  hasContract?: boolean;

}) {

  const panel = await withOrgContext((context) =>

    getEntityDocumentPanelData(context, 'project', projectId),

  );



  const contractDocs = panel.documents.filter((doc) =>

    (doc.label ?? '').toLowerCase().startsWith('contract'),

  );

  const otherDocs = panel.documents.filter(

    (doc) => !(doc.label ?? '').toLowerCase().startsWith('contract'),

  );



  return (

    <div className="flex flex-col gap-6">

      {hasContract ? (

        <DocumentAttachments

          ownerType="project"

          ownerId={projectId}

          documents={contractDocs}

          linkCandidates={panel.linkCandidates}

          canRead={panel.canRead}

          canManage={panel.canManage}

          storageConfigured={panel.storageConfigured}

          titleKey="contractTitle"

          defaultCategory="contract"

        />

      ) : null}

      <DocumentAttachments

        ownerType="project"

        ownerId={projectId}

        documents={hasContract ? otherDocs : panel.documents}

        linkCandidates={panel.linkCandidates}

        canRead={panel.canRead}

        canManage={panel.canManage}

        storageConfigured={panel.storageConfigured}

      />

    </div>

  );

}


