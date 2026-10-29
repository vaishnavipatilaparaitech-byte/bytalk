// Web Implementation of Notification Service for BYTALK
// Uses standard Web Notification API with graceful fallback (Zero native dependencies)

class NotificationServiceWeb {
  constructor() {
    this.isInitialized = false;
  }

  async initNotifications() {
    if (this.isInitialized) return;
    try {
      if (typeof window !== 'undefined' && 'Notification' in window) {
        if (Notification.permission === 'default') {
          await Notification.requestPermission().catch(() => {});
        }
      }
      this.isInitialized = true;
    } catch {}
  }

  async notifyIncomingCall({ callerName, callerCountry, sessionId }) {
    await this.initNotifications();
    try {
      if (typeof window !== 'undefined' && 'Notification' in window && Notification.permission === 'granted') {
        new Notification('📞 Incoming Audio Call', {
          body: `${callerName || 'Speaking Partner'}${callerCountry ? ` from ${callerCountry}` : ''} is calling you for English practice!`,
          icon: '/assets/logo_icon.png',
        });
      }
    } catch {}
  }

  async notifyCallConnected({ partnerName }) {
    await this.initNotifications();
    try {
      if (typeof window !== 'undefined' && 'Notification' in window && Notification.permission === 'granted') {
        new Notification('🎙️ Live English Conversation', {
          body: `Speaking with ${partnerName || 'Speaking Partner'}. Microphone active!`,
          icon: '/assets/logo_icon.png',
        });
      }
    } catch {}
  }

  async notifyCallEnded({ partnerName, durationSeconds }) {
    await this.initNotifications();
    try {
      const mins = Math.max(1, Math.round((durationSeconds || 0) / 60));
      if (typeof window !== 'undefined' && 'Notification' in window && Notification.permission === 'granted') {
        new Notification('🎉 Speaking Habit Maintained!', {
          body: `Completed ${mins} min conversation with ${partnerName || 'partner'}!`,
          icon: '/assets/logo_icon.png',
        });
      }
    } catch {}
  }

  async dismissCallNotifications() {}
}

const notificationService = new NotificationServiceWeb();
export default notificationService;
