// Web Implementation of Audio Service for BYTALK
// Powered by Web Audio API Tone Synthesis + Expo AV with HTML5 Audio integration
import { Audio } from 'expo-av';

class AudioServiceWeb {
  constructor() {
    this.htmlRingtone = null;
    this.isRinging = false;
    this.isSpeaking = false;
    this.isMuted = false;
    this.mediaStream = null;
    this._speakingPromise = null;

    // Web Audio Synthesizer for Professional Telecom Ringing Tones
    this._synthAudioCtx = null;
    this._ringtoneTimer = null;
    this._activeOscillators = [];
  }

  _getAudioContext() {
    if (typeof window === 'undefined') return null;
    if (!this._synthAudioCtx || this._synthAudioCtx.state === 'closed') {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (AudioCtx) this._synthAudioCtx = new AudioCtx();
    }
    if (this._synthAudioCtx && this._synthAudioCtx.state === 'suspended') {
      this._synthAudioCtx.resume().catch(() => {});
    }
    return this._synthAudioCtx;
  }

  /**
   * Professional Telecom Ringback Sound (440Hz + 480Hz dual-frequency chime)
   * High-fidelity, zero-latency, no network download needed, never fails.
   */
  _playProfessionalRingback() {
    const ctx = this._getAudioContext();
    if (!ctx) return;

    const playChimeBurst = () => {
      if (!this.isRinging) return;
      try {
        const now = ctx.currentTime;
        const duration = 1.4; // 1.4s ring, 2.6s pause

        const osc1 = ctx.createOscillator();
        const osc2 = ctx.createOscillator();
        const gainNode = ctx.createGain();

        // Standard US/International Telecom Ringback Tones (440 Hz & 480 Hz)
        osc1.type = 'sine';
        osc1.frequency.setValueAtTime(440, now);
        osc2.type = 'sine';
        osc2.frequency.setValueAtTime(480, now);

        // Acoustic Envelope: smooth attack, sustained chime, soft decay
        gainNode.gain.setValueAtTime(0.0001, now);
        gainNode.gain.exponentialRampToValueAtTime(0.18, now + 0.08);
        gainNode.gain.setValueAtTime(0.18, now + duration - 0.1);
        gainNode.gain.exponentialRampToValueAtTime(0.0001, now + duration);

        osc1.connect(gainNode);
        osc2.connect(gainNode);
        gainNode.connect(ctx.destination);

        osc1.start(now);
        osc2.start(now);
        osc1.stop(now + duration);
        osc2.stop(now + duration);

        this._activeOscillators.push(osc1, osc2);
      } catch (err) {
        console.warn('[AudioServiceWeb] Tone burst notice:', err);
      }
    };

    // First burst immediately
    playChimeBurst();

    // Repeat every 3.8 seconds (1.4s chime + 2.4s silence)
    if (this._ringtoneTimer) clearInterval(this._ringtoneTimer);
    this._ringtoneTimer = setInterval(() => {
      if (!this.isRinging) {
        clearInterval(this._ringtoneTimer);
        this._ringtoneTimer = null;
        return;
      }
      playChimeBurst();
    }, 3800);
  }

  async playRingtone() {
    if (this.isRinging) return;
    this.isRinging = true;

    try {
      if (Audio && Audio.setAudioModeAsync) {
        await Audio.setAudioModeAsync({
          allowsRecordingIOS: false,
          playsInSilentModeIOS: true,
        }).catch(() => {});
      }

      // Play pure synthesized professional telecom ring sound (NO background music/sounds)
      this._playProfessionalRingback();
    } catch (e) {
      console.warn('[AudioServiceWeb] Ringtone error:', e.message);
    }
  }

  async stopRingtone() {
    this.isRinging = false;

    // Stop recurring timer
    if (this._ringtoneTimer) {
      clearInterval(this._ringtoneTimer);
      this._ringtoneTimer = null;
    }

    // Stop active oscillators
    if (this._activeOscillators && this._activeOscillators.length > 0) {
      this._activeOscillators.forEach((osc) => {
        try { osc.stop(); } catch {}
      });
      this._activeOscillators = [];
    }

    if (this.htmlRingtone) {
      try {
        const audio = this.htmlRingtone;
        this.htmlRingtone = null;
        audio.pause();
        audio.currentTime = 0;
      } catch {}
    }
  }

  async playNotificationSound() {
    try {
      const ctx = this._getAudioContext();
      if (ctx) {
        const now = ctx.currentTime;
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(587.33, now); // D5
        osc.frequency.exponentialRampToValueAtTime(880, now + 0.12); // A5 chime
        gain.gain.setValueAtTime(0.001, now);
        gain.gain.exponentialRampToValueAtTime(0.15, now + 0.04);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.28);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(now);
        osc.stop(now + 0.3);
      }
    } catch {}
  }

  async requestMicrophonePermission() {
    try {
      if (this.mediaStream && this.mediaStream.getAudioTracks().some((t) => t.readyState === 'live')) {
        return { granted: true };
      }
      if (typeof navigator !== 'undefined' && navigator.mediaDevices?.getUserMedia) {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true }).catch(() => null);
        if (stream) {
          this.mediaStream = stream;
          return { granted: true };
        }
      }
      return { granted: false };
    } catch {
      return { granted: false };
    }
  }

  getLocalStream() {
    if (this.mediaStream && this.mediaStream.getAudioTracks().some((t) => t.readyState === 'live')) {
      return this.mediaStream;
    }
    return null;
  }

  async startSpeakingSession(onAudioStatus) {
    if (this._speakingPromise) {
      return this._speakingPromise;
    }

    if (this.mediaStream) {
      const hasLive = this.mediaStream.getAudioTracks().some((t) => t.readyState === 'live');
      if (hasLive) return this.mediaStream;
      // Stale/ended tracks - reset
      this.mediaStream = null;
    }

    this._speakingPromise = (async () => {
      this.isSpeaking = true;
      this.isMuted = false;
      await this.stopRingtone();

      try {
        if (Audio && Audio.setAudioModeAsync) {
          await Audio.setAudioModeAsync({
            allowsRecordingIOS: true,
            playsInSilentModeIOS: true,
            staysActiveInBackground: true,
          }).catch(() => {});
        }

        if (typeof navigator !== 'undefined' && navigator.mediaDevices?.getUserMedia) {
          let stream = null;
          try {
            stream = await navigator.mediaDevices.getUserMedia({
              audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
            });
          } catch (highQualityErr) {
            console.warn('[AudioServiceWeb] High-quality mic constraints unavailable, falling back:', highQualityErr.message);
            try {
              stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            } catch (fallbackErr) {
              console.error('[AudioServiceWeb] Microphone access denied or failed:', fallbackErr.message);
            }
          }

          if (stream) {
            this.mediaStream = stream;
            console.log('[AudioServiceWeb] Microphone successfully active for live speaking.');
            if (onAudioStatus) {
              onAudioStatus({ isRecording: true, durationMillis: 0, metering: -20 });
            }
          }
        }
      } catch (err) {
        console.warn('[AudioServiceWeb] Mic error:', err.message);
      }
      return this.mediaStream;
    })();

    try {
      return await this._speakingPromise;
    } finally {
      this._speakingPromise = null;
    }
  }

  async setMuted(isMuted) {
    this.isMuted = isMuted;
    if (this.mediaStream) {
      this.mediaStream.getAudioTracks().forEach((track) => {
        track.enabled = !isMuted;
      });
    }
  }

  async stopSpeakingSession(force = false) {
    this.isSpeaking = false;
    this.isMuted = false;
    this._speakingPromise = null;

    if (force && this.mediaStream) {
      try {
        this.mediaStream.getTracks().forEach((track) => track.stop());
      } catch {}
      this.mediaStream = null;
      console.log('[AudioServiceWeb] Microphone released.');
    }
  }
}

const audioService = new AudioServiceWeb();
export default audioService;
