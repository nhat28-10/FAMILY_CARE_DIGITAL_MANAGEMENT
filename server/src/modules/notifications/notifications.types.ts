import { NotificationPriority, NotificationType } from '@prisma/client';

export const NOTIFICATIONS_QUEUE = 'notifications';
export const DISPATCH_JOB = 'dispatch';
export const REMINDER_SCAN_JOB = 'reminder-scan';

/** Nội dung 1 notification đẩy xuống client (id = null nếu push-only, không persist). */
export interface NotificationPayload {
  id: string | null;
  familyId: string | null;
  type: NotificationType;
  priority: NotificationPriority;
  title: string;
  body: string;
  referenceType: string | null;
  referenceId: string | null;
  createdAt: string;
}

/** Một lượt giao tới 1 user (memberId = null với push-only). */
export interface NotificationDelivery {
  userId: string;
  memberId: string | null;
  notification: NotificationPayload;
}

/** Input cho notification push-only (chat, reject join request). */
export interface EphemeralNotificationInput {
  familyId: string | null;
  type: NotificationType;
  priority: NotificationPriority;
  title: string;
  body: string;
  referenceType?: string | null;
  referenceId?: string | null;
}

export type DispatchJobData =
  | { kind: 'persisted'; notificationIds: string[] }
  | {
      kind: 'ephemeral';
      userIds: string[];
      payload: EphemeralNotificationInput;
    };
