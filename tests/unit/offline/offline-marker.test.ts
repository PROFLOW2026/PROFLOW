import { describe, expect, it } from 'vitest';
import {
  appendOfflineMarker,
  likePatternForOfflineMarker,
  offlineMarker,
} from '@/modules/offline/domain/offline-marker';

describe('offline idempotency marker', () => {
  it('embeds a stable local id marker', () => {
    expect(offlineMarker('abc-123')).toBe('[pf-offline:abc-123]');
    expect(appendOfflineMarker('note', 'abc-123')).toBe('note\n[pf-offline:abc-123]');
    expect(appendOfflineMarker(null, 'abc-123')).toBe('[pf-offline:abc-123]');
    expect(appendOfflineMarker('[pf-offline:abc-123]', 'abc-123')).toBe('[pf-offline:abc-123]');
    expect(likePatternForOfflineMarker('abc-123')).toBe('%[pf-offline:abc-123]%');
  });
});
