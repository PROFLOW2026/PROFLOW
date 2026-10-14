export type TaskDeliveryChannelState = 'connected' | 'disconnected';

export interface TaskDeliveryChannelStatus {
  readonly email: TaskDeliveryChannelState;
  readonly push: TaskDeliveryChannelState;
}

/**
 * Planner P05 — task email/push stays off unless TASK_EMAIL_DELIVERY_ENABLED is set,
 * independent of EMAIL_DRIVER / Resend (NEW-TP-15).
 */
export function resolveTaskDeliveryChannelStatus(
  env: { taskEmailDeliveryEnabled?: boolean } = {},
): TaskDeliveryChannelStatus {
  const enabled =
    env.taskEmailDeliveryEnabled ?? process.env.TASK_EMAIL_DELIVERY_ENABLED === 'true';
  return {
    email: enabled ? 'connected' : 'disconnected',
    push: 'disconnected',
  };
}
