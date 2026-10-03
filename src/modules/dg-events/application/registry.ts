import { DG_EVENT_SPECS } from '../domain/event-catalog';
import type { DgEventSpec } from '../domain/types';
import { createSpecHandler, type DgEventHandler } from './spec-handler';

/**
 * Pluggable handler registry keyed by domain event type. Every event named in the track briefs has
 * a spec-driven handler; a track that needs bespoke behaviour registers its own handler for its
 * type. Types without a handler are marked processed with no side effects.
 */
export interface DgEventHandlerRegistry {
  get(eventType: string): DgEventHandler | undefined;
  register(eventType: string, handler: DgEventHandler): void;
  types(): readonly string[];
}

export function createDgEventHandlerRegistry(specs: readonly DgEventSpec[] = DG_EVENT_SPECS): DgEventHandlerRegistry {
  const handlers = new Map<string, DgEventHandler>(specs.map((spec) => [spec.type, createSpecHandler(spec)]));
  return {
    get: (eventType) => handlers.get(eventType),
    register: (eventType, handler) => {
      handlers.set(eventType, handler);
    },
    types: () => [...handlers.keys()],
  };
}

export const defaultDgEventHandlers: DgEventHandlerRegistry = createDgEventHandlerRegistry();

export function registerDgEventHandler(eventType: string, handler: DgEventHandler): void {
  defaultDgEventHandlers.register(eventType, handler);
}
