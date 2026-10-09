import { describe, expect, it } from 'vitest';
import {
  APP_CLIENT_MESSAGE_NAMESPACES,
  AUTH_CLIENT_MESSAGE_NAMESPACES,
  MARKETING_CLIENT_MESSAGE_NAMESPACES,
  ROOT_CLIENT_MESSAGE_NAMESPACES,
} from '@/shared/i18n/config';
import { appClientMessageNamespaces, pickClientMessages } from '@/shared/i18n/pick-client-messages';

describe('client message scoping', () => {
  it('root layout ships only universal namespaces', () => {
    expect(ROOT_CLIENT_MESSAGE_NAMESPACES).toEqual(['common', 'errors', 'offline']);
    expect(ROOT_CLIENT_MESSAGE_NAMESPACES.length).toBeLessThan(5);
  });

  it('WithClientMessages exact set excludes the app catalog', () => {
    const messages = Object.fromEntries(
      [...ROOT_CLIENT_MESSAGE_NAMESPACES, ...AUTH_CLIENT_MESSAGE_NAMESPACES, ...APP_CLIENT_MESSAGE_NAMESPACES].map(
        (ns) => [ns, { sample: ns }],
      ),
    );
    const picked = pickClientMessages(messages, AUTH_CLIENT_MESSAGE_NAMESPACES);
    expect(Object.keys(picked).sort()).toEqual([...AUTH_CLIENT_MESSAGE_NAMESPACES].sort());
    expect(picked).not.toHaveProperty('projects');
  });

  it('app wrapper merges authenticated base with extras', () => {
    const merged = appClientMessageNamespaces('imports');
    expect(merged).toContain('imports');
    expect(merged).toContain('nav');
    expect(merged.length).toBeGreaterThan(APP_CLIENT_MESSAGE_NAMESPACES.length - 1);
  });

  it('marketing scope stays lean', () => {
    expect(MARKETING_CLIENT_MESSAGE_NAMESPACES).toEqual(['common', 'marketing']);
  });
});
