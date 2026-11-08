import { describe, expect, it } from 'vitest';
import { loadMessages } from '@/shared/i18n/messages';
import { LOCALES } from '@/shared/i18n/config';

describe('appearance theme messages', () => {
  it.each(LOCALES)('locale %s includes appearance labels', async (locale) => {
    const messages = await loadMessages(locale);
    const appearance = messages.appearance as Record<string, string> | undefined;
    expect(appearance?.label).toBeTruthy();
    expect(appearance?.switcher).toBeTruthy();
    expect(appearance?.light).toBeTruthy();
    expect(appearance?.dark).toBeTruthy();
    expect(appearance?.system).toBeTruthy();
    const style = appearance?.style as { label?: string; classic?: string; modern?: string; premium?: string } | undefined;
    expect(style?.label).toBeTruthy();
    expect(style?.classic).toBeTruthy();
    expect(style?.modern).toBeTruthy();
    expect(style?.premium).toBeTruthy();
  });
});
