import { NextResponse } from 'next/server';
import { isKnownInboundSenderPhone } from '@/modules/integrations/whatsapp/known-sender';
import { insertWhatsAppInboundEvent } from '@/modules/integrations/whatsapp/inbound-events.repository';
import { parseWhatsAppInboundPayload } from '@/modules/integrations/whatsapp/parse-webhook';
import { resolveOrganizationIdByWhatsAppLine } from '@/modules/integrations/whatsapp/resolve-org-by-line';
import { verifyWhatsAppHubSignature } from '@/modules/integrations/whatsapp/signature';
import { getAdminDb } from '@/shared/db/client';

function whatsAppEnv(): { appSecret: string; verifyToken: string } | null {
  const appSecret = process.env.WHATSAPP_APP_SECRET?.trim();
  const verifyToken = process.env.WHATSAPP_VERIFY_TOKEN?.trim();
  if (!appSecret || !verifyToken) return null;
  return { appSecret, verifyToken };
}

function unconfiguredResponse() {
  return NextResponse.json({ ok: false, reason: 'unconfigured' }, { status: 503 });
}

export async function GET(request: Request): Promise<Response> {
  const env = whatsAppEnv();
  if (!env) return unconfiguredResponse();

  const url = new URL(request.url);
  const mode = url.searchParams.get('hub.mode');
  const token = url.searchParams.get('hub.verify_token');
  const challenge = url.searchParams.get('hub.challenge');

  if (mode === 'subscribe' && token === env.verifyToken && challenge) {
    return new Response(challenge, { status: 200 });
  }

  return new Response('Forbidden', { status: 403 });
}

export async function POST(request: Request): Promise<Response> {
  const env = whatsAppEnv();
  if (!env) return unconfiguredResponse();

  const rawBody = await request.text();
  const signature = request.headers.get('x-hub-signature-256');
  if (!verifyWhatsAppHubSignature(rawBody, signature, env.appSecret)) {
    return NextResponse.json({ ok: false, reason: 'invalid_signature' }, { status: 401 });
  }

  let payload: unknown;
  try {
    payload = JSON.parse(rawBody) as unknown;
  } catch {
    return NextResponse.json({ ok: false, reason: 'invalid_json' }, { status: 400 });
  }

  const message = parseWhatsAppInboundPayload(payload);
  if (!message) {
    return NextResponse.json({ ok: true, ignored: true, reason: 'no_message' });
  }

  const db = getAdminDb();
  const organizationId = await resolveOrganizationIdByWhatsAppLine(db, message.businessPhone);
  if (!organizationId) {
    return NextResponse.json({ ok: true, ignored: true });
  }

  const senderKnown = await isKnownInboundSenderPhone(db, organizationId, message.fromPhone);
  if (!senderKnown) {
    return NextResponse.json({ ok: true, ignored: true });
  }

  try {
    const outcome = await insertWhatsAppInboundEvent(db, {
      organizationId,
      externalMessageId: message.externalMessageId,
      fromPhone: message.fromPhone,
      status: 'drafted',
    });
    if (outcome === 'duplicate') {
      return NextResponse.json({ ok: true, duplicate: true });
    }
    return NextResponse.json({ ok: true, accepted: true });
  } catch {
    return NextResponse.json({ ok: true, duplicate: true });
  }
}
