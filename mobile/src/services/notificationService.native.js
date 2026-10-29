// Native Expo Notifications Service for BYTALK (iOS & Android)

import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';

class NotificationServiceNative {
  constructor() {
    this.isInitialized = false;
    this.activeCallNotificationId = null;
  }

  async initNotifications() {
    if (this.isInitialized) return;

    try {
      Notifications.setNotificationHandler({
        handleNotification: async () => ({
          shouldShowAlert: true,
          shouldPlaySound: true,
          shouldSetBadge: false,
        }),
      });

      if (Platform.OS === 'android') {
        await Notifications.setNotificationChannelAsync('bytalk-calls', {
          name: 'BYTALK Audio Calls',
          importance: Notifications.AndroidImportance.MAX,
          vibrationPattern: [0, 250, 250, 250],
          lightColor: '#FF6847',
          sound: 'default',
        }).catch(() => {});

        await Notifications.setNotificationChannelAsync('bytalk-messages', {
          name: 'BYTALK Messages & Activity',
          importance: Notifications.AndroidImportance.HIGH,
          lightColor: '#10B981',
          sound: 'default',
        }).catch(() => {});
      }

      const { status: existingStatus } = await Notifications.getPermissionsAsync().catch(() => ({ status: 'undetermined' }));
      let finalStatus = existingStatus;
      if (existingStatus !== 'granted') {
        const { status } = await Notifications.requestPermissionsAsync().catch(() => ({ status: 'denied' }));
        finalStatus = status;
      }
      console.log(`[NotificationServiceNative] Notification permission status: ${finalStatus}`);

      this.isInitialized = true;
    } catch (err) {
      console.warn('[NotificationServiceNative] Error initializing notifications:', err.message);
    }
  }

  async notifyIncomingCall({ callerName, callerCountry, sessionId }) {
    await this.initNotifications();
    try {
      const notifId = await Notifications.scheduleNotificationAsync({
        content: {
          title: '📞 Incoming Audio Call',
          body: `${callerName || 'Speaking Partner'}${callerCountry ? ` from ${callerCountry}` : ''} is calling you. Tap to accept!`,
          data: { type: 'call:incoming', sessionId, callerName },
          sound: 'default',
          priority: Notifications.AndroidNotificationPriority.MAX,
          channelId: 'bytalk-calls',
        },
        trigger: null,
      });

      this.activeCallNotificationId = notifId;
    } catch (err) {
      console.warn('[NotificationServiceNative] Error triggering incoming call notification:', err.message);
    }
  }

  async notifyCallConnected({ partnerName }) {
    await this.initNotifications();
    try {
      if (this.activeCallNotificationId) {
        await Notifications.dismissNotificationAsync(this.activeCallNotificationId).catch(() => {});
        this.activeCallNotificationId = null;
      }

      const notifId = await Notifications.scheduleNotificationAsync({
        content: {
          title: '🎙️ Live English Conversation',
          body: `Speaking with ${partnerName || 'Speaking Partner'}. Microphone and audio active!`,
          data: { type: 'call:active', partnerName },
          sound: null,
          priority: Notifications.AndroidNotificationPriority.DEFAULT,
          channelId: 'bytalk-calls',
        },
        trigger: null,
      });

      this.activeCallNotificationId = notifId;
    } catch (err) {
      console.warn('[NotificationServiceNative] Error triggering call connected notification:', err.message);
    }
  }

  async notifyCallEnded({ partnerName, durationSeconds }) {
    await this.initNotifications();
    try {
      if (this.activeCallNotificationId) {
        await Notifications.dismissNotificationAsync(this.activeCallNotificationId).catch(() => {});
        this.activeCallNotificationId = null;
      }

      const mins = Math.max(1, Math.round((durationSeconds || 0) / 60));
      await Notifications.scheduleNotificationAsync({
        content: {
          title: '🎉 Speaking Habit Maintained!',
          body: `Completed ${mins} min conversation with ${partnerName || 'partner'}. Fluency streak updated!`,
          data: { type: 'call:summary', durationSeconds },
          sound: 'default',
          channelId: 'bytalk-messages',
        },
        trigger: null,
      });
    } catch (err) {
      console.warn('[NotificationServiceNative] Error triggering call ended notification:', err.message);
    }
  }

  async dismissCallNotifications() {
    try {
      if (this.activeCallNotificationId) {
        await Notifications.dismissNotificationAsync(this.activeCallNotificationId).catch(() => {});
        this.activeCallNotificationId = null;
      }
    } catch {}
  }
}

const notificationService = new NotificationServiceNative();
export default notificationService;
