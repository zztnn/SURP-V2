export const NOTIFICATION_QUEUE = Symbol('NOTIFICATION_QUEUE');

export interface NotificationDispatchJob {
  notificationId: string; // BigInt como string (BullMQ no soporta BigInt nativo).
}

/**
 * Cola `notification-dispatch` (BullMQ). El use case `EnqueueNotification`
 * llama `enqueueDispatch()` después de persistir la fila en BD; el
 * processor del worker la consume.
 */
export interface NotificationQueuePort {
  enqueueDispatch(job: NotificationDispatchJob): Promise<void>;
}
