// Native Expo AV Audio Service for BYTALK (iOS & Android)

import { Audio } from 'expo-av';

class AudioServiceNative {
  constructor() {
    this.ringtoneSound = null;
    this.notificationSound = null;
    this.recording = null;
    this.isRinging = false;
    this.isSpeaking = false;
    this.isMuted = false;
  }

  async playRingtone() {
    if (this.isRinging) return;
    this.isRinging = true;

    try {
      await Audio.setAudioModeAsync({
        allowsRecordingIOS: false,
        playsInSilentModeIOS: true,
        staysActiveInBackground: true,
        shouldDuckAndroid: true,
        playThroughEarpieceAndroid: false,
      }).catch(() => {});

      if (this.ringtoneSound) {
        await this.stopRingtone();
      }

      const ringtoneAsset = require('../../assets/sounds/ringtone.mp3');
      const { sound } = await Audio.Sound.createAsync(
        ringtoneAsset,
        { shouldPlay: true, isLooping: true, volume: 1.0 },
        (status) => {
          if (status.didJustFinish && !status.isLooping) {
            sound.replayAsync().catch(() => {});
          }
        }
      );

      this.ringtoneSound = sound;
      await sound.playAsync().catch(() => {});
    } catch (err) {
      console.warn('[AudioServiceNative] Error playing ringtone:', err.message);
    }
  }

  async stopRingtone() {
    this.isRinging = false;
    if (this.ringtoneSound) {
      try {
        await this.ringtoneSound.stopAsync().catch(() => {});
        await this.ringtoneSound.unloadAsync().catch(() => {});
      } catch (err) {
        console.warn('[AudioServiceNative] Error stopping ringtone:', err.message);
      } finally {
        this.ringtoneSound = null;
      }
    }
  }

  async playNotificationSound() {
    try {
      const notifAsset = require('../../assets/sounds/notification.mp3');
      const { sound } = await Audio.Sound.createAsync(
        notifAsset,
        { shouldPlay: true, isLooping: false, volume: 0.8 }
      );
      sound.setOnPlaybackStatusUpdate((st) => {
        if (st.didJustFinish) {
          sound.unloadAsync().catch(() => {});
        }
      });
      await sound.playAsync().catch(() => {});
    } catch (err) {
      console.warn('[AudioServiceNative] Error playing notification sound:', err.message);
    }
  }

  async requestMicrophonePermission() {
    try {
      const { status } = await Audio.requestPermissionsAsync();
      return { granted: status === 'granted' };
    } catch (err) {
      console.warn('[AudioServiceNative] Permission request failed:', err.message);
      return { granted: false };
    }
  }

  getLocalStream() {
    return null;
  }

  async startSpeakingSession(onAudioStatus) {
    if (this.isSpeaking) return;
    this.isSpeaking = true;
    this.isMuted = false;

    await this.stopRingtone();

    try {
      await Audio.setAudioModeAsync({
        allowsRecordingIOS: true,
        playsInSilentModeIOS: true,
        staysActiveInBackground: true,
        shouldDuckAndroid: true,
        playThroughEarpieceAndroid: false,
      }).catch(() => {});

      await this.requestMicrophonePermission();

      const recording = new Audio.Recording();
      await recording.prepareToRecordAsync({
        android: {
          extension: '.m4a',
          outputFormat: Audio.AndroidOutputFormat.MPEG_4,
          audioEncoder: Audio.AndroidAudioEncoder.AAC,
          sampleRate: 44100,
          numberOfChannels: 1,
          bitRate: 128000,
        },
        ios: {
          extension: '.m4a',
          outputFormat: Audio.IOSOutputFormat.MPEG4AAC,
          audioQuality: Audio.IOSAudioQuality.HIGH,
          sampleRate: 44100,
          numberOfChannels: 1,
          bitRate: 128000,
          linearPCMBitDepth: 16,
          linearPCMIsBigEndian: false,
          linearPCMIsFloat: false,
        },
        web: {
          mimeType: 'audio/webm',
          bitsPerSecond: 128000,
        },
      });

      recording.setOnRecordingStatusUpdate((status) => {
        if (onAudioStatus) {
          onAudioStatus({
            isRecording: status.isRecording,
            durationMillis: status.durationMillis,
            metering: status.metering,
          });
        }
      });

      await recording.startAsync();
      this.recording = recording;
      console.log('[AudioServiceNative] Speaking session started with mic active.');
    } catch (err) {
      console.warn('[AudioServiceNative] Could not initialize native recording:', err.message);
    }
  }

  async setMuted(isMuted) {
    this.isMuted = isMuted;
    try {
      if (this.recording) {
        if (isMuted) {
          await this.recording.pauseAsync().catch(() => {});
        } else {
          await this.recording.startAsync().catch(() => {});
        }
      }
    } catch (err) {
      console.warn('[AudioServiceNative] Error setting mute status:', err.message);
    }
  }

  async stopSpeakingSession(force = false) {
    this.isSpeaking = false;
    this.isMuted = false;

    if (force && this.recording) {
      try {
        await this.recording.stopAndUnloadAsync().catch(() => {});
      } catch (err) {
        console.warn('[AudioServiceNative] Error stopping recording:', err.message);
      } finally {
        this.recording = null;
      }
    }

    try {
      await Audio.setAudioModeAsync({
        allowsRecordingIOS: false,
        playsInSilentModeIOS: true,
      }).catch(() => {});
    } catch {}

    console.log('[AudioServiceNative] Speaking session ended, microphone released.');
  }
}

const audioService = new AudioServiceNative();
export default audioService;
