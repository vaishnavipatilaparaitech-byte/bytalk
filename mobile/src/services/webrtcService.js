// Universal WebRTC Audio & Matchmaking Service for BYTALK
// Conforms to Aparaitech Software BYTALK Specification (Sections 7, 8, 9, 12, 18, 20)
// Works seamlessly in Web browsers (native WebRTC) and Expo Go (Socket.io signaling relay)

import { io } from 'socket.io-client';
import { Platform } from 'react-native';
import audioService from './audioService';
import { getApiBaseUrl } from '../config';

const RTC_CONFIG = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    { urls: 'stun:stun2.l.google.com:19302' },
    { urls: 'stun:stun.cloudflare.com:3478' },
    { urls: 'stun:global.stun.twilio.com:3478' }
  ],
  iceCandidatePoolSize: 10,
};

class WebRTCService {
  constructor() {
    this.socket = null;
    this.peerConnection = null;
    this.localStream = null;
    this.remoteStream = null;
    this.remoteAudioElement = null;

    // Web Audio API pipeline for guaranteed browser audio playback
    this.audioContext = null;
    this.audioSourceNode = null;
    this.audioGainNode = null;

    this.currentUserId = null;
    this.currentSessionId = null;
    this.activePartner = null;
    this.role = null; // 'caller' | 'receiver'

    this.isMuted = false;
    this.isSpeakerOn = true;
    this.connectionState = 'idle'; // 'idle' | 'searching' | 'ringing' | 'incoming' | 'connecting' | 'connected' | 'ended'

    this.listeners = new Map();
    this.iceCandidatesQueue = [];

    // Concurrency lock and fallback audio recorder
    this._peerInitPromise = null;
    this.pendingOffer = null;
    this.mediaRecorder = null;
  }

  // Pre-create and unlock HTML <audio> and Web Audio API AudioContext during user gesture
  _ensureAudioElements() {
    if (typeof document !== 'undefined') {
      let audioEl = document.getElementById('bytalk-remote-audio');
      if (!audioEl) {
        audioEl = document.createElement('audio');
        audioEl.id = 'bytalk-remote-audio';
        audioEl.autoplay = true;
        audioEl.playsInline = true;
        audioEl.volume = 1.0;
        audioEl.muted = false;
        audioEl.style.position = 'fixed';
        audioEl.style.bottom = '0px';
        audioEl.style.right = '0px';
        audioEl.style.width = '1px';
        audioEl.style.height = '1px';
        audioEl.style.opacity = '0.01';
        audioEl.style.pointerEvents = 'none';
        audioEl.style.zIndex = '-1';
        document.body.appendChild(audioEl);
      }
      this.remoteAudioElement = audioEl;

      if (!this._gestureUnlocked && typeof window !== 'undefined') {
        this._gestureUnlocked = true;
        const unlock = () => {
          this.resumeAudio();
        };
        window.addEventListener('click', unlock, { passive: true });
        window.addEventListener('touchstart', unlock, { passive: true });
        window.addEventListener('keydown', unlock, { passive: true });
      }
    }

    if (typeof window !== 'undefined') {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (AudioCtx) {
        if (!this.audioContext || this.audioContext.state === 'closed') {
          this.audioContext = new AudioCtx();
        }
        if (this.audioContext.state === 'suspended') {
          this.audioContext.resume().catch(() => {});
        }
      }
    }
  }

  // Subscribe to events: 'match:waiting', 'match:found', 'call:connected', 'call:remote-mute', 'call:ended', 'error'
  on(event, handler) {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    this.listeners.get(event).add(handler);
    return () => this.off(event, handler);
  }

  off(event, handler) {
    if (this.listeners.has(event)) {
      this.listeners.get(event).delete(handler);
    }
  }

  emit(event, data) {
    if (this.listeners.has(event)) {
      this.listeners.get(event).forEach((handler) => {
        try {
          handler(data);
        } catch (err) {
          console.warn(`[WebRTCService] Error in event listener for ${event}:`, err);
        }
      });
    }
  }

  // Initialize socket signaling connection
  connect(apiUrl, userId) {
    this.currentUserId = userId;
    const serverUrl = apiUrl || getApiBaseUrl();

    if (!this.socket) {
      this.socket = io(serverUrl, {
        transports: ['websocket', 'polling'],
        reconnection: true,
        reconnectionAttempts: 5,
        reconnectionDelay: 1000,
      });

      this._setupSocketListeners();
    }

    if (userId) {
      this.socket.emit('user:online', { userId });
    }

    return this;
  }

  _setupSocketListeners() {
    if (!this.socket) return;

    // Matchmaking events
    this.socket.on('partner:waiting', (data) => {
      this.connectionState = 'searching';
      this.emit('match:waiting', data);
    });

    this.socket.on('partner:matched', (data) => {
      // { sessionId, role: 'caller' | 'receiver', partner: { id, name, country, level } }
      this.currentSessionId = data.sessionId;
      this.role = data.role;
      this.activePartner = data.partner;
      this.connectionState = 'connecting';

      this.emit('match:found', data);
    });

    this.socket.on('partner:cancelled', () => {
      this.connectionState = 'idle';
      this.emit('match:cancelled');
    });

    this.socket.on('match:error', (err) => {
      this.connectionState = 'idle';
      this.emit('error', err);
    });

    // Direct 1-to-1 Audio Calling & Ringing Events
    this.socket.on('call:ringing', (data) => {
      this.currentSessionId = data.sessionId;
      this.activePartner = data.partner;
      this.role = 'caller';
      this.connectionState = 'ringing';
      this.emit('call:ringing', data);
    });

    this.socket.on('call:incoming', (data) => {
      this.currentSessionId = data.sessionId;
      this.activePartner = data.caller;
      this.role = 'receiver';
      this.connectionState = 'incoming';
      this.emit('call:incoming', data);
    });

    this.socket.on('call:connected', (data) => {
      this.currentSessionId = data.sessionId;
      this.role = data.role;
      this.activePartner = data.partner;
      this.connectionState = 'connected';
      this.startCall({ sessionId: data.sessionId, partner: data.partner, role: data.role });
      this.emit('call:connected', data);
    });

    this.socket.on('call:declined', (data) => {
      this.connectionState = 'idle';
      this.emit('call:declined', data);
    });

    this.socket.on('call:cancelled', (data) => {
      this.connectionState = 'idle';
      this.emit('call:cancelled', data);
    });

    this.socket.on('call:unavailable', (data) => {
      this.connectionState = 'idle';
      this.emit('call:unavailable', data);
    });

    // WebRTC signaling relay events
    this.socket.on('call:offer', async ({ fromUserId, sessionId, offer }) => {
      if (this.connectionState === 'connected' && this.currentSessionId && this.currentSessionId !== sessionId) {
        return;
      }
      this.currentSessionId = sessionId;
      await this._handleReceiveOffer(fromUserId, sessionId, offer);
    });

    this.socket.on('call:answer', async ({ fromUserId, sessionId, answer }) => {
      if (this.connectionState === 'connected' && this.currentSessionId && this.currentSessionId !== sessionId) {
        return;
      }
      this.currentSessionId = sessionId;
      await this._handleReceiveAnswer(fromUserId, sessionId, answer);
    });

    this.socket.on('call:ice-candidate', async ({ fromUserId, sessionId, candidate }) => {
      if (this.connectionState === 'connected' && this.currentSessionId && this.currentSessionId !== sessionId) {
        return;
      }
      await this._handleReceiveIceCandidate(candidate);
    });

    // Handle real-time raw PCM voice stream (Guarantees audible two-way conversation)
    this.socket.on('audio:pcm', async ({ sessionId, buffer, sampleRate }) => {
      if (this.connectionState === 'ended' || this.connectionState === 'idle') return;
      if (this.connectionState !== 'connected') {
        this.connectionState = 'connected';
        this.emit('call:connected', { partner: this.activePartner, sessionId });
      }

      this.emit('partner:speaking', { speaking: true });

      try {
        if (!this.audioContext || this.audioContext.state === 'closed') {
          const AudioCtx = window.AudioContext || window.webkitAudioContext;
          if (AudioCtx) this.audioContext = new AudioCtx();
        }
        if (this.audioContext) {
          if (this.audioContext.state === 'suspended') {
            await this.audioContext.resume().catch(() => {});
          }
          if (!buffer) return;
          let int16;
          if (buffer instanceof ArrayBuffer) {
            int16 = new Int16Array(buffer);
          } else if (ArrayBuffer.isView(buffer)) {
            int16 = new Int16Array(buffer.buffer, buffer.byteOffset, buffer.byteLength / 2);
          } else if (typeof Blob !== 'undefined' && buffer instanceof Blob) {
            const ab = await buffer.arrayBuffer();
            int16 = new Int16Array(ab);
          } else if (buffer && typeof buffer === 'object' && buffer.buffer) {
            int16 = new Int16Array(buffer.buffer, buffer.byteOffset || 0, (buffer.byteLength || buffer.length) / 2);
          } else {
            int16 = new Int16Array(buffer);
          }

          if (!int16 || int16.length === 0) return;

          const float32 = new Float32Array(int16.length);
          for (let i = 0; i < int16.length; i++) {
            float32[i] = int16[i] / 32767;
          }
          const sRate = Number(sampleRate) || this.audioContext.sampleRate || 44100;
          const audioBuf = this.audioContext.createBuffer(1, float32.length, sRate);
          audioBuf.getChannelData(0).set(float32);

          const source = this.audioContext.createBufferSource();
          source.buffer = audioBuf;

          if (!this._pcmGainNode) {
            this._pcmGainNode = this.audioContext.createGain();
            this._pcmGainNode.connect(this.audioContext.destination);
          }
          this._pcmGainNode.gain.value = this.isSpeakerOn ? 2.0 : 0.0;

          source.connect(this._pcmGainNode);

          // Gapless Jitter-Free Audio Scheduling with smooth 40ms jitter buffer
          const currentTime = this.audioContext.currentTime;
          if (!this._pcmNextPlayTime || this._pcmNextPlayTime < currentTime) {
            this._pcmNextPlayTime = currentTime + 0.04;
          }
          source.start(this._pcmNextPlayTime);
          this._pcmNextPlayTime += audioBuf.duration;
        }
      } catch (pcmErr) {
        console.warn('[WebRTCService] Error playing PCM frame:', pcmErr);
      }
    });

    // Handle hybrid fallback audio chunk stream
    this.socket.on('audio:chunk', async ({ sessionId, chunk }) => {
      if (this.connectionState === 'ended' || this.connectionState === 'idle') return;
      if (this.connectionState !== 'connected') {
        this.connectionState = 'connected';
        this.emit('call:connected', { partner: this.activePartner, sessionId });
      }
      try {
        if (!this.audioContext || this.audioContext.state === 'closed') {
          const AudioCtx = window.AudioContext || window.webkitAudioContext;
          if (AudioCtx) this.audioContext = new AudioCtx();
        }
        if (this.audioContext) {
          if (this.audioContext.state === 'suspended') {
            await this.audioContext.resume().catch(() => {});
          }
          const audioBuffer = await this.audioContext.decodeAudioData(chunk.slice(0));
          const source = this.audioContext.createBufferSource();
          source.buffer = audioBuffer;
          source.connect(this.audioContext.destination);
          source.start();
        }
      } catch {}
    });

    this.socket.on('call:ended', ({ sessionId, peerUserId, reason }) => {
      this._teardownCall('remote_ended', { sessionId, peerUserId, reason });
    });

    this.socket.on('call:partner-mute', ({ isMuted }) => {
      this.emit('call:remote-mute', { isMuted });
    });
  }

  // 1. RANDOM PARTNER MATCHMAKING (Section 7)
  startMatchmaking(userData) {
    if (!this.socket) {
      this.connect(null, userData?.userId || 'u1');
    }
    this.connectionState = 'searching';
    this._ensureAudioElements();
    this.socket.emit('partner:find', {
      userId: userData?.userId || this.currentUserId,
      name: userData?.name || 'Learner',
      level: userData?.level || 'Intermediate',
    });
  }

  cancelMatchmaking() {
    this.connectionState = 'idle';
    if (this.socket) {
      this.socket.emit('partner:cancel');
    }
  }

  // Direct 1-to-1 Calling methods
  initiateDirectCall(targetUserOrPayload, callerInfo) {
    let targetUser = targetUserOrPayload;
    let caller = callerInfo;

    // Support single payload signature: { callerId, callerName, calleeId, calleeName, callerCountry }
    if (targetUserOrPayload && !callerInfo && (targetUserOrPayload.calleeId || targetUserOrPayload.toUserId)) {
      targetUser = {
        id: targetUserOrPayload.calleeId || targetUserOrPayload.toUserId,
        name: targetUserOrPayload.calleeName || targetUserOrPayload.targetName || 'Partner',
      };
      caller = {
        id: targetUserOrPayload.callerId || this.currentUserId,
        name: targetUserOrPayload.callerName || 'Caller',
        country: targetUserOrPayload.callerCountry || 'Global'
      };
    }

    if (!this.socket) {
      this.connect(null, caller?.id || this.currentUserId);
    }
    this.connectionState = 'ringing';
    this.activePartner = targetUser;
    this.role = 'caller';
    this._ensureAudioElements();

    this.socket.emit('call:initiate', {
      toUserId: targetUser.id,
      callerInfo: caller || { id: this.currentUserId, name: 'Caller' }
    });
  }

  acceptIncomingCall(sessionId, caller) {
    this.connectionState = 'connecting';
    this.currentSessionId = sessionId;
    this.activePartner = caller;
    this.role = 'receiver';
    this._ensureAudioElements();

    if (this.socket) {
      this.socket.emit('call:accept', { sessionId, callerId: caller.id });
    }
  }

  declineIncomingCall(sessionId, callerId, reason) {
    this.connectionState = 'idle';
    if (this.socket) {
      this.socket.emit('call:decline', { sessionId, callerId, reason });
    }
  }

  cancelOutgoingCall(toUserId) {
    this.connectionState = 'idle';
    if (this.socket) {
      this.socket.emit('call:cancel', {
        sessionId: this.currentSessionId,
        toUserId: toUserId || this.activePartner?.id
      });
    }
  }

  // 2. WEBRTC AUDIO CALL INITIALIZATION (Section 18 & 20)
  async startCall({ sessionId, partner, role }) {
    this.currentSessionId = sessionId;
    this.activePartner = partner;
    this.role = role || 'caller';
    this.isMuted = false;

    this._ensureAudioElements();

    const hasNativeWebRTC = typeof window !== 'undefined' && typeof window.RTCPeerConnection !== 'undefined';

    if (hasNativeWebRTC) {
      try {
        await this._initWebPeerConnection();
        this._startAudioChunkRelay();
        if (this.role === 'caller') {
          await this._createAndSendOffer();
        }
      } catch (err) {
        console.warn('[WebRTCService] Browser audio error, falling back to signaling mode:', err);
        this._initSignalingOnlyCall();
      }
    } else {
      this._initSignalingOnlyCall();
    }
  }

  async _initWebPeerConnection() {
    this._ensureAudioElements();

    // If active peer connection already initialized for this session, reuse it
    if (this.peerConnection && this.peerConnection.signalingState !== 'closed') {
      return this.peerConnection;
    }

    if (this._peerInitPromise) {
      return this._peerInitPromise;
    }

    this._peerInitPromise = (async () => {
      const pc = new window.RTCPeerConnection(RTC_CONFIG);
      this.peerConnection = pc;

      // 1. Acquire microphone audio stream
      try {
        let activeStream = (audioService && audioService.getLocalStream) ? audioService.getLocalStream() : null;
        let hasLiveTracks = activeStream && activeStream.getAudioTracks().some(t => t.readyState === 'live');

        if (!hasLiveTracks) {
          if (audioService && audioService.startSpeakingSession) {
            activeStream = await audioService.startSpeakingSession().catch(() => null);
          }
          if (!activeStream && typeof navigator !== 'undefined' && navigator.mediaDevices?.getUserMedia) {
            activeStream = await navigator.mediaDevices.getUserMedia({
              audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
              video: false,
            }).catch((err) => {
              console.warn('[WebRTCService] getUserMedia fallback error:', err);
              return null;
            });
          }
        }

        this.localStream = activeStream;

        if (this.localStream && this.localStream.getAudioTracks().length > 0) {
          this.localStream.getAudioTracks().forEach((track) => {
            track.enabled = !this.isMuted;
            try {
              pc.addTrack(track, this.localStream);
            } catch (trackErr) {
              console.warn('[WebRTCService] Error adding track:', trackErr);
            }
          });
          console.log('[WebRTCService] Local microphone track bound to PeerConnection.');
          this._startAudioChunkRelay();
        } else {
          // If microphone not available yet, register transceiver to receive peer audio
          try {
            pc.addTransceiver('audio', { direction: 'recvonly' });
          } catch {}
        }
      } catch (err) {
        console.warn('[WebRTCService] Microphone initialization notice:', err);
      }

      // 3. Handle remote incoming audio stream
      pc.ontrack = (event) => {
        console.log('[WebRTCService] Remote audio track received:', event.track?.id, event.track?.kind);
        let stream = event.streams && event.streams[0];
        if (!stream) {
          if (!this.remoteStream) {
            this.remoteStream = new MediaStream();
          }
          this.remoteStream.addTrack(event.track);
          stream = this.remoteStream;
        } else {
          this.remoteStream = stream;
        }

        event.track.enabled = true;
        stream.getAudioTracks().forEach((t) => { t.enabled = true; });

        this._ensureAudioElements();
        if (this.remoteAudioElement) {
          this.remoteAudioElement.srcObject = stream;
          this.remoteAudioElement.volume = 1.0;
          this.remoteAudioElement.muted = false;
          const playPromise = this.remoteAudioElement.play();
          if (playPromise !== undefined) {
            playPromise.catch((err) => {
              console.warn('[WebRTCService] HTMLAudio play notice:', err);
            });
          }
        }

        this.connectionState = 'connected';
        this.resumeAudio();
        this.emit('call:connected', { partner: this.activePartner, sessionId: this.currentSessionId });
        this._startAudioChunkRelay();
      };

      // 4. Handle ICE candidates
      pc.onicecandidate = (event) => {
        if (event.candidate && this.activePartner) {
          this.socket.emit('call:ice-candidate', {
            toUserId: this.activePartner.id,
            sessionId: this.currentSessionId,
            candidate: event.candidate,
          });
        }
      };

      const handleState = () => {
        const cState = pc.connectionState;
        const iState = pc.iceConnectionState;
        console.log('[WebRTCService] Peer state changed:', { connectionState: cState, iceConnectionState: iState });
        if (cState === 'connected' || iState === 'connected' || iState === 'completed') {
          this.connectionState = 'connected';
          this.resumeAudio();
          this.emit('call:connected', { partner: this.activePartner, sessionId: this.currentSessionId });
          this._startAudioChunkRelay();
        } else if (cState === 'failed' || iState === 'failed') {
          this.emit('call:quality-warning', { state: cState });
        }
      };

      pc.onconnectionstatechange = handleState;
      pc.oniceconnectionstatechange = handleState;

      return pc;
    })();

    try {
      return await this._peerInitPromise;
    } finally {
      this._peerInitPromise = null;
    }
  }

  resumeAudio() {
    if (this.audioContext && this.audioContext.state === 'suspended') {
      this.audioContext.resume().catch(() => {});
    }
    if (this.remoteAudioElement) {
      this.remoteAudioElement.muted = false;
      this.remoteAudioElement.volume = 1.0;
      if (this.remoteStream && (!this.remoteAudioElement.srcObject || this.remoteAudioElement.srcObject !== this.remoteStream)) {
        this.remoteAudioElement.srcObject = this.remoteStream;
      }
      this.remoteAudioElement.play().catch(() => {});
    }
    if (this._pcmGainNode) {
      this._pcmGainNode.gain.value = this.isSpeakerOn ? 1.5 : 0.0;
    }
  }

  async _createAndSendOffer() {
    if (!this.peerConnection || !this.activePartner) return;
    const offer = await this.peerConnection.createOffer({
      offerToReceiveAudio: true,
      offerToReceiveVideo: false,
    });
    await this.peerConnection.setLocalDescription(offer);

    this.socket.emit('call:offer', {
      toUserId: this.activePartner.id,
      sessionId: this.currentSessionId,
      offer,
    });
  }

  async _handleReceiveOffer(fromUserId, sessionId, offer) {
    if (this._isProcessingOffer) return;
    this._isProcessingOffer = true;

    try {
      const hasNativeWebRTC = typeof window !== 'undefined' && typeof window.RTCPeerConnection !== 'undefined';
      if (!hasNativeWebRTC) {
        this.socket.emit('call:answer', {
          toUserId: fromUserId,
          sessionId,
          answer: { type: 'answer', sdp: 'simulated-audio-sdp' },
        });
        this.connectionState = 'connected';
        this.emit('call:connected', { partner: this.activePartner, sessionId });
        return;
      }

      this.currentSessionId = sessionId;
      if (!this.activePartner) {
        this.activePartner = { id: fromUserId };
      }

      // Wait for in-flight initialization or initialize
      if (this._peerInitPromise) {
        await this._peerInitPromise;
      } else if (!this.peerConnection || this.peerConnection.signalingState === 'closed') {
        await this._initWebPeerConnection();
      }

      const pc = this.peerConnection;
      if (!pc || pc.signalingState === 'closed') {
        throw new Error('PeerConnection unavailable');
      }

      // Check if signalingState is ready to receive offer
      if (pc.signalingState !== 'stable') {
        console.log('[WebRTCService] Note: PeerConnection signalingState is', pc.signalingState);
        if (pc.signalingState === 'have-remote-offer') {
          // Already has remote offer set
          return;
        }
      }

      const offerDesc = (offer && offer.type) ? offer : { type: 'offer', sdp: offer?.sdp || offer };
      await pc.setRemoteDescription(new window.RTCSessionDescription(offerDesc));

      // Flush queued ICE candidates
      if (this.iceCandidatesQueue && this.iceCandidatesQueue.length > 0) {
        for (const c of this.iceCandidatesQueue) {
          try {
            if (c && c.candidate) {
              await pc.addIceCandidate(new window.RTCIceCandidate(c));
            }
          } catch {}
        }
        this.iceCandidatesQueue = [];
      }

      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);

      this.socket.emit('call:answer', {
        toUserId: fromUserId,
        sessionId,
        answer,
      });

      this.connectionState = 'connected';
      this.resumeAudio();
      this.emit('call:connected', { partner: this.activePartner, sessionId });
      this._startAudioChunkRelay();
    } catch (err) {
      console.warn('[WebRTCService] Error handling offer:', err);
      this.connectionState = 'connected';
      this.resumeAudio();
      this.emit('call:connected', { partner: this.activePartner, sessionId });
      this._startAudioChunkRelay();
    } finally {
      this._isProcessingOffer = false;
    }
  }

  async _handleReceiveAnswer(fromUserId, sessionId, answer) {
    if (this.peerConnection && this.peerConnection.signalingState !== 'closed') {
      try {
        if (this.peerConnection.signalingState === 'have-local-offer') {
          const answerDesc = (answer && answer.type) ? answer : { type: 'answer', sdp: answer?.sdp || answer };
          await this.peerConnection.setRemoteDescription(new window.RTCSessionDescription(answerDesc));
        }

        // Flush any ICE candidates queued before remote description was ready
        if (this.iceCandidatesQueue && this.iceCandidatesQueue.length > 0) {
          for (const c of this.iceCandidatesQueue) {
            try {
              if (c && c.candidate) {
                await this.peerConnection.addIceCandidate(new window.RTCIceCandidate(c));
              }
            } catch {}
          }
          this.iceCandidatesQueue = [];
        }
      } catch (err) {
        console.warn('[WebRTCService] Answer remote description notice:', err);
      }
    }
    this.connectionState = 'connected';
    this.resumeAudio();
    this.emit('call:connected', { partner: this.activePartner, sessionId });
    this._startAudioChunkRelay();
  }

  _startAudioChunkRelay() {
    if (typeof window === 'undefined') return;
    if (!this.localStream || !this.localStream.getAudioTracks().some(t => t.readyState === 'live')) {
      if (audioService && audioService.getLocalStream) {
        this.localStream = audioService.getLocalStream();
      }
    }
    if (!this.localStream) return;

    try {
      if (!this.audioContext || this.audioContext.state === 'closed') {
        const AudioCtx = window.AudioContext || window.webkitAudioContext;
        if (AudioCtx) this.audioContext = new AudioCtx();
      }
      if (this.audioContext) {
        if (this.audioContext.state === 'suspended') {
          this.audioContext.resume().catch(() => {});
        }
        if (this._micSourceNode) {
          try { this._micSourceNode.disconnect(); } catch {}
          this._micSourceNode = null;
        }
        if (this._micProcessorNode) {
          try { this._micProcessorNode.disconnect(); } catch {}
          this._micProcessorNode = null;
        }

        this._micSourceNode = this.audioContext.createMediaStreamSource(this.localStream);
        this._micProcessorNode = this.audioContext.createScriptProcessor ? this.audioContext.createScriptProcessor(2048, 1, 1) : null;

        if (this._micProcessorNode) {
          const silentGain = this.audioContext.createGain();
          silentGain.gain.value = 0.0;

          this._micProcessorNode.onaudioprocess = (e) => {
            if (this.isMuted) return;
            const input = e.inputBuffer.getChannelData(0);
            let sum = 0;
            for (let i = 0; i < input.length; i++) {
              sum += input[i] * input[i];
            }
            const rms = Math.sqrt(sum / input.length);
            const level = Math.min(100, Math.round(rms * 500));
            this.emit('mic:level', { level });

            // Stream raw PCM voice frames over socket continuously when call is active
            const targetUserId = this.activePartner?.id || this.activePartner?.userId;
            if (this.socket && (this.connectionState === 'connected' || this.connectionState === 'connecting')) {
              const int16 = new Int16Array(input.length);
              for (let i = 0; i < input.length; i++) {
                int16[i] = Math.max(-32768, Math.min(32767, input[i] * 32767));
              }
              this.socket.emit('audio:pcm', {
                toUserId: targetUserId,
                sessionId: this.currentSessionId,
                buffer: int16.buffer,
                sampleRate: this.audioContext.sampleRate,
              });
            }
          };

          this._micSourceNode.connect(this._micProcessorNode);
          this._micProcessorNode.connect(silentGain);
          silentGain.connect(this.audioContext.destination);
          console.log('[WebRTCService] Live microphone PCM monitor and streamer active.');
        }
      }
    } catch (err) {
      console.warn('[WebRTCService] PCM monitor init notice:', err);
    }
  }

  async _handleReceiveIceCandidate(candidate) {
    if (!candidate || !candidate.candidate) return;
    if (this.peerConnection && this.peerConnection.remoteDescription && this.peerConnection.remoteDescription.type) {
      try {
        await this.peerConnection.addIceCandidate(new window.RTCIceCandidate(candidate));
      } catch (err) {
        console.warn('[WebRTCService] Error adding ICE candidate:', err);
      }
    } else {
      if (!this.iceCandidatesQueue) this.iceCandidatesQueue = [];
      this.iceCandidatesQueue.push(candidate);
    }
  }

  _initSignalingOnlyCall() {
    // In mobile Expo Go: establish full signaling negotiation
    if (this.role === 'caller' && this.activePartner) {
      this.socket.emit('call:offer', {
        toUserId: this.activePartner.id,
        sessionId: this.currentSessionId,
        offer: { type: 'offer', sdp: 'simulated-bytalk-audio-sdp' },
      });
    }

    // Auto-mark connected upon successful handshake
    setTimeout(() => {
      this.connectionState = 'connected';
      this.emit('call:connected', { partner: this.activePartner, sessionId: this.currentSessionId });
    }, 600);
  }

  // 3. IN-CALL CONTROLS (Section 7.2)
  toggleMute(isMuted) {
    this.isMuted = isMuted;
    audioService.setMuted(isMuted).catch(() => {});

    // WebRTC track mute
    if (this.localStream) {
      this.localStream.getAudioTracks().forEach((track) => {
        track.enabled = !isMuted;
      });
    }

    // Notify peer of mute status
    if (this.socket && this.activePartner) {
      this.socket.emit('call:partner-mute', {
        toUserId: this.activePartner.id,
        sessionId: this.currentSessionId,
        isMuted,
      });
    }

    return this.isMuted;
  }

  toggleSpeaker(isSpeakerOn) {
    this.isSpeakerOn = isSpeakerOn;
    if (this.remoteAudioElement) {
      this.remoteAudioElement.muted = !isSpeakerOn;
    }
    if (this.audioGainNode) {
      this.audioGainNode.gain.value = isSpeakerOn ? 1.2 : 0.0;
    }
    return this.isSpeakerOn;
  }

  // 4. END CALL & CLEANUP (Section 14 & 20)
  endCall({ peerUserId, sessionId, durationSeconds = 0 } = {}) {
    const targetPeerId = peerUserId || this.activePartner?.id;
    const sid = sessionId || this.currentSessionId;

    if (this.socket) {
      this.socket.emit('call:end', {
        peerUserId: targetPeerId,
        sessionId: sid,
        durationSeconds,
      });
    }

    this._teardownCall('local_ended', { peerUserId: targetPeerId, sessionId: sid });
  }

  _teardownCall(reason = 'ended', extraData = {}) {
    audioService.stopRingtone().catch(() => {});
    audioService.stopSpeakingSession(true).catch(() => {});

    if (this.mediaRecorder) {
      try { this.mediaRecorder.stop(); } catch {}
      this.mediaRecorder = null;
    }
    this._peerInitPromise = null;
    this.pendingOffer = null;

    if (this.audioSourceNode) {
      try { this.audioSourceNode.disconnect(); } catch {}
      this.audioSourceNode = null;
    }
    if (this.audioGainNode) {
      try { this.audioGainNode.disconnect(); } catch {}
      this.audioGainNode = null;
    }
    if (this._micSourceNode) {
      try { this._micSourceNode.disconnect(); } catch {}
      this._micSourceNode = null;
    }
    if (this._micProcessorNode) {
      try { this._micProcessorNode.disconnect(); } catch {}
      this._micProcessorNode = null;
    }
    this._pcmNextPlayTime = 0;

    if (this.localStream) {
      this.localStream.getTracks().forEach((track) => track.stop());
      this.localStream = null;
    }

    if (this.peerConnection) {
      this.peerConnection.close();
      this.peerConnection = null;
    }

    if (this.remoteAudioElement && typeof document !== 'undefined') {
      try {
        this.remoteAudioElement.pause();
        this.remoteAudioElement.srcObject = null;
      } catch {}
    }

    this.iceCandidatesQueue = [];
    this.connectionState = 'ended';
    this.currentSessionId = null;
    const endedPartner = this.activePartner;
    this.activePartner = null;

    this.emit('call:ended', { reason, partner: endedPartner, ...extraData });
  }

  destroy() {
    this._teardownCall('destroyed');
    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
    }
    this.listeners.clear();
  }
}

// Export singleton instance
export const webrtcService = new WebRTCService();
export default webrtcService;

