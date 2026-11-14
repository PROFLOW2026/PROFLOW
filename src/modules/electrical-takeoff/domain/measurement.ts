import type { BoqLineKind, ComponentRole, MeasurementRule, MeasurementRuleSet } from './contracts';

export const DEFAULT_RULE_SET: MeasurementRuleSet = {
  id: 'default-count-each-v1',
  name: 'ספירה לפי זיהוי (ברירת מחדל)',
  scope: 'default',
  version: 1,
  rules: [
    {
      id: 'rule-count-each-all',
      label: 'כל זיהוי = יחידה אחת',
      appliesTo: {},
      mode: 'count_each',
      output: {},
    },
  ],
};

export const PROXIMITY_SOCKET_RULE_SET: MeasurementRuleSet = {
  id: 'proximity-socket-points',
  name: 'קיבוץ שקעים לנקודת תמחור',
  scope: 'project',
  version: 1,
  rules: [
    {
      id: 'group-sockets',
      label: 'שקעים בקרבה — נקודה אחת',
      appliesTo: { typeKeys: ['power.socket.single', 'power.socket.double', 'power.socket.triple', 'power.socket.ip'] },
      mode: 'group_by_proximity',
      proximity: { radiusPx: 48 },
      output: { lineKind: 'point_count', label: 'נקודת שקעים' },
    },
    {
      id: 'count-rest',
      label: 'יתר הזיהויים — לפי יחידה',
      appliesTo: {},
      mode: 'count_each',
      output: {},
    },
  ],
};

export function roleToLineKind(role: ComponentRole): BoqLineKind {
  switch (role) {
    case 'fixture':
      return 'fixture_count';
    case 'device':
      return 'device_count';
    case 'equipment':
      return 'equipment_count';
    case 'point':
      return 'point_count';
    case 'linear':
      return 'length';
    default: {
      const _x: never = role;
      return _x;
    }
  }
}

export function resolveRuleForType(rules: readonly MeasurementRule[], typeKey: string | null, category: string): MeasurementRule | null {
  if (!typeKey) return null;
  let fallback: MeasurementRule | null = null;
  for (const rule of rules) {
    const { typeKeys, categories } = rule.appliesTo;
    const hasFilter = (typeKeys?.length ?? 0) > 0 || (categories?.length ?? 0) > 0;
    if (typeKeys?.length && !typeKeys.includes(typeKey)) continue;
    if (categories?.length && !categories.includes(category as never)) continue;
    if (hasFilter) return rule;
    fallback = rule;
  }
  return fallback ?? rules[0] ?? null;
}