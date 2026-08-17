import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { Sparkles } from 'lucide-react';
import { EmptyState } from '@/components/ui/empty-state';
import { PageHeader } from '@/components/ui/page-header';
import { getAssistantProvider, getAssistantThread, listMyAssistantConversations } from '@/modules/assistant';
import { getShellContext, withOrgContext } from '@/shared/auth/session';
import { PERMISSIONS } from '@/shared/permissions/catalog';
import { AssistantChat } from './assistant-chat';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'assistant' });
  return { title: t('title') };
}

export default async function AssistantPage({
  searchParams,
}: {
  searchParams: Promise<{ conversation?: string }>;
}) {
  const t = await getTranslations('assistant');
  const shell = await getShellContext();
  if (!shell?.permissions.has(PERMISSIONS.ASSISTANT_USE)) {
    return <EmptyState icon={Sparkles} title={t('notAllowed.title')} description={t('notAllowed.body')} />;
  }
  const params = await searchParams;
  const provider = getAssistantProvider();
  const { conversationId, messages } = await withOrgContext(async (context) => {
    const conversations = await listMyAssistantConversations(context);
    const selected = params.conversation ?? conversations[0]?.id ?? null;
    if (!selected) return { conversationId: null, messages: [] as const };
    const thread = await getAssistantThread(context, selected);
    return { conversationId: selected, messages: thread.messages };
  });

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-6">
      <PageHeader title={t('title')} description={t('description')} />
      <AssistantChat
        conversationId={conversationId}
        messages={messages}
        providerConfigured={provider.isConfigured()}
      />
    </div>
  );
}
