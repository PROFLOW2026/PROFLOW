import { createHmac, randomUUID } from 'node:crypto';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { ANON_KEY, SEED_PASSWORD, SEED_USERS } from './config';

/**
 * A local stand-in for the subset of GoTrue that ProjectFlow actually calls.
 *
 * The application talks to it over real HTTP exactly as it would to Supabase,
 * so nothing in `src/` is modified, mocked or bypassed for the end-to-end run.
 * It is deliberately dumb: it authenticates against a fixed seed list and does
 * not pretend to be a security boundary.
 */

interface StubUser {
  id: string;
  email: string;
  displayName: string;
}

const users = new Map<string, StubUser>();
const tokens = new Map<string, string>();

for (const user of SEED_USERS) {
  users.set(user.email.toLowerCase(), { ...user });
}

function encodeSegment(value: object): string {
  return Buffer.from(JSON.stringify(value)).toString('base64url');
}

/**
 * A structurally valid JWT. supabase-js reads the payload for expiry, so the
 * shape matters even though nothing here verifies the signature.
 */
function issueAccessToken(user: StubUser): string {
  const issuedAt = Math.floor(Date.now() / 1000);
  const header = encodeSegment({ alg: 'HS256', typ: 'JWT' });
  const payload = encodeSegment({
    sub: user.id,
    email: user.email,
    aud: 'authenticated',
    role: 'authenticated',
    iat: issuedAt,
    exp: issuedAt + 3600,
    app_metadata: { provider: 'email', providers: ['email'] },
    user_metadata: { display_name: user.displayName },
  });
  const signature = createHmac('sha256', 'e2e-secret').update(`${header}.${payload}`).digest('base64url');
  return `${header}.${payload}.${signature}`;
}

function userPayload(user: StubUser) {
  const now = new Date().toISOString();
  return {
    id: user.id,
    aud: 'authenticated',
    role: 'authenticated',
    email: user.email,
    email_confirmed_at: now,
    confirmed_at: now,
    last_sign_in_at: now,
    phone: '',
    app_metadata: { provider: 'email', providers: ['email'] },
    user_metadata: { display_name: user.displayName },
    identities: [],
    created_at: now,
    updated_at: now,
    is_anonymous: false,
  };
}

function sessionPayload(user: StubUser) {
  const accessToken = issueAccessToken(user);
  const refreshToken = `refresh-${user.id}`;
  tokens.set(accessToken, user.email.toLowerCase());
  tokens.set(refreshToken, user.email.toLowerCase());

  return {
    access_token: accessToken,
    token_type: 'bearer',
    expires_in: 3600,
    expires_at: Math.floor(Date.now() / 1000) + 3600,
    refresh_token: refreshToken,
    user: userPayload(user),
  };
}

function send(response: ServerResponse, status: number, body: unknown): void {
  const payload = body === null ? '' : JSON.stringify(body);
  response.writeHead(status, {
    'content-type': 'application/json',
    'access-control-allow-origin': '*',
    'access-control-allow-headers': '*',
    'access-control-allow-methods': '*',
  });
  response.end(payload);
}

async function readBody(request: IncomingMessage): Promise<Record<string, unknown>> {
  const chunks: Buffer[] = [];
  for await (const chunk of request) chunks.push(chunk as Buffer);
  if (chunks.length === 0) return {};
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8')) as Record<string, unknown>;
  } catch {
    return {};
  }
}

function bearerUser(request: IncomingMessage): StubUser | null {
  const header = request.headers.authorization ?? '';
  const token = header.replace(/^Bearer\s+/i, '');
  if (!token || token === ANON_KEY) return null;
  const email = tokens.get(token);
  return email ? (users.get(email) ?? null) : null;
}

export function startAuthStub(port: number): Promise<() => Promise<void>> {
  const server = createServer((request, response) => {
    void (async () => {
      const url = new URL(request.url ?? '/', 'http://127.0.0.1');
      const path = url.pathname.replace(/^\/auth\/v1/, '');

      if (request.method === 'OPTIONS') return send(response, 204, null);
      if (path === '/health') return send(response, 200, { ok: true });

      if (path === '/settings') {
        return send(response, 200, { external: {}, disable_signup: false, mailer_autoconfirm: true });
      }

      if (path === '/token') {
        const body = await readBody(request);
        const grant = url.searchParams.get('grant_type');

        if (grant === 'refresh_token') {
          const email = tokens.get(String(body.refresh_token ?? ''));
          const user = email ? users.get(email) : null;
          if (!user) return send(response, 400, { error: 'invalid_grant' });
          return send(response, 200, sessionPayload(user));
        }

        const email = String(body.email ?? '').toLowerCase();
        const user = users.get(email);
        if (!user || String(body.password ?? '') !== SEED_PASSWORD) {
          return send(response, 400, {
            error: 'invalid_grant',
            error_description: 'Invalid login credentials',
          });
        }
        return send(response, 200, sessionPayload(user));
      }

      if (path === '/signup') {
        const body = await readBody(request);
        const email = String(body.email ?? '').toLowerCase();
        const metadata = (body.data ?? {}) as { display_name?: string };
        const existing = users.get(email);
        const user =
          existing ??
          ({
            id: randomUUID(),
            email,
            displayName: metadata.display_name ?? email,
          } satisfies StubUser);
        users.set(email, user);
        return send(response, 200, sessionPayload(user));
      }

      if (path === '/user') {
        const user = bearerUser(request);
        if (!user) return send(response, 401, { message: 'invalid claim' });
        if (request.method === 'PUT') {
          const body = await readBody(request);
          const metadata = (body.data ?? {}) as { display_name?: string };
          if (metadata.display_name) user.displayName = metadata.display_name;
        }
        return send(response, 200, userPayload(user));
      }

      if (path === '/logout') return send(response, 204, null);
      if (path === '/recover' || path === '/resend') return send(response, 200, {});

      return send(response, 404, { message: `unhandled auth route: ${path}` });
    })();
  });

  return new Promise((resolve) => {
    server.listen(port, '127.0.0.1', () => {
      resolve(
        () =>
          new Promise<void>((done) => {
            server.closeAllConnections?.();
            server.close(() => done());
          }),
      );
    });
  });
}
