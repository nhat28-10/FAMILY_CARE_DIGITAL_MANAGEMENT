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
  /** Field tuỳ ý gộp thêm vào khối `data` FCM (vd callId/conversationId cho CALL). */
  data?: Record<string, string> | null;
  /**
   * true = gửi FCM data-only (không có khối `notification`) — app tự vẽ UI
   * (vd màn cuộc gọi đến full-screen) thay vì để Android tự hiện thông báo.
   * Mặc định false/undefined giữ nguyên hành vi cũ cho mọi notification khác.
   */
  dataOnly?: boolean;
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
  /** Field tuỳ ý gộp thêm vào khối `data` FCM (vd callId/conversationId cho CALL). */
  data?: Record<string, string>;
  /** true = gửi FCM data-only — xem `NotificationPayload.dataOnly`. */
  dataOnly?: boolean;
}

export type DispatchJobData =
  | { kind: 'persisted'; notificationIds: string[] }
  | {
      kind: 'ephemeral';
      userIds: string[];
      payload: EphemeralNotificationInput;
    };
