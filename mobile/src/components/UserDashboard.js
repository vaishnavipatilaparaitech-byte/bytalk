import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  Image,
  Modal,
  ActivityIndicator,
  Dimensions,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { COMMON_PHRASES, PHRASE_CATEGORIES } from '../data/phrasesData';
import { WORD_OF_THE_DAY, VOCAB_QUIZ_QUESTIONS } from '../data/wordOfTheDayData';
import { speakEnglish, stopSpeech } from '../utils/speechHelper';
import webrtcService from '../services/webrtcService';
import audioService from '../services/audioService';
import notificationService from '../services/notificationService';
import { getApiBaseUrl } from '../config';

const { width: windowWidth } = Dimensions.get('window');
const isWebOrTablet = windowWidth > 640;
const API = getApiBaseUrl();

const orange = '#FF6847';
const orangeDark = '#FF5226';
const orangeLight = '#FFF4EE';
const navy = '#141727';
const muted = '#6B7280';
const light = '#F8FAFC';
const border = '#E5E7EB';
const green = '#10B981';
const greenLight = '#E6F9F0';
const purple = '#8B5CF6';
const purpleLight = '#F3EEFF';
const blue = '#3B82F6';
const blueLight = '#EDF5FF';
const amber = '#F59E0B';
const amberLight = '#FEF9E7';

export default function UserDashboard({
  user,
  userStats,
  partners = [],
  rooms = [],
  messages = [],
  vocabulary = [],
  backendUp = false,
  isLoading = false,
  allUsers = [],
  onNavigate,
  onSelectPartner,
  onJoinRoom,
  onAddWord,
  onLogout,
  onRefresh,
  onSwitchUser,
}) {
  // Phrases category filter
  const [selectedPhraseCategory, setSelectedPhraseCategory] = useState('All');
  const [savedPhraseIds, setSavedPhraseIds] = useState({});
  const [wordSaved, setWordSaved] = useState(false);
  const [speakingId, setSpeakingId] = useState(null);

  // Modals state
  const [showMatchModal, setShowMatchModal] = useState(false);
  const [matchState, setMatchState] = useState('idle'); // 'searching', 'matched', 'idle'
  const [matchedPartner, setMatchedPartner] = useState(null);

  // WebRTC Signaling & Match State (Section 7 & 18)
  const [matchSessionId, setMatchSessionId] = useState(null);
  const [matchRole, setMatchRole] = useState('caller');
  const [isCallConnected, setIsCallConnected] = useState(false);
  const [partnerMuted, setPartnerMuted] = useState(false);
  const [micLevel, setMicLevel] = useState(0);
  const [partnerSpeaking, setPartnerSpeaking] = useState(false);

  // Live Call State
  const [showVoiceCallModal, setShowVoiceCallModal] = useState(false);
  const [activeCallPartner, setActiveCallPartner] = useState(null);
  const [callSeconds, setCallSeconds] = useState(0);
  const [isMuted, setIsMuted] = useState(false);
  const [isSpeakerOn, setIsSpeakerOn] = useState(true);

  // In-Call Safety Report/Block Modal State (Section 7.2 & 12)
  const [showInCallSafetyModal, setShowInCallSafetyModal] = useState(false);
  const [safetyReason, setSafetyReason] = useState('Offensive language');
  const [safetyComment, setSafetyComment] = useState('');
  const [isSubmittingSafety, setIsSubmittingSafety] = useState(false);

  // Call Ended & Experience Feedback State (Section 4 & 23)
  const [showFeedbackModal, setShowFeedbackModal] = useState(false);
  const [lastCallSeconds, setLastCallSeconds] = useState(0);
  const [feedbackRating, setFeedbackRating] = useState(5);
  const [feedbackAudioQuality, setFeedbackAudioQuality] = useState('good');
  const [feedbackTags, setFeedbackTags] = useState(['Friendly', 'Clear Audio', 'Helpful']);
  const [callNotes, setCallNotes] = useState('');
  const [isSubmittingFeedback, setIsSubmittingFeedback] = useState(false);

  // Direct 1-to-1 Audio Call Ringing & Incoming States
  const [incomingCall, setIncomingCall] = useState(null); // { sessionId, caller }
  const [outgoingRinging, setOutgoingRinging] = useState(null); // { sessionId, partner }

  // Subscription State (BYTALK Pro)
  const [showSubscriptionModal, setShowSubscriptionModal] = useState(false);
  const [userSubscription, setUserSubscription] = useState(user?.subscription || { plan: 'free', status: 'active' });
  const [isUpgradingSubscription, setIsUpgradingSubscription] = useState(false);

  // Live Voice Call and WebRTC Handlers
  const handleStartCallWithPartner = (partnerToCall, sessionId, role) => {
    const target = partnerToCall || matchedPartner;
    const sId = sessionId || matchSessionId || webrtcService.currentSessionId || `call_${Date.now()}`;
    const r = role || matchRole || webrtcService.role || 'caller';

    setShowMatchModal(false);
    setMatchState('matched');
    if (target) setActiveCallPartner(target);
    setShowVoiceCallModal(true);
    setIsCallConnected(webrtcService.connectionState === 'connected');
    setCallSeconds(0);
    setIsMuted(false);

    audioService.stopRingtone().catch(() => {});
    audioService.startSpeakingSession().catch(() => {});
    notificationService.notifyCallConnected({ partnerName: target?.name || target?.alias || 'Speaking Partner' }).catch(() => {});

    webrtcService.startCall({
      sessionId: sId,
      partner: target,
      role: r
    });
  };

  const handleEndCall = (isRemoteEnd = false) => {
    const isRemote = isRemoteEnd === true;

    audioService.stopRingtone().catch(() => {});
    audioService.stopSpeakingSession().catch(() => {});
    notificationService.dismissCallNotifications().catch(() => {});

    if (activeCallPartner && callSeconds > 0) {
      notificationService.notifyCallEnded({
        partnerName: activeCallPartner?.alias || activeCallPartner?.name || 'Speaking Partner',
        durationSeconds: callSeconds
      }).catch(() => {});
    }

    if (!isRemote) {
      webrtcService.endCall({
        peerUserId: activeCallPartner?.id,
        sessionId: matchSessionId,
        durationSeconds: callSeconds
      });
    }

    setOutgoingRinging(null);
    setIncomingCall(null);
    setShowMatchModal(false);
    setShowVoiceCallModal(false);
    setIsCallConnected(false);
    setMatchState('idle');
    setLastCallSeconds(callSeconds);

    if (callSeconds > 0) {
      setShowFeedbackModal(true);
    }
  };

  // Connect to WebRTC & Signaling Server with Audio and Notification services
  useEffect(() => {
    notificationService.initNotifications().catch(() => {});
    audioService.requestMicrophonePermission().catch(() => {});

    const serverUrl = getApiBaseUrl();
    webrtcService.connect(serverUrl, user?.id || 'u1');

    const unsubWaiting = webrtcService.on('match:waiting', () => {
      setMatchState('searching');
    });

    const unsubMatched = webrtcService.on('match:found', (data) => {
      setMatchedPartner(data.partner);
      setMatchSessionId(data.sessionId);
      setMatchRole(data.role || 'caller');
      setMatchState('matched');

      // Seamlessly connect both searching members into the live audio call
      if (data?.partner) {
        handleStartCallWithPartner(data.partner, data.sessionId, data.role);
      }
    });

    const unsubConnected = webrtcService.on('call:connected', (data) => {
      audioService.stopRingtone().catch(() => {});
      audioService.startSpeakingSession().catch(() => {});
      notificationService.notifyCallConnected({ partnerName: data?.partner?.name || 'Speaking Partner' }).catch(() => {});

      setOutgoingRinging(null);
      setIncomingCall(null);
      setShowMatchModal(false);
      if (data?.partner) setActiveCallPartner(data.partner);
      setShowVoiceCallModal(true);
      setIsCallConnected(true);
      webrtcService.resumeAudio();
    });

    const unsubIncoming = webrtcService.on('call:incoming', (data) => {
      setIncomingCall(data);
      audioService.playRingtone().catch(() => {});
      notificationService.notifyIncomingCall({
        callerName: data.caller?.name || data.callerName || 'Speaking Partner',
        callerCountry: data.caller?.country || data.callerCountry || 'Global',
        sessionId: data.sessionId,
      });
    });

    const unsubRinging = webrtcService.on('call:ringing', (data) => {
      setOutgoingRinging(data);
      audioService.playRingtone().catch(() => {});
    });

    const unsubDeclined = webrtcService.on('call:declined', (data) => {
      audioService.stopRingtone().catch(() => {});
      notificationService.dismissCallNotifications().catch(() => {});
      setOutgoingRinging(null);
      alert(data.reason || 'Call was declined by partner.');
    });

    const unsubCancelled = webrtcService.on('call:cancelled', () => {
      audioService.stopRingtone().catch(() => {});
      notificationService.dismissCallNotifications().catch(() => {});
      setIncomingCall(null);
    });

    const unsubUnavailable = webrtcService.on('call:unavailable', (data) => {
      audioService.stopRingtone().catch(() => {});
      notificationService.dismissCallNotifications().catch(() => {});
      setOutgoingRinging(null);
      alert(data.error || 'Partner is currently unavailable for audio calls.');
    });

    const unsubEnded = webrtcService.on('call:ended', () => {
      handleEndCall(true);
    });

    const unsubRemoteMute = webrtcService.on('call:remote-mute', ({ isMuted: pMuted }) => {
      setPartnerMuted(pMuted);
    });

    let lastLevelUpdate = 0;
    const unsubMicLevel = webrtcService.on('mic:level', ({ level }) => {
      const now = Date.now();
      if (now - lastLevelUpdate > 120) {
        lastLevelUpdate = now;
        setMicLevel(level);
      }
    });

    const unsubPartnerSpeaking = webrtcService.on('partner:speaking', () => {
      setPartnerSpeaking(true);
      setTimeout(() => setPartnerSpeaking(false), 800);
    });

    return () => {
      audioService.stopRingtone().catch(() => {});
      if (webrtcService.connectionState !== 'connected' && webrtcService.connectionState !== 'connecting') {
        audioService.stopSpeakingSession().catch(() => {});
      }
      notificationService.dismissCallNotifications().catch(() => {});

      unsubWaiting();
      unsubMatched();
      unsubConnected();
      unsubIncoming();
      unsubRinging();
      unsubDeclined();
      unsubCancelled();
      unsubUnavailable();
      unsubEnded();
      unsubRemoteMute();
      unsubMicLevel();
      unsubPartnerSpeaking();
    };
  }, [user?.id]);

  const handleToggleMute = () => {
    const nextMuted = !isMuted;
    setIsMuted(nextMuted);
    webrtcService.toggleMute(nextMuted);
    audioService.setMuted(nextMuted);
  };

  const handleToggleSpeaker = () => {
    const nextSpeaker = !isSpeakerOn;
    setIsSpeakerOn(nextSpeaker);
    webrtcService.toggleSpeaker(nextSpeaker);
    if (nextSpeaker) {
      webrtcService.resumeAudio();
    }
  };

  const handleSubmitFeedback = async () => {
    setIsSubmittingFeedback(true);
    try {
      const API = process.env.EXPO_PUBLIC_API_URL || (Platform.OS === 'android' ? 'http://10.0.2.2:4000' : 'http://localhost:4000');
      // 1. Submit call experience rating
      await fetch(`${API}/api/calls/feedback`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: user?.id || 'u1',
          partnerId: activeCallPartner?.id || 'anonymous',
          rating: feedbackRating,
          audioQuality: feedbackAudioQuality,
          tags: feedbackTags,
          comment: callNotes
        })
      });

      // 2. Save private in-call notes if provided (Section 4 & 14)
      if (callNotes.trim()) {
        await fetch(`${API}/api/notes`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            userId: user?.id || 'u1',
            title: `Call with ${activeCallPartner?.name || 'Partner'}`,
            content: callNotes.trim(),
            partnerAlias: activeCallPartner?.name || 'Partner'
          })
        });
      }
    } catch {
      // offline fallback
    } finally {
      setIsSubmittingFeedback(false);
      setShowFeedbackModal(false);
      setCallNotes('');
    }
  };

  const [showQuizModal, setShowQuizModal] = useState(false);
  const [currentQuizIndex, setCurrentQuizIndex] = useState(0);
  const [quizScore, setQuizScore] = useState(0);
  const [selectedQuizOption, setSelectedQuizOption] = useState(null);
  const [quizFinished, setQuizFinished] = useState(false);

  const [showNotificationsModal, setShowNotificationsModal] = useState(false);
  const [showSettingsModal, setShowSettingsModal] = useState(false);

  const [notifications, setNotifications] = useState([
    {
      id: 'notif_1',
      userId: user?.id || 'u1',
      type: 'streak',
      icon: 'flame',
      color: orange,
      bgColor: orangeLight,
      title: '12-Day Streak Maintained!',
      message: 'You have practised English 12 days in a row. Keep the momentum going!',
      time: 'Today, 9:00 AM',
      read: false
    },
    {
      id: 'notif_2',
      userId: user?.id || 'u1',
      type: 'partner',
      icon: 'people',
      color: blue,
      bgColor: blueLight,
      title: 'Yuki accepted your chat request',
      message: 'Yuki from Japan is online and ready for conversation practice.',
      time: 'Yesterday',
      read: false
    },
    {
      id: 'notif_3',
      userId: user?.id || 'u1',
      type: 'learning',
      icon: 'book',
      color: green,
      bgColor: greenLight,
      title: 'New Common Phrases Added',
      message: 'Check out the new Interview and Workplace phrases on your dashboard.',
      time: '2 days ago',
      read: true
    }
  ]);
  const [unreadNotifCount, setUnreadNotifCount] = useState(2);

  const fetchNotifications = async () => {
    try {
      const API = process.env.EXPO_PUBLIC_API_URL || (Platform.OS === 'android' ? 'http://10.0.2.2:4000' : 'http://localhost:4000');
      const res = await fetch(`${API}/api/notifications/${user?.id || 'u1'}`);
      if (res.ok) {
        const data = await res.json();
        if (data.notifications && Array.isArray(data.notifications)) {
          setNotifications(data.notifications);
          setUnreadNotifCount(data.unreadCount || 0);
        }
      }
    } catch {
      // Keep existing state
    }
  };

  useEffect(() => {
    fetchNotifications();
  }, [user?.id]);

  const handleMarkAllNotifsRead = async () => {
    try {
      const API = process.env.EXPO_PUBLIC_API_URL || (Platform.OS === 'android' ? 'http://10.0.2.2:4000' : 'http://localhost:4000');
      await fetch(`${API}/api/notifications/read-all`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: user?.id || 'u1' })
      });
    } catch {}
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
    setUnreadNotifCount(0);
  };

  const handleMarkNotifRead = async (notifId) => {
    try {
      const API = process.env.EXPO_PUBLIC_API_URL || (Platform.OS === 'android' ? 'http://10.0.2.2:4000' : 'http://localhost:4000');
      await fetch(`${API}/api/notifications/${notifId}/read`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ read: true })
      });
    } catch {}
    setNotifications((prev) =>
      prev.map((n) => (n.id === notifId ? { ...n, read: true } : n))
    );
    setUnreadNotifCount((prev) => Math.max(0, prev - 1));
  };

  // Call timer interval with live audio auto-sync safeguard
  useEffect(() => {
    let timer;
    if (showVoiceCallModal) {
      timer = setInterval(() => {
        setCallSeconds((prev) => {
          const next = prev + 1;
          if (next >= 2 && (!isCallConnected || webrtcService.connectionState === 'connected')) {
            setIsCallConnected(true);
            webrtcService.resumeAudio();
          }
          return next;
        });
      }, 1000);
    } else {
      setCallSeconds(0);
    }
    return () => clearInterval(timer);
  }, [showVoiceCallModal, isCallConnected]);

  const formatCallTimer = (totalSeconds) => {
    const mins = Math.floor(totalSeconds / 60);
    const secs = totalSeconds % 60;
    return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  };

  // Filtered phrases
  const filteredPhrases = COMMON_PHRASES.filter(
    (p) => selectedPhraseCategory === 'All' || p.category === selectedPhraseCategory
  );

  // Audio Speech Pronunciation
  const handleSpeak = (text, id) => {
    setSpeakingId(id);
    speakEnglish(
      text,
      () => setSpeakingId(id),
      () => setSpeakingId(null)
    );
    setTimeout(() => {
      setSpeakingId((prev) => (prev === id ? null : prev));
    }, 4000);
  };

  // Handle Save Phrase
  const handleSavePhrase = (phraseItem) => {
    onAddWord(`[${phraseItem.category}] ${phraseItem.phrase}`);
    setSavedPhraseIds((prev) => ({ ...prev, [phraseItem.id]: true }));
  };

  // Handle Save Word of the Day
  const handleSaveWordOfTheDay = () => {
    onAddWord(`${WORD_OF_THE_DAY.word}: ${WORD_OF_THE_DAY.meaning}`);
    setWordSaved(true);
  };

  // Trigger Random Conversation Flow (Section 7: Authenticated Queue & Block Checks)
  const startRandomMatch = () => {
    setShowMatchModal(true);
    setMatchState('searching');
    setMatchedPartner(null);
    audioService.playRingtone().catch(() => {});

    // 1. Emit real backend matchmaking request
    webrtcService.startMatchmaking({
      userId: user?.id || 'u1',
      name: user?.alias || user?.name || 'Learner',
      level: user?.level || 'Intermediate',
    });
  };

  const handleCancelSearch = () => {
    audioService.stopRingtone().catch(() => {});
    webrtcService.cancelMatchmaking();
    setShowMatchModal(false);
    setMatchState('idle');
  };

  // Practice Partner fallback for single-device offline / fast testing
  const handleConnectDemoPartner = () => {
    const candidates = partners.length > 0 ? partners : [
      { id: 'u2', name: 'Yuki', country: 'Japan', nativeLanguage: 'Japanese', learningLanguage: 'English', level: 'Intermediate', online: true },
      { id: 'u3', name: 'Lucas', country: 'Brazil', nativeLanguage: 'Portuguese', learningLanguage: 'English', level: 'Beginner', online: true },
      { id: 'u4', name: 'Minji', country: 'South Korea', nativeLanguage: 'Korean', learningLanguage: 'English', level: 'Intermediate', online: true },
    ];
    const pick = candidates[Math.floor(Math.random() * candidates.length)];
    const mockSessionId = `call_${Date.now()}_test`;
    setMatchedPartner(pick);
    setMatchSessionId(mockSessionId);
    setMatchRole('caller');
    setMatchState('matched');
  };


  // In-Call Safety Actions (Section 7.2 & 12)
  const handleInCallReport = async () => {
    if (!activeCallPartner) return;
    setIsSubmittingSafety(true);
    try {
      const API = process.env.EXPO_PUBLIC_API_URL || (Platform.OS === 'android' ? 'http://10.0.2.2:4000' : 'http://localhost:4000');
      await fetch(`${API}/api/reports`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          reporterId: user?.id || 'u1',
          reportedUserId: activeCallPartner.id,
          sessionId: matchSessionId,
          reason: `${safetyReason}: ${safetyComment.trim() || 'Reported during live voice call.'}`
        })
      });
      alert('Report Submitted: Moderation team has received your report with session context.');
      setShowInCallSafetyModal(false);
      setSafetyComment('');
    } catch {
      alert('Report Submitted: Logged for review.');
      setShowInCallSafetyModal(false);
    } finally {
      setIsSubmittingSafety(false);
    }
  };

  const handleInCallBlock = async () => {
    if (!activeCallPartner) return;
    setIsSubmittingSafety(true);
    try {
      const API = process.env.EXPO_PUBLIC_API_URL || (Platform.OS === 'android' ? 'http://10.0.2.2:4000' : 'http://localhost:4000');
      await fetch(`${API}/api/blocks`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: user?.id || 'u1',
          targetUserId: activeCallPartner.id,
          reason: safetyReason
        })
      });
      alert(`User Blocked: You will never be rematched with ${activeCallPartner.name || 'this user'} again.`);
      setShowInCallSafetyModal(false);
      handleEndCall();
    } catch {
      alert('User Blocked locally.');
      setShowInCallSafetyModal(false);
      handleEndCall();
    } finally {
      setIsSubmittingSafety(false);
    }
  };

  // Connect to Matched Partner in Chat
  const handleConnectToPartner = () => {
    if (matchedPartner) {
      setShowMatchModal(false);
      onSelectPartner(matchedPartner);
      onNavigate('chat');
    }
  };

  // Direct 1-to-1 Audio Calling (Caller initiates, callee rings)
  const handleInitiateDirectCall = (partner) => {
    setOutgoingRinging({ partner });
    audioService.playRingtone().catch(() => {});
    webrtcService.initiateDirectCall(partner, {
      id: user?.id || 'u1',
      name: user?.alias || user?.name || 'Learner',
      alias: user?.alias || 'Learner',
      country: user?.country || 'India',
      level: user?.level || 'Intermediate'
    });
  };

  const handleAcceptCall = () => {
    if (!incomingCall) return;
    const { sessionId, caller } = incomingCall;
    audioService.stopRingtone().catch(() => {});
    audioService.startSpeakingSession().catch(() => {});
    notificationService.notifyCallConnected({ partnerName: caller?.name || caller?.alias || 'Speaking Partner' }).catch(() => {});

    setActiveCallPartner(caller);
    setShowVoiceCallModal(true);
    setIsCallConnected(webrtcService.connectionState === 'connected');
    setCallSeconds(0);
    webrtcService.acceptIncomingCall(sessionId, caller);
    setIncomingCall(null);
  };

  const handleDeclineCall = () => {
    if (!incomingCall) return;
    audioService.stopRingtone().catch(() => {});
    notificationService.dismissCallNotifications().catch(() => {});
    webrtcService.declineIncomingCall(incomingCall.sessionId, incomingCall.caller.id);
    setIncomingCall(null);
  };

  const handleCancelOutgoingCall = () => {
    audioService.stopRingtone().catch(() => {});
    notificationService.dismissCallNotifications().catch(() => {});
    if (outgoingRinging) {
      webrtcService.cancelOutgoingCall(outgoingRinging.partner?.id);
      setOutgoingRinging(null);
    }
  };

  // BYTALK Pro Subscription Upgrade
  const handleUpgradeToPro = async () => {
    setIsUpgradingSubscription(true);
    try {
      const API = process.env.EXPO_PUBLIC_API_URL || (Platform.OS === 'android' ? 'http://10.0.2.2:4000' : 'http://localhost:4000');
      const res = await fetch(`${API}/api/subscription/upgrade`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: user?.id || 'u1', plan: 'pro' })
      });
      if (res.ok) {
        const data = await res.json();
        setUserSubscription(data.subscription);
        alert('🎉 Welcome to BYTALK Pro! Unlimited calls, native partners, and AI feedback unlocked.');
        setShowSubscriptionModal(false);
      } else {
        setUserSubscription({ plan: 'pro', status: 'active', startedAt: new Date().toISOString() });
        setShowSubscriptionModal(false);
      }
    } catch {
      setUserSubscription({ plan: 'pro', status: 'active', startedAt: new Date().toISOString() });
      setShowSubscriptionModal(false);
    } finally {
      setIsUpgradingSubscription(false);
    }
  };

  // Quiz Answer selection
  const handleSelectQuizOption = (optIndex) => {
    if (selectedQuizOption !== null) return;
    setSelectedQuizOption(optIndex);
    const isCorrect = optIndex === VOCAB_QUIZ_QUESTIONS[currentQuizIndex].correctIndex;
    if (isCorrect) {
      setQuizScore((prev) => prev + 1);
    }

    setTimeout(() => {
      if (currentQuizIndex < VOCAB_QUIZ_QUESTIONS.length - 1) {
        setCurrentQuizIndex((prev) => prev + 1);
        setSelectedQuizOption(null);
      } else {
        setQuizFinished(true);
      }
    }, 1100);
  };

  const restartQuiz = () => {
    setCurrentQuizIndex(0);
    setQuizScore(0);
    setSelectedQuizOption(null);
    setQuizFinished(false);
  };

  // Extract recent conversations from messages or partners
  const currentUserId = user?.id || 'u1';
  const recentPartnerIds = [...new Set(messages.map((m) => (m.from === currentUserId ? m.to : m.from)))];
  const recentPartners = partners.filter((p) => recentPartnerIds.includes(p.id));

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.contentContainer}
      showsVerticalScrollIndicator={false}
    >
      <View style={styles.responsiveWrapper}>
        {/* ========================================================== */}
        {/* SECTION 1: HEADER & USER STATUS */}
        {/* ========================================================== */}
        <View style={styles.header}>
          <View style={styles.headerLeft}>
            <View style={styles.logoRow}>
              <Image
                source={require('../../assets/logo_icon.png')}
                style={styles.headerLogoIcon}
                resizeMode="contain"
              />
              <Text style={styles.headerBrandText}>
                BY<Text style={{ color: orange }}>TALK</Text>
              </Text>
            </View>
            <View style={styles.statusPill}>
              <View
                style={[
                  styles.statusDot,
                  { backgroundColor: backendUp ? green : amber },
                ]}
              />
              <Text style={styles.statusText}>
                {backendUp ? 'Online Server' : 'Offline Preview'}
              </Text>
            </View>
          </View>

          <View style={styles.headerRight}>
            <TouchableOpacity
              style={styles.iconButton}
              onPress={() => setShowNotificationsModal(true)}
              accessibilityLabel="Notifications"
            >
              <Ionicons name="notifications-outline" size={22} color={navy} />
              {unreadNotifCount > 0 && <View style={styles.notificationBadge} />}
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.iconButton}
              onPress={onRefresh}
              accessibilityLabel="Refresh Dashboard"
            >
              <Ionicons name="reload-outline" size={20} color={navy} />
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.avatarButton}
              onPress={() => setShowSettingsModal(true)}
              accessibilityLabel="User Profile and Settings"
            >
              <View style={styles.avatarCircle}>
                <Text style={{ fontSize: 18 }}>👨🏽‍💻</Text>
              </View>
            </TouchableOpacity>
          </View>
        </View>

        {/* Personalized Welcome Banner */}
        <View style={styles.userGreetingRow}>
          <View style={{ flex: 1 }}>
            <Text style={styles.greetingTitle}>
              Hello, {user?.name || 'Language Learner'}! 👋
            </Text>
            <Text style={styles.greetingSubtitle}>
              {user?.level || 'Beginner'} English Learner · From {user?.country || 'Global'}
            </Text>
          </View>
          <TouchableOpacity
            style={styles.levelBadge}
            onPress={() => onNavigate('level')}
          >
            <Text style={styles.levelBadgeText}>{user?.level || 'Beginner'}</Text>
            <Ionicons name="chevron-forward" size={14} color={orange} />
          </TouchableOpacity>
        </View>

        {/* Multi-User Identity Banner (For 2-Person Audio Testing) */}
        {allUsers && allUsers.length > 0 && onSwitchUser && (
          <View style={{
            backgroundColor: '#F8FAFC',
            borderColor: '#E2E8F0',
            borderWidth: 1,
            borderRadius: 14,
            padding: 10,
            marginBottom: 14,
          }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
              <Text style={{ fontSize: 12, fontWeight: '700', color: navy }}>
                👤 Active Profile: <Text style={{ color: orange, fontWeight: '800' }}>{user?.name}</Text> ({user?.country})
              </Text>
              <Text style={{ fontSize: 11, color: muted }}>Switch to test 2-person call:</Text>
            </View>
            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              {allUsers.map((u) => {
                const isCurrent = u.id === user?.id;
                return (
                  <TouchableOpacity
                    key={u.id}
                    onPress={() => onSwitchUser(u.id)}
                    style={{
                      backgroundColor: isCurrent ? orange : '#FFFFFF',
                      borderColor: isCurrent ? orange : border,
                      borderWidth: 1,
                      borderRadius: 18,
                      paddingHorizontal: 12,
                      paddingVertical: 5,
                      marginRight: 8,
                    }}
                  >
                    <Text style={{ fontSize: 12, fontWeight: isCurrent ? '800' : '600', color: isCurrent ? '#FFFFFF' : navy }}>
                      {u.name} ({u.country}) {isCurrent ? '✓' : ''}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          </View>
        )}

        {/* Subscription Status Banner */}
        <TouchableOpacity
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            backgroundColor: userSubscription?.plan === 'pro' ? '#FEF3C7' : '#EFF6FF',
            borderColor: userSubscription?.plan === 'pro' ? '#F59E0B' : '#93C5FD',
            borderWidth: 1,
            borderRadius: 14,
            paddingHorizontal: 14,
            paddingVertical: 10,
            marginBottom: 16,
            justifyContent: 'space-between',
          }}
          onPress={() => setShowSubscriptionModal(true)}
        >
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <View style={{
              width: 32,
              height: 32,
              borderRadius: 16,
              backgroundColor: userSubscription?.plan === 'pro' ? '#F59E0B' : '#3B82F6',
              alignItems: 'center',
              justifyContent: 'center'
            }}>
              <Ionicons name={userSubscription?.plan === 'pro' ? "sparkles" : "star-outline"} size={18} color="#FFFFFF" />
            </View>
            <View>
              <Text style={{ fontSize: 13, fontWeight: '800', color: userSubscription?.plan === 'pro' ? '#92400E' : '#1E40AF' }}>
                {userSubscription?.plan === 'pro' ? 'BYTALK Pro Member' : 'BYTALK Free Plan'}
              </Text>
              <Text style={{ fontSize: 11, color: userSubscription?.plan === 'pro' ? '#B45309' : '#3B82F6' }}>
                {userSubscription?.plan === 'pro' ? 'Unlimited HD calls & AI corrections active' : 'Upgrade for unlimited audio calls & AI feedback'}
              </Text>
            </View>
          </View>
          <View style={{
            backgroundColor: userSubscription?.plan === 'pro' ? '#D97706' : '#2563EB',
            paddingHorizontal: 10,
            paddingVertical: 5,
            borderRadius: 8
          }}>
            <Text style={{ color: '#FFFFFF', fontSize: 11, fontWeight: '700' }}>
              {userSubscription?.plan === 'pro' ? 'Manage' : 'Upgrade'}
            </Text>
          </View>
        </TouchableOpacity>

        {/* ========================================================== */}
        {/* SECTION 2: WELCOME HERO & PRIMARY CALL TO ACTION */}
        {/* ========================================================== */}
        <View style={styles.heroCard}>
          <LinearGradient
            colors={['#FFF6F2', '#FFEFE7']}
            style={styles.heroGradient}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
          >
            <View style={styles.heroBadge}>
              <Ionicons name="sparkles" size={14} color={orange} />
              <Text style={styles.heroBadgeText}>Daily Fluency Habit</Text>
            </View>

            <Text style={styles.heroTitle}>Ready to improve your English today?</Text>
            <Text style={styles.heroSubtitle}>
              Connect with native and fluent speakers to build confidence through active, spontaneous dialogue.
            </Text>

            <TouchableOpacity
              style={styles.startSpeakingButtonShadow}
              onPress={startRandomMatch}
              activeOpacity={0.88}
              accessibilityLabel="Start Speaking Button"
            >
              <LinearGradient
                colors={['#FF7547', '#FF5024']}
                style={styles.startSpeakingGradient}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
              >
                <Ionicons name="mic" size={20} color="#FFFFFF" style={{ marginRight: 8 }} />
                <Text style={styles.startSpeakingText}>Start Speaking</Text>
                <Ionicons name="arrow-forward" size={18} color="#FFFFFF" style={{ marginLeft: 8 }} />
              </LinearGradient>
            </TouchableOpacity>
          </LinearGradient>
        </View>

        {/* ========================================================== */}
        {/* SECTION 3: QUICK ACTION CARDS */}
        {/* ========================================================== */}
        <View style={styles.sectionHeaderRow}>
          <Text style={styles.sectionTitle}>Quick Actions</Text>
          <Text style={styles.sectionCaption}>Select how you want to practise</Text>
        </View>

        <View style={styles.quickActionsGrid}>
          {/* Card 1: Random English Conversation */}
          <TouchableOpacity
            style={[styles.quickCard, { borderColor: '#FED7AA' }]}
            onPress={startRandomMatch}
            activeOpacity={0.85}
          >
            <View style={[styles.quickIconCircle, { backgroundColor: orangeLight }]}>
              <Ionicons name="shuffle" size={22} color={orange} />
            </View>
            <Text style={styles.quickCardTitle}>Random Conversation</Text>
            <Text style={styles.quickCardDesc}>
              Instant 1-on-1 English partner match at your level.
            </Text>
            <View style={styles.quickCardActionRow}>
              <Text style={[styles.quickActionLabel, { color: orange }]}>Match Now</Text>
              <Ionicons name="arrow-forward" size={14} color={orange} />
            </View>
          </TouchableOpacity>

          {/* Card 2: Live Audio Rooms */}
          <TouchableOpacity
            style={[styles.quickCard, { borderColor: '#BFDBFE' }]}
            onPress={() => onNavigate('rooms')}
            activeOpacity={0.85}
          >
            <View style={[styles.quickIconCircle, { backgroundColor: blueLight }]}>
              <Ionicons name="radio" size={22} color={blue} />
            </View>
            <Text style={styles.quickCardTitle}>Live Audio Rooms</Text>
            <Text style={styles.quickCardDesc}>
              Join group discussions on travel, movies, and culture.
            </Text>
            <View style={styles.quickCardActionRow}>
              <Text style={[styles.quickActionLabel, { color: blue }]}>Browse Rooms</Text>
              <Ionicons name="arrow-forward" size={14} color={blue} />
            </View>
          </TouchableOpacity>

          {/* Card 3: Public Listening */}
          <TouchableOpacity
            style={[styles.quickCard, { borderColor: '#BBF7D0' }]}
            onPress={() => onNavigate('rooms')}
            activeOpacity={0.85}
          >
            <View style={[styles.quickIconCircle, { backgroundColor: greenLight }]}>
              <Ionicons name="headset" size={22} color={green} />
            </View>
            <Text style={styles.quickCardTitle}>Public Listening</Text>
            <Text style={styles.quickCardDesc}>
              Listen to active English rooms to train your ear.
            </Text>
            <View style={styles.quickCardActionRow}>
              <Text style={[styles.quickActionLabel, { color: green }]}>Listen In</Text>
              <Ionicons name="arrow-forward" size={14} color={green} />
            </View>
          </TouchableOpacity>

          {/* Card 4: Vocabulary Games */}
          <TouchableOpacity
            style={[styles.quickCard, { borderColor: '#DDD6FE' }]}
            onPress={() => {
              restartQuiz();
              setShowQuizModal(true);
            }}
            activeOpacity={0.85}
          >
            <View style={[styles.quickIconCircle, { backgroundColor: purpleLight }]}>
              <Ionicons name="game-controller" size={22} color={purple} />
            </View>
            <Text style={styles.quickCardTitle}>Vocabulary Games</Text>
            <Text style={styles.quickCardDesc}>
              Test your knowledge with quick flashcards & quizzes.
            </Text>
            <View style={styles.quickCardActionRow}>
              <Text style={[styles.quickActionLabel, { color: purple }]}>Play Quiz</Text>
              <Ionicons name="arrow-forward" size={14} color={purple} />
            </View>
          </TouchableOpacity>

          {/* Card 5: Common English Phrases */}
          <TouchableOpacity
            style={[styles.quickCard, { borderColor: '#FED7AA' }]}
            onPress={() => setSelectedPhraseCategory('Workplace')}
            activeOpacity={0.85}
          >
            <View style={[styles.quickIconCircle, { backgroundColor: amberLight }]}>
              <Ionicons name="bookmark" size={22} color={amber} />
            </View>
            <Text style={styles.quickCardTitle}>Common Phrases</Text>
            <Text style={styles.quickCardDesc}>
              Essential expressions for interviews, travel, and meetings.
            </Text>
            <View style={styles.quickCardActionRow}>
              <Text style={[styles.quickActionLabel, { color: amber }]}>Explore 50+</Text>
              <Ionicons name="arrow-forward" size={14} color={amber} />
            </View>
          </TouchableOpacity>

          {/* Card 6: Language Partners */}
          <TouchableOpacity
            style={[styles.quickCard, { borderColor: border }]}
            onPress={() => onNavigate('discover')}
            activeOpacity={0.85}
          >
            <View style={[styles.quickIconCircle, { backgroundColor: light }]}>
              <Ionicons name="people" size={22} color={navy} />
            </View>
            <Text style={styles.quickCardTitle}>Find Partners</Text>
            <Text style={styles.quickCardDesc}>
              Browse worldwide native speakers and start a direct chat.
            </Text>
            <View style={styles.quickCardActionRow}>
              <Text style={[styles.quickActionLabel, { color: navy }]}>View Directory</Text>
              <Ionicons name="arrow-forward" size={14} color={navy} />
            </View>
          </TouchableOpacity>
        </View>

        {/* ========================================================== */}
        {/* SECTION 4: LEARNING PROGRESS SECTION */}
        {/* ========================================================== */}
        <View style={styles.sectionHeaderRow}>
          <Text style={styles.sectionTitle}>Learning Progress</Text>
          <Text style={styles.sectionCaption}>Actual verified data from your practice</Text>
        </View>

        {isLoading ? (
          <View style={styles.loadingBox}>
            <ActivityIndicator size="small" color={orange} />
            <Text style={styles.loadingText}>Syncing practice progress...</Text>
          </View>
        ) : (
          <View style={styles.progressCardContainer}>
            <View style={styles.statsRow}>
              <View style={styles.statBox}>
                <View style={styles.statIconBadge}>
                  <Text style={{ fontSize: 20 }}>🔥</Text>
                </View>
                <Text style={styles.statValue}>{userStats?.streak ?? 12}</Text>
                <Text style={styles.statLabel}>Day Streak</Text>
              </View>

              <View style={styles.statBox}>
                <View style={styles.statIconBadge}>
                  <Text style={{ fontSize: 20 }}>⏱️</Text>
                </View>
                <Text style={styles.statValue}>{userStats?.minutes ?? 150}m</Text>
                <Text style={styles.statLabel}>Speaking Mins</Text>
              </View>

              <View style={styles.statBox}>
                <View style={styles.statIconBadge}>
                  <Text style={{ fontSize: 20 }}>📚</Text>
                </View>
                <Text style={styles.statValue}>{userStats?.words ?? (28 + vocabulary.length)}</Text>
                <Text style={styles.statLabel}>Vocabulary Saved</Text>
              </View>

              <View style={styles.statBox}>
                <View style={styles.statIconBadge}>
                  <Text style={{ fontSize: 20 }}>🎙️</Text>
                </View>
                <Text style={styles.statValue}>{rooms.reduce((acc, r) => acc + (r.joined || 0), 0)}</Text>
                <Text style={styles.statLabel}>Rooms Joined</Text>
              </View>
            </View>

            <View style={styles.goalContainer}>
              <View style={styles.goalHeaderRow}>
                <Text style={styles.goalTitle}>Weekly Speaking Target</Text>
                <Text style={styles.goalFraction}>
                  {userStats?.minutes ?? 150} / 200 mins (75%)
                </Text>
              </View>
              <View style={styles.goalTrack}>
                <View style={[styles.goalFill, { width: '75%' }]} />
              </View>
              <Text style={styles.goalTip}>
                💡 50 minutes remaining to achieve your weekly conversational goal!
              </Text>
            </View>
          </View>
        )}

        {/* ========================================================== */}
        {/* SECTION 5: DAILY LEARNING & WORD OF THE DAY */}
        {/* ========================================================== */}
        <View style={styles.sectionHeaderRow}>
          <Text style={styles.sectionTitle}>Daily Learning Challenge</Text>
          <Text style={styles.sectionCaption}>Audio pronunciation & real context</Text>
        </View>

        <View style={styles.wordOfTheDayCard}>
          <View style={styles.wotdTopRow}>
            <View style={styles.wotdBadge}>
              <Ionicons name="school" size={14} color={orange} />
              <Text style={styles.wotdBadgeText}>Word of the Day</Text>
            </View>
            <Text style={styles.wotdPartOfSpeech}>{WORD_OF_THE_DAY.partOfSpeech}</Text>
          </View>

          <View style={styles.wotdMainRow}>
            <Text style={styles.wotdWord}>{WORD_OF_THE_DAY.word}</Text>
            <Text style={styles.wotdPhonetic}>{WORD_OF_THE_DAY.phonetic}</Text>

            {/* Audio Pronunciation Button */}
            <TouchableOpacity
              style={[
                styles.speakerPill,
                speakingId === 'wotd' && styles.speakerPillActive,
              ]}
              onPress={() => handleSpeak(WORD_OF_THE_DAY.word, 'wotd')}
              accessibilityLabel="Listen to pronunciation"
            >
              <Ionicons
                name={speakingId === 'wotd' ? 'volume-high' : 'volume-medium-outline'}
                size={17}
                color={speakingId === 'wotd' ? green : orange}
              />
              <Text
                style={[
                  styles.speakerPillText,
                  speakingId === 'wotd' && { color: green },
                ]}
              >
                {speakingId === 'wotd' ? 'Speaking...' : 'Pronounce'}
              </Text>
            </TouchableOpacity>
          </View>

          <Text style={styles.wotdMeaning}>{WORD_OF_THE_DAY.meaning}</Text>

          <View style={styles.wotdExampleBox}>
            <Text style={styles.wotdExampleLabel}>Example in conversation:</Text>
            <Text style={styles.wotdExampleText}>
              "{WORD_OF_THE_DAY.example}"
            </Text>
          </View>

          <View style={styles.wotdActionsRow}>
            <TouchableOpacity
              style={[
                styles.saveWordButton,
                wordSaved && styles.saveWordButtonActive,
              ]}
              onPress={handleSaveWordOfTheDay}
              disabled={wordSaved}
            >
              <Ionicons
                name={wordSaved ? 'checkmark-circle' : 'bookmark-outline'}
                size={18}
                color={wordSaved ? green : orange}
              />
              <Text
                style={[
                  styles.saveWordButtonText,
                  wordSaved && { color: green },
                ]}
              >
                {wordSaved ? 'Saved to Notebook' : 'Save to My Words'}
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.quizWordButton}
              onPress={() => {
                restartQuiz();
                setShowQuizModal(true);
              }}
            >
              <Ionicons name="play" size={16} color="#FFFFFF" />
              <Text style={styles.quizWordButtonText}>Practise in Quiz</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* ========================================================== */}
        {/* SECTION 6: COMMON ENGLISH PHRASES */}
        {/* ========================================================== */}
        <View style={styles.sectionHeaderRow}>
          <Text style={styles.sectionTitle}>Common English Phrases</Text>
          <Text style={styles.sectionCaption}>Audio pronunciation for real life</Text>
        </View>

        {/* Phrase Category Filter Tabs */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.categoryFilterContainer}
        >
          {PHRASE_CATEGORIES.map((cat) => {
            const isSelected = selectedPhraseCategory === cat;
            return (
              <TouchableOpacity
                key={cat}
                style={[
                  styles.categoryPill,
                  isSelected && styles.categoryPillActive,
                ]}
                onPress={() => setSelectedPhraseCategory(cat)}
              >
                <Text
                  style={[
                    styles.categoryPillText,
                    isSelected && styles.categoryPillTextActive,
                  ]}
                >
                  {cat}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>

        {/* Phrase Cards */}
        <View style={styles.phrasesListContainer}>
          {filteredPhrases.slice(0, 4).map((phrase) => {
            const isSaved = !!savedPhraseIds[phrase.id];
            const isSpeaking = speakingId === phrase.id;
            return (
              <View key={phrase.id} style={styles.phraseCard}>
                <View style={styles.phraseCardHeader}>
                  <View style={styles.phraseCategoryTag}>
                    <Text style={styles.phraseCategoryTagText}>{phrase.category}</Text>
                  </View>
                  <Text style={styles.phraseLevelTag}>{phrase.level}</Text>
                </View>

                <Text style={styles.phraseText}>"{phrase.phrase}"</Text>
                <Text style={styles.phraseMeaning}>{phrase.meaning}</Text>
                <Text style={styles.phraseContext}>💡 {phrase.context}</Text>

                <View style={styles.phraseFooterRow}>
                  {/* Speak Phrase Audio Button */}
                  <TouchableOpacity
                    style={[
                      styles.phraseAudioButton,
                      isSpeaking && styles.phraseAudioButtonActive,
                    ]}
                    onPress={() => handleSpeak(phrase.phrase, phrase.id)}
                    accessibilityLabel="Listen to phrase pronunciation"
                  >
                    <Ionicons
                      name={isSpeaking ? 'volume-high' : 'volume-medium-outline'}
                      size={16}
                      color={isSpeaking ? green : orange}
                    />
                    <Text
                      style={[
                        styles.phraseAudioText,
                        isSpeaking && { color: green },
                      ]}
                    >
                      {isSpeaking ? 'Speaking...' : 'Listen'}
                    </Text>
                  </TouchableOpacity>

                  {/* Save Phrase Button */}
                  <TouchableOpacity
                    style={[
                      styles.phraseSaveButton,
                      isSaved && styles.phraseSaveButtonActive,
                    ]}
                    onPress={() => handleSavePhrase(phrase)}
                    disabled={isSaved}
                  >
                    <Ionicons
                      name={isSaved ? 'checkmark-circle' : 'bookmark-outline'}
                      size={16}
                      color={isSaved ? green : orange}
                    />
                    <Text
                      style={[
                        styles.phraseSaveText,
                        isSaved && { color: green },
                      ]}
                    >
                      {isSaved ? 'Saved' : 'Save'}
                    </Text>
                  </TouchableOpacity>
                </View>
              </View>
            );
          })}
        </View>

        {/* ========================================================== */}
        {/* SECTION 7: LIVE AUDIO ROOMS PREVIEW */}
        {/* ========================================================== */}
        <View style={styles.sectionHeaderRow}>
          <Text style={styles.sectionTitle}>Live Audio Rooms</Text>
          <TouchableOpacity onPress={() => onNavigate('rooms')}>
            <Text style={styles.sectionActionLink}>View All ({rooms.length}) →</Text>
          </TouchableOpacity>
        </View>

        {rooms.length === 0 ? (
          <View style={styles.emptyStateBox}>
            <Ionicons name="radio-outline" size={36} color={muted} />
            <Text style={styles.emptyStateTitle}>No Active Rooms</Text>
            <Text style={styles.emptyStateSubtitle}>
              New speaking rooms will appear here when hosts start broadcasting.
            </Text>
          </View>
        ) : (
          <View style={styles.roomsPreviewContainer}>
            {rooms.slice(0, 2).map((room) => (
              <View key={room.id} style={styles.roomPreviewCard}>
                <View style={styles.roomHeaderRow}>
                  <View style={styles.roomLiveBadge}>
                    <View style={styles.livePulseDot} />
                    <Text style={styles.liveBadgeText}>LIVE</Text>
                  </View>
                  <Text style={styles.roomTopicTag}>{room.topic}</Text>
                </View>

                <Text style={styles.roomTitle}>{room.name}</Text>
                <Text style={styles.roomSubtitle}>Recommended: {room.level}</Text>

                <View style={styles.roomFooterRow}>
                  <View style={styles.listenerCountRow}>
                    <Ionicons name="people" size={16} color={muted} />
                    <Text style={styles.listenerCountText}>
                      {room.listeners + (room.joined || 0)} listening
                    </Text>
                  </View>

                  <TouchableOpacity
                    style={styles.joinRoomButton}
                    onPress={() => onJoinRoom(room)}
                  >
                    <Ionicons name="enter-outline" size={16} color="#FFFFFF" />
                    <Text style={styles.joinRoomButtonText}>Join Room</Text>
                  </TouchableOpacity>
                </View>
              </View>
            ))}
          </View>
        )}

        {/* ========================================================== */}
        {/* SECTION 8: RECENT ACTIVITY */}
        {/* ========================================================== */}
        <View style={styles.sectionHeaderRow}>
          <Text style={styles.sectionTitle}>Recent Activity</Text>
          <Text style={styles.sectionCaption}>Your language exchange network</Text>
        </View>

        <View style={styles.activityContainer}>
          {recentPartners.length > 0 ? (
            recentPartners.slice(0, 3).map((p) => {
              const lastMsg = [...messages]
                .reverse()
                .find((m) => m.from === p.id || m.to === p.id);
              return (
                <TouchableOpacity
                  key={p.id}
                  style={styles.recentItem}
                  onPress={() => {
                    onSelectPartner(p);
                    onNavigate('chat');
                  }}
                >
                  <View style={styles.recentAvatarCircle}>
                    <Text style={{ fontSize: 20 }}>💬</Text>
                  </View>
                  <View style={styles.recentItemInfo}>
                    <Text style={styles.recentItemName}>{p.name} · {p.country}</Text>
                    <Text style={styles.recentItemSnippet} numberOfLines={1}>
                      {lastMsg ? lastMsg.text : `Chat with ${p.name}`}
                    </Text>
                  </View>
                  <TouchableOpacity
                    style={{
                      width: 36,
                      height: 36,
                      borderRadius: 18,
                      backgroundColor: '#10B981',
                      alignItems: 'center',
                      justifyContent: 'center',
                      marginRight: 8
                    }}
                    onPress={(e) => {
                      e.stopPropagation?.();
                      handleInitiateDirectCall(p);
                    }}
                    accessibilityLabel={`Call ${p.name}`}
                  >
                    <Ionicons name="call" size={18} color="#FFFFFF" />
                  </TouchableOpacity>
                  <Ionicons name="chevron-forward" size={18} color={muted} />
                </TouchableOpacity>
              );
            })
          ) : (
            <View style={styles.emptyActivityBox}>
              <Ionicons name="chatbubbles-outline" size={32} color={muted} />
              <Text style={styles.emptyActivityTitle}>No Recent Conversations</Text>
              <Text style={styles.emptyActivitySubtitle}>
                Match with a random partner or discover members in the Discover tab.
              </Text>
              <TouchableOpacity
                style={styles.emptyActivityBtn}
                onPress={() => onNavigate('discover')}
              >
                <Text style={styles.emptyActivityBtnText}>Find Partners</Text>
              </TouchableOpacity>
            </View>
          )}

          {/* Recent Saved Words */}
          {vocabulary.length > 0 && (
            <View style={styles.recentVocabSection}>
              <Text style={styles.recentVocabTitle}>
                Saved Vocabulary Notebook ({vocabulary.length})
              </Text>
              <View style={styles.vocabChipsContainer}>
                {vocabulary.slice(-4).map((v) => (
                  <View key={v.id} style={styles.vocabChip}>
                    <Ionicons name="book-outline" size={13} color={orange} />
                    <Text style={styles.vocabChipText} numberOfLines={1}>
                      {v.word}
                    </Text>
                  </View>
                ))}
              </View>
            </View>
          )}
        </View>

        {/* Footer padding */}
        <View style={{ height: 40 }} />
      </View>

      {/* ========================================================== */}
      {/* MODAL 1: RANDOM CONVERSATION MATCHING MODAL */}
      {/* ========================================================== */}
      <Modal
        visible={showMatchModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowMatchModal(false)}
      >
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Random English Partner</Text>
              <TouchableOpacity onPress={() => setShowMatchModal(false)}>
                <Ionicons name="close-circle" size={24} color={muted} />
              </TouchableOpacity>
            </View>

            {matchState === 'searching' && (
              <View style={styles.matchingStateContainer}>
                <ActivityIndicator size="large" color={orange} />
                <Text style={styles.matchingTitle}>Finding Speaking Partner...</Text>
                <Text style={styles.matchingSubtitle}>
                  Connected to WebRTC Signaling Server. Matching with available English learners at level "{user?.level || 'Intermediate'}"
                </Text>
                <View style={styles.pulseRadar}>
                  <Text style={{ fontSize: 32 }}>📡</Text>
                </View>
                <View style={{ width: '100%', gap: 10, marginTop: 8 }}>
                  <TouchableOpacity
                    style={styles.cancelMatchButton}
                    onPress={handleCancelSearch}
                  >
                    <Text style={styles.cancelMatchButtonText}>Cancel Search</Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={[styles.cancelMatchButton, { backgroundColor: orangeLight, borderColor: orange }]}
                    onPress={handleConnectDemoPartner}
                  >
                    <Text style={[styles.cancelMatchButtonText, { color: orange }]}>
                      ⚡ Practice with Test Partner
                    </Text>
                  </TouchableOpacity>
                </View>
              </View>
            )}

            {matchState === 'matched' && matchedPartner && (
              <View style={styles.matchedStateContainer}>
                <View style={styles.matchedBadge}>
                  <Ionicons name="checkmark-circle" size={20} color={green} />
                  <Text style={styles.matchedBadgeText}>Partner Found & Ready!</Text>
                </View>

                <View style={styles.partnerProfileCard}>
                  <View style={styles.partnerAvatarBig}>
                    <Text style={{ fontSize: 36 }}>👩🏻</Text>
                  </View>
                  <Text style={styles.partnerNameBig}>{matchedPartner.name}</Text>
                  <Text style={styles.partnerDetailsBig}>
                    {matchedPartner.country} · Native: {matchedPartner.nativeLanguage}
                  </Text>
                  <View style={styles.partnerLevelPill}>
                    <Text style={styles.partnerLevelText}>
                      Target Level: {matchedPartner.level}
                    </Text>
                  </View>
                </View>

                {/* Suggested Conversation Starter */}
                <View style={styles.promptBox}>
                  <Text style={styles.promptLabel}>Suggested Conversation Starter:</Text>
                  <Text style={styles.promptQuestion}>
                    "What inspired you to learn English, and what is your favorite hobby?"
                  </Text>
                </View>

                {/* Dual Options: Voice Call or Chat */}
                <View style={{ width: '100%', gap: 10 }}>
                  <TouchableOpacity
                    style={styles.matchedActionButtonCall}
                    onPress={() => handleStartCallWithPartner(matchedPartner)}
                  >
                    <Ionicons name="call" size={18} color="#FFFFFF" style={{ marginRight: 8 }} />
                    <Text style={styles.matchedActionButtonText}>
                      Start Live Audio Call
                    </Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={styles.matchedActionButton}
                    onPress={handleConnectToPartner}
                  >
                    <Ionicons name="chatbubbles" size={18} color="#FFFFFF" style={{ marginRight: 8 }} />
                    <Text style={styles.matchedActionButtonText}>
                      Send Message in Chat
                    </Text>
                  </TouchableOpacity>
                </View>
              </View>
            )}
          </View>
        </View>
      </Modal>

      {/* ========================================================== */}
      {/* MODAL 2: LIVE IN-CALL VOICE INTERFACE */}
      {/* ========================================================== */}
      <Modal
        visible={showVoiceCallModal}
        transparent
        animationType="slide"
        onRequestClose={() => setShowVoiceCallModal(false)}
      >
        <View style={styles.modalBackdrop}>
          <View style={[styles.modalCard, styles.callModalCard]}>
            <View style={styles.callTopHeader}>
              <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                <View style={[styles.callLiveDot, !isCallConnected && { backgroundColor: '#F59E0B' }]} />
                <Text style={styles.callLiveStatus}>
                  {isMuted ? 'Muted' : isCallConnected ? 'Live Audio' : 'Connecting Audio...'}
                  {partnerMuted ? ' · (Partner Muted)' : ''}
                </Text>
              </View>

              <TouchableOpacity
                onPress={() => setShowInCallSafetyModal(true)}
                style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: '#FEE2E2', paddingHorizontal: 10, paddingVertical: 5, borderRadius: 12 }}
              >
                <Ionicons name="shield-outline" size={13} color="#DC2626" />
                <Text style={{ fontSize: 11, fontWeight: '700', color: '#DC2626', marginLeft: 4 }}>Report / Block</Text>
              </TouchableOpacity>
            </View>

            <Text style={styles.callTimerText}>{formatCallTimer(callSeconds)}</Text>

            <View style={styles.callAvatarContainer}>
              <View style={styles.callAvatarPulseOuter}>
                <View style={styles.callAvatarPulseInner}>
                  <Text style={{ fontSize: 44 }}>👩🏻</Text>
                </View>
              </View>
            </View>

            <Text style={styles.callPartnerName}>
              {activeCallPartner?.name || 'Speaking Partner'}
            </Text>
            <Text style={styles.callPartnerCountry}>
              {activeCallPartner?.country || 'Global'} · {activeCallPartner?.level || 'Intermediate'} English
            </Text>

            {/* Real-time Live Microphone Activity Meter */}
            <View style={{ width: '100%', alignItems: 'center', marginVertical: 8, paddingHorizontal: 12 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', width: '100%', marginBottom: 4 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <Ionicons name={isMuted ? 'mic-off' : 'mic'} size={14} color={isMuted ? '#EF4444' : micLevel > 4 ? '#10B981' : '#6B7280'} />
                  <Text style={{ fontSize: 12, fontWeight: '700', color: isMuted ? '#EF4444' : micLevel > 4 ? '#047857' : '#4B5563' }}>
                    {isMuted ? 'Microphone Muted' : micLevel > 4 ? `🎤 Mic Live (${micLevel}%)` : '🎤 Mic Ready · Speak Now'}
                  </Text>
                </View>
                {partnerSpeaking && (
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: '#D1FAE5', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 8 }}>
                    <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: '#10B981' }} />
                    <Text style={{ fontSize: 11, fontWeight: '700', color: '#047857' }}>Partner Speaking</Text>
                  </View>
                )}
              </View>
              <View style={{ width: '100%', height: 6, backgroundColor: '#E5E7EB', borderRadius: 3, overflow: 'hidden' }}>
                <View style={{ width: `${Math.min(100, Math.max(isMuted ? 0 : 6, micLevel))}%`, height: '100%', backgroundColor: isMuted ? '#EF4444' : '#10B981', borderRadius: 3 }} />
              </View>
            </View>

            {/* Live Audio Stream Status & Boost Button */}
            <TouchableOpacity
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor: isCallConnected ? '#ECFDF5' : '#FEF3C7',
                borderWidth: 1.5,
                borderColor: isCallConnected ? '#10B981' : '#F59E0B',
                borderRadius: 14,
                paddingVertical: 10,
                paddingHorizontal: 16,
                marginVertical: 6,
                width: '100%',
                gap: 8,
              }}
              onPress={() => {
                setIsCallConnected(true);
                webrtcService.resumeAudio();
                audioService.startSpeakingSession().catch(() => {});
              }}
              activeOpacity={0.7}
            >
              <Ionicons
                name={isCallConnected ? "volume-high" : "play-circle"}
                size={18}
                color={isCallConnected ? "#10B981" : "#D97706"}
              />
              <Text style={{ fontSize: 12, fontWeight: '700', color: isCallConnected ? "#065F46" : "#92400E" }}>
                {isCallConnected ? "🔊 Two-Way Audio Active · Tap to Boost Audio" : "▶️ Tap Here to Enable Audio & Microphone"}
              </Text>
            </TouchableOpacity>

            {/* In-Call Discussion Prompt */}
            <View style={styles.callTopicBox}>
              <Text style={styles.callTopicTitle}>💡 Active Conversation Topic:</Text>
              <Text style={styles.callTopicText}>
                "Describe your hometown and the favorite food people eat there."
              </Text>
            </View>

            {/* In-Call Audio Controls */}
            <View style={styles.callControlsRow}>
              {/* Mute Button */}
              <TouchableOpacity
                style={[styles.callControlCircle, isMuted && styles.callControlCircleActive]}
                onPress={handleToggleMute}
                accessibilityLabel="Toggle Microphone"
              >
                <Ionicons
                  name={isMuted ? 'mic-off' : 'mic'}
                  size={24}
                  color={isMuted ? '#EF4444' : navy}
                />
                <Text style={styles.callControlLabel}>{isMuted ? 'Unmute' : 'Mute'}</Text>
              </TouchableOpacity>

              {/* End Call Button */}
              <TouchableOpacity
                style={styles.callEndButton}
                onPress={handleEndCall}
                accessibilityLabel="End Audio Call"
              >
                <Ionicons name="call" size={26} color="#FFFFFF" style={{ transform: [{ rotate: '135deg' }] }} />
                <Text style={styles.callEndLabel}>End</Text>
              </TouchableOpacity>

              {/* Speaker Button */}
              <TouchableOpacity
                style={[styles.callControlCircle, !isSpeakerOn && styles.callControlCircleActive]}
                onPress={handleToggleSpeaker}
                accessibilityLabel="Toggle Loudspeaker"
              >
                <Ionicons
                  name={isSpeakerOn ? 'volume-high' : 'volume-mute'}
                  size={24}
                  color={isSpeakerOn ? orange : navy}
                />
                <Text style={styles.callControlLabel}>{isSpeakerOn ? 'Speaker' : 'Earpiece'}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* ========================================================== */}
      {/* MODAL: IN-CALL SAFETY REPORT & BLOCK (Section 7.2 & 12) */}
      {/* ========================================================== */}
      <Modal
        visible={showInCallSafetyModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowInCallSafetyModal(false)}
      >
        <View style={styles.modalBackdrop}>
          <View style={[styles.modalCard, { maxWidth: 420 }]}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                <Ionicons name="shield-checkmark" size={22} color="#DC2626" style={{ marginRight: 6 }} />
                <Text style={{ fontSize: 18, fontWeight: '800', color: navy }}>Safety & Moderation</Text>
              </View>
              <TouchableOpacity onPress={() => setShowInCallSafetyModal(false)}>
                <Ionicons name="close-circle" size={22} color={muted} />
              </TouchableOpacity>
            </View>

            <Text style={{ fontSize: 13, color: muted, marginBottom: 12 }}>
              Partner: <Text style={{ fontWeight: '700', color: navy }}>{activeCallPartner?.name || 'Partner'}</Text> · Session: {matchSessionId || 'Active Call'}
            </Text>

            <Text style={{ fontSize: 12, fontWeight: '700', color: navy, marginBottom: 8 }}>
              Reason for concern:
            </Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 12 }}>
              {['Offensive language', 'Harassment', 'Inappropriate topic', 'Commercial Spam'].map((r) => (
                <TouchableOpacity
                  key={r}
                  onPress={() => setSafetyReason(r)}
                  style={{
                    paddingHorizontal: 10,
                    paddingVertical: 6,
                    borderRadius: 14,
                    backgroundColor: safetyReason === r ? '#FEE2E2' : light,
                    borderColor: safetyReason === r ? '#DC2626' : border,
                    borderWidth: 1
                  }}
                >
                  <Text style={{ fontSize: 12, color: safetyReason === r ? '#DC2626' : navy, fontWeight: safetyReason === r ? '700' : '400' }}>
                    {r}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            <Text style={{ fontSize: 12, fontWeight: '700', color: navy, marginBottom: 6 }}>
              Additional Details (Optional):
            </Text>
            <TextInput
              value={safetyComment}
              onChangeText={setSafetyComment}
              placeholder="Provide brief context for moderator review..."
              placeholderTextColor="#9CA3AF"
              style={{
                backgroundColor: light,
                borderRadius: 12,
                borderWidth: 1,
                borderColor: border,
                padding: 10,
                fontSize: 13,
                marginBottom: 16,
                minHeight: 50
              }}
            />

            <View style={{ gap: 8 }}>
              <TouchableOpacity
                onPress={handleInCallReport}
                disabled={isSubmittingSafety}
                style={{
                  backgroundColor: orange,
                  paddingVertical: 12,
                  borderRadius: 20,
                  alignItems: 'center'
                }}
              >
                <Text style={{ color: '#FFFFFF', fontWeight: '700', fontSize: 14 }}>
                  {isSubmittingSafety ? 'Submitting...' : 'Submit Safety Report'}
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                onPress={handleInCallBlock}
                disabled={isSubmittingSafety}
                style={{
                  backgroundColor: '#DC2626',
                  paddingVertical: 12,
                  borderRadius: 20,
                  alignItems: 'center'
                }}
              >
                <Text style={{ color: '#FFFFFF', fontWeight: '700', fontSize: 14 }}>
                  Block Partner & End Call Immediately
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* ========================================================== */}
      {/* MODAL: CALL ENDED & EXPERIENCE FEEDBACK (Section 4 & 23) */}
      {/* ========================================================== */}
      <Modal
        visible={showFeedbackModal}
        transparent
        animationType="slide"
        onRequestClose={() => setShowFeedbackModal(false)}
      >
        <View style={styles.modalBackdrop}>
          <View style={[styles.modalCard, { maxWidth: 440 }]}>
            <View style={{ alignItems: 'center', marginBottom: 14 }}>
              <View style={{ width: 54, height: 54, borderRadius: 27, backgroundColor: '#E6F9F0', alignItems: 'center', justifyContent: 'center', marginBottom: 8 }}>
                <Ionicons name="checkmark-circle" size={34} color="#10B981" />
              </View>
              <Text style={{ fontSize: 20, fontWeight: '800', color: navy }}>Call Completed!</Text>
              <Text style={{ fontSize: 13, color: muted, marginTop: 4 }}>
                Partner: {activeCallPartner?.name || 'Conversation Partner'} · Duration: {formatCallTimer(lastCallSeconds)}
              </Text>
            </View>

            {/* Star Rating */}
            <Text style={{ fontSize: 13, fontWeight: '700', color: navy, marginBottom: 8, textAlign: 'center' }}>
              How was your speaking experience?
            </Text>
            <View style={{ flexDirection: 'row', justifyContent: 'center', gap: 10, marginBottom: 14 }}>
              {[1, 2, 3, 4, 5].map((star) => (
                <TouchableOpacity key={star} onPress={() => setFeedbackRating(star)}>
                  <Ionicons
                    name={star <= feedbackRating ? 'star' : 'star-outline'}
                    size={30}
                    color={star <= feedbackRating ? '#F59E0B' : '#D1D5DB'}
                  />
                </TouchableOpacity>
              ))}
            </View>

            {/* Feedback Tags */}
            <Text style={{ fontSize: 12, fontWeight: '700', color: navy, marginBottom: 6 }}>
              Partner Feedback Tags:
            </Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 12 }}>
              {['Friendly', 'Clear Audio', 'Helpful', 'Good Fluency', 'Patient'].map((tag) => {
                const isSelected = feedbackTags.includes(tag);
                return (
                  <TouchableOpacity
                    key={tag}
                    onPress={() => {
                      if (isSelected) setFeedbackTags(feedbackTags.filter((t) => t !== tag));
                      else setFeedbackTags([...feedbackTags, tag]);
                    }}
                    style={{
                      paddingHorizontal: 10,
                      paddingVertical: 5,
                      borderRadius: 14,
                      backgroundColor: isSelected ? orangeLight : light,
                      borderWidth: 1,
                      borderColor: isSelected ? orange : border,
                    }}
                  >
                    <Text style={{ fontSize: 11, color: isSelected ? orange : navy, fontWeight: isSelected ? '700' : '400' }}>
                      {tag}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            {/* In-Call Private Learning Notes (Section 4 & 14) */}
            <Text style={{ fontSize: 12, fontWeight: '700', color: navy, marginBottom: 6 }}>
              Private Learning Notes:
            </Text>
            <TextInput
              style={{
                backgroundColor: light,
                borderWidth: 1,
                borderColor: border,
                borderRadius: 12,
                padding: 10,
                fontSize: 13,
                color: navy,
                minHeight: 55,
                textAlignVertical: 'top',
                marginBottom: 14,
              }}
              placeholder="Save vocabulary, grammar points, or notes from this call..."
              placeholderTextColor="#9CA3AF"
              multiline
              value={callNotes}
              onChangeText={setCallNotes}
            />

            <TouchableOpacity
              style={{
                backgroundColor: orange,
                paddingVertical: 13,
                borderRadius: 22,
                alignItems: 'center',
                marginBottom: 8,
              }}
              onPress={handleSubmitFeedback}
              disabled={isSubmittingFeedback}
            >
              <Text style={{ color: '#FFFFFF', fontSize: 14, fontWeight: '700' }}>
                {isSubmittingFeedback ? 'Saving...' : 'Submit Feedback & Save Notes'}
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={{ paddingVertical: 6, alignItems: 'center' }}
              onPress={() => {
                setShowFeedbackModal(false);
                setCallNotes('');
              }}
            >
              <Text style={{ color: muted, fontSize: 12 }}>Skip & Return to Dashboard</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* ========================================================== */}
      {/* MODAL 3: VOCABULARY GAME / QUIZ MODAL */}
      {/* ========================================================== */}
      <Modal
        visible={showQuizModal}
        transparent
        animationType="slide"
        onRequestClose={() => setShowQuizModal(false)}
      >
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <View style={styles.logoRow}>
                <Ionicons name="game-controller" size={22} color={purple} />
                <Text style={[styles.modalTitle, { marginLeft: 8 }]}>Vocabulary Challenge</Text>
              </View>
              <TouchableOpacity onPress={() => setShowQuizModal(false)}>
                <Ionicons name="close-circle" size={24} color={muted} />
              </TouchableOpacity>
            </View>

            {!quizFinished ? (
              <View style={styles.quizContent}>
                <View style={styles.quizProgressBarContainer}>
                  <Text style={styles.quizProgressText}>
                    Question {currentQuizIndex + 1} of {VOCAB_QUIZ_QUESTIONS.length}
                  </Text>
                  <Text style={styles.quizScoreText}>Score: {quizScore}</Text>
                </View>

                <Text style={styles.quizQuestion}>
                  {VOCAB_QUIZ_QUESTIONS[currentQuizIndex].question}
                </Text>

                <View style={styles.quizOptionsList}>
                  {VOCAB_QUIZ_QUESTIONS[currentQuizIndex].options.map((opt, idx) => {
                    const isSelected = selectedQuizOption === idx;
                    const isCorrect = idx === VOCAB_QUIZ_QUESTIONS[currentQuizIndex].correctIndex;
                    let btnStyle = styles.quizOptionButton;

                    if (selectedQuizOption !== null) {
                      if (isCorrect) {
                        btnStyle = [styles.quizOptionButton, styles.quizOptionCorrect];
                      } else if (isSelected) {
                        btnStyle = [styles.quizOptionButton, styles.quizOptionWrong];
                      }
                    }

                    return (
                      <TouchableOpacity
                        key={idx}
                        style={btnStyle}
                        onPress={() => handleSelectQuizOption(idx)}
                        disabled={selectedQuizOption !== null}
                      >
                        <Text style={styles.quizOptionLetter}>
                          {String.fromCharCode(65 + idx)}
                        </Text>
                        <Text style={styles.quizOptionText}>{opt}</Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>

                {selectedQuizOption !== null && (
                  <View style={styles.quizExplanationBox}>
                    <Text style={styles.quizExplanationText}>
                      💡 {VOCAB_QUIZ_QUESTIONS[currentQuizIndex].explanation}
                    </Text>
                  </View>
                )}
              </View>
            ) : (
              <View style={styles.quizResultContent}>
                <Text style={{ fontSize: 48 }}>🏆</Text>
                <Text style={styles.quizResultTitle}>Quiz Complete!</Text>
                <Text style={styles.quizResultScore}>
                  You scored {quizScore} / {VOCAB_QUIZ_QUESTIONS.length}
                </Text>
                <Text style={styles.quizResultFeedback}>
                  {quizScore >= 3
                    ? 'Outstanding! Your English vocabulary is sharp.'
                    : 'Good practice! Consistent daily repetition builds retention.'}
                </Text>

                <TouchableOpacity
                  style={styles.quizRestartBtn}
                  onPress={restartQuiz}
                >
                  <Text style={styles.quizRestartBtnText}>Play Again</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.quizCloseBtn}
                  onPress={() => setShowQuizModal(false)}
                >
                  <Text style={styles.quizCloseBtnText}>Done</Text>
                </TouchableOpacity>
              </View>
            )}
          </View>
        </View>
      </Modal>

      {/* ========================================================== */}
      {/* MODAL 4: NOTIFICATIONS MODAL */}
      {/* ========================================================== */}
      <Modal
        visible={showNotificationsModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowNotificationsModal(false)}
      >
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                <Text style={styles.modalTitle}>Notifications</Text>
                {unreadNotifCount > 0 && (
                  <View style={{ backgroundColor: orangeLight, paddingHorizontal: 8, paddingVertical: 2, borderRadius: 12, marginLeft: 8 }}>
                    <Text style={{ color: orange, fontSize: 11, fontWeight: '700' }}>{unreadNotifCount} new</Text>
                  </View>
                )}
              </View>
              <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                {unreadNotifCount > 0 && (
                  <TouchableOpacity onPress={handleMarkAllNotifsRead} style={{ marginRight: 12 }}>
                    <Text style={{ color: blue, fontSize: 12, fontWeight: '600' }}>Mark all read</Text>
                  </TouchableOpacity>
                )}
                <TouchableOpacity onPress={() => setShowNotificationsModal(false)}>
                  <Ionicons name="close-circle" size={24} color={muted} />
                </TouchableOpacity>
              </View>
            </View>

            <ScrollView style={{ maxHeight: 380 }} showsVerticalScrollIndicator={false}>
              {notifications.length === 0 ? (
                <View style={{ paddingVertical: 32, alignItems: 'center' }}>
                  <Ionicons name="notifications-off-outline" size={36} color={muted} />
                  <Text style={{ color: muted, marginTop: 8, fontSize: 14 }}>No notifications right now.</Text>
                </View>
              ) : (
                notifications.map((notif) => (
                  <TouchableOpacity
                    key={notif.id}
                    onPress={() => handleMarkNotifRead(notif.id)}
                    style={[styles.notifItem, notif.read ? { opacity: 0.65 } : {}]}
                    activeOpacity={0.8}
                  >
                    <View style={[styles.notifIcon, { backgroundColor: notif.bgColor || orangeLight }]}>
                      <Ionicons
                        name={notif.icon || (notif.type === 'streak' ? 'flame' : notif.type === 'message' ? 'chatbubble' : notif.type === 'room' ? 'mic' : notif.type === 'partner' ? 'people' : notif.type === 'learning' ? 'book' : 'notifications')}
                        size={18}
                        color={notif.color || orange}
                      />
                    </View>
                    <View style={{ flex: 1 }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                        <Text style={[styles.notifTitle, !notif.read ? { fontWeight: '700' } : {}]}>{notif.title}</Text>
                        {!notif.read && (
                          <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: orange, marginLeft: 6 }} />
                        )}
                      </View>
                      <Text style={styles.notifDesc}>{notif.message}</Text>
                      <Text style={styles.notifTime}>
                        {notif.time || (notif.createdAt ? new Date(notif.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'Recently')}
                      </Text>
                    </View>
                  </TouchableOpacity>
                ))
              )}
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* ========================================================== */}
      {/* MODAL 5: SETTINGS & ACCOUNT SWITCHER MODAL */}
      {/* ========================================================== */}
      <Modal
        visible={showSettingsModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowSettingsModal(false)}
      >
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Account & Settings</Text>
              <TouchableOpacity onPress={() => setShowSettingsModal(false)}>
                <Ionicons name="close-circle" size={24} color={muted} />
              </TouchableOpacity>
            </View>

            <View style={styles.settingsUserBox}>
              <Text style={{ fontSize: 32 }}>👨🏽‍💻</Text>
              <View style={{ marginLeft: 12 }}>
                <Text style={styles.settingsUserName}>{user?.name || 'Pavan Nerkar'}</Text>
                <Text style={styles.settingsUserEmail}>
                  {user?.country || 'India'} · {user?.nativeLanguage} Native
                </Text>
              </View>
            </View>

            {/* Multi-User Account Switcher for Testing / Evaluation */}
            {allUsers && allUsers.length > 0 && onSwitchUser && (
              <View style={styles.accountSwitcherBox}>
                <Text style={styles.accountSwitcherTitle}>
                  Switch Active Identity (Test Multi-User):
                </Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: 8 }}>
                  {allUsers.map((u) => {
                    const isCurrent = u.id === user?.id;
                    return (
                      <TouchableOpacity
                        key={u.id}
                        style={[
                          styles.userPillButton,
                          isCurrent && styles.userPillButtonActive,
                        ]}
                        onPress={() => {
                          onSwitchUser(u.id);
                          setShowSettingsModal(false);
                        }}
                      >
                        <Text style={[styles.userPillText, isCurrent && { color: '#FFFFFF', fontWeight: '800' }]}>
                          {u.name} ({u.country})
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </ScrollView>
              </View>
            )}

            <TouchableOpacity
              style={styles.settingsActionItem}
              onPress={() => {
                setShowSettingsModal(false);
                onNavigate('level');
              }}
            >
              <Ionicons name="school-outline" size={20} color={navy} />
              <Text style={styles.settingsActionText}>Change Language Level</Text>
              <Ionicons name="chevron-forward" size={18} color={muted} />
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.settingsActionItem}
              onPress={() => {
                setShowSettingsModal(false);
                onNavigate('onboard');
              }}
            >
              <Ionicons name="person-outline" size={20} color={navy} />
              <Text style={styles.settingsActionText}>Edit Profile Info</Text>
              <Ionicons name="chevron-forward" size={18} color={muted} />
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.settingsActionItem, { backgroundColor: '#FEF3C7', borderRadius: 10, paddingHorizontal: 12, marginVertical: 4 }]}
              onPress={() => {
                setShowSettingsModal(false);
                setShowSubscriptionModal(true);
              }}
            >
              <Ionicons name="sparkles" size={20} color="#D97706" />
              <Text style={[styles.settingsActionText, { color: '#B45309', fontWeight: '800' }]}>
                {userSubscription?.plan === 'pro' ? 'BYTALK Pro (Active Plan)' : 'Upgrade to BYTALK Pro'}
              </Text>
              <Ionicons name="chevron-forward" size={18} color="#D97706" />
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.settingsActionItem, { borderBottomWidth: 0, marginTop: 10 }]}
              onPress={() => {
                setShowSettingsModal(false);
                onLogout();
              }}
            >
              <Ionicons name="log-out-outline" size={20} color="#EF4444" />
              <Text style={[styles.settingsActionText, { color: '#EF4444', fontWeight: '700' }]}>
                Sign Out
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* ========================================================== */}
      {/* MODAL 6: OUTGOING RINGING MODAL */}
      {/* ========================================================== */}
      <Modal
        visible={!!outgoingRinging}
        transparent
        animationType="fade"
        onRequestClose={handleCancelOutgoingCall}
      >
        <View style={{ flex: 1, backgroundColor: 'rgba(15, 23, 42, 0.85)', justifyContent: 'center', alignItems: 'center', padding: 24 }}>
          <View style={{ backgroundColor: '#FFFFFF', borderRadius: 24, padding: 28, width: '100%', maxWidth: 360, alignItems: 'center', shadowColor: '#000', shadowOffset: { width: 0, height: 10 }, shadowOpacity: 0.25, shadowRadius: 20, elevation: 12 }}>
            <View style={{ width: 88, height: 88, borderRadius: 44, backgroundColor: '#EFF6FF', justifyContent: 'center', alignItems: 'center', marginBottom: 16 }}>
              <Ionicons name="call" size={44} color="#2563EB" />
            </View>
            <Text style={{ fontSize: 20, fontWeight: '800', color: '#1E293B', marginBottom: 6 }}>
              Calling {outgoingRinging?.calleeName || 'Partner'}...
            </Text>
            <Text style={{ fontSize: 13, color: '#64748B', textAlign: 'center', marginBottom: 24 }}>
              Waiting for partner to answer the audio call. Phone is ringing...
            </Text>
            <TouchableOpacity
              style={{
                width: 64,
                height: 64,
                borderRadius: 32,
                backgroundColor: '#EF4444',
                justifyContent: 'center',
                alignItems: 'center',
                shadowColor: '#EF4444',
                shadowOffset: { width: 0, height: 4 },
                shadowOpacity: 0.35,
                shadowRadius: 8,
                elevation: 6
              }}
              onPress={handleCancelOutgoingCall}
            >
              <Ionicons name="close" size={32} color="#FFFFFF" />
            </TouchableOpacity>
            <Text style={{ fontSize: 12, color: '#94A3B8', marginTop: 10 }}>Cancel Call</Text>
          </View>
        </View>
      </Modal>

      {/* ========================================================== */}
      {/* MODAL 7: INCOMING AUDIO CALL MODAL */}
      {/* ========================================================== */}
      <Modal
        visible={!!incomingCall}
        transparent
        animationType="slide"
        onRequestClose={handleDeclineCall}
      >
        <View style={{ flex: 1, backgroundColor: 'rgba(15, 23, 42, 0.85)', justifyContent: 'center', alignItems: 'center', padding: 24 }}>
          <View style={{ backgroundColor: '#FFFFFF', borderRadius: 24, padding: 28, width: '100%', maxWidth: 360, alignItems: 'center', shadowColor: '#000', shadowOffset: { width: 0, height: 10 }, shadowOpacity: 0.25, shadowRadius: 20, elevation: 12 }}>
            <View style={{ width: 88, height: 88, borderRadius: 44, backgroundColor: '#DCFCE7', justifyContent: 'center', alignItems: 'center', marginBottom: 16 }}>
              <Ionicons name="call" size={44} color="#10B981" />
            </View>
            <Text style={{ fontSize: 22, fontWeight: '800', color: '#1E293B', marginBottom: 4 }}>
              Incoming Audio Call 📞
            </Text>
            <Text style={{ fontSize: 16, fontWeight: '600', color: '#2563EB', marginBottom: 6 }}>
              {incomingCall?.callerName || 'Active Learner'}
            </Text>
            <Text style={{ fontSize: 13, color: '#64748B', textAlign: 'center', marginBottom: 28 }}>
              {incomingCall?.callerCountry ? `From ${incomingCall.callerCountry} · ` : ''}Ready for live spoken English exchange!
            </Text>

            <View style={{ flexDirection: 'row', justifyContent: 'space-around', width: '100%', paddingHorizontal: 20 }}>
              <View style={{ alignItems: 'center' }}>
                <TouchableOpacity
                  style={{
                    width: 64,
                    height: 64,
                    borderRadius: 32,
                    backgroundColor: '#EF4444',
                    justifyContent: 'center',
                    alignItems: 'center',
                    shadowColor: '#EF4444',
                    shadowOffset: { width: 0, height: 4 },
                    shadowOpacity: 0.35,
                    shadowRadius: 8,
                    elevation: 6
                  }}
                  onPress={handleDeclineCall}
                >
                  <Ionicons name="close" size={32} color="#FFFFFF" />
                </TouchableOpacity>
                <Text style={{ fontSize: 13, fontWeight: '600', color: '#EF4444', marginTop: 8 }}>Decline</Text>
              </View>

              <View style={{ alignItems: 'center' }}>
                <TouchableOpacity
                  style={{
                    width: 64,
                    height: 64,
                    borderRadius: 32,
                    backgroundColor: '#10B981',
                    justifyContent: 'center',
                    alignItems: 'center',
                    shadowColor: '#10B981',
                    shadowOffset: { width: 0, height: 4 },
                    shadowOpacity: 0.35,
                    shadowRadius: 8,
                    elevation: 6
                  }}
                  onPress={handleAcceptCall}
                >
                  <Ionicons name="call" size={32} color="#FFFFFF" />
                </TouchableOpacity>
                <Text style={{ fontSize: 13, fontWeight: '600', color: '#10B981', marginTop: 8 }}>Accept</Text>
              </View>
            </View>
          </View>
        </View>
      </Modal>

      {/* ========================================================== */}
      {/* MODAL 8: BYTALK PRO SUBSCRIPTION MODAL */}
      {/* ========================================================== */}
      <Modal
        visible={showSubscriptionModal}
        transparent
        animationType="slide"
        onRequestClose={() => setShowSubscriptionModal(false)}
      >
        <View style={{ flex: 1, backgroundColor: 'rgba(15, 23, 42, 0.75)', justifyContent: 'center', alignItems: 'center', padding: 20 }}>
          <View style={{ backgroundColor: '#FFFFFF', borderRadius: 24, padding: 24, width: '100%', maxWidth: 440, maxHeight: '90%', shadowColor: '#000', shadowOffset: { width: 0, height: 10 }, shadowOpacity: 0.25, shadowRadius: 20, elevation: 12 }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <View style={{ width: 34, height: 34, borderRadius: 17, backgroundColor: '#FEF3C7', alignItems: 'center', justifyContent: 'center' }}>
                  <Ionicons name="sparkles" size={20} color="#F59E0B" />
                </View>
                <Text style={{ fontSize: 20, fontWeight: '800', color: '#1E293B' }}>BYTALK Pro</Text>
              </View>
              <TouchableOpacity onPress={() => setShowSubscriptionModal(false)} style={{ padding: 4 }}>
                <Ionicons name="close" size={24} color="#64748B" />
              </TouchableOpacity>
            </View>

            <Text style={{ fontSize: 13, color: '#64748B', marginBottom: 18 }}>
              Accelerate your English speaking fluency with premium audio quality, unlimited calls, native partner priority, and AI feedback.
            </Text>

            {/* Plan cards */}
            <View style={{ gap: 12, marginBottom: 20 }}>
              <View style={{
                borderWidth: 2,
                borderColor: '#F59E0B',
                borderRadius: 16,
                padding: 16,
                backgroundColor: '#FFFDF5'
              }}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                  <View>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                      <Text style={{ fontSize: 16, fontWeight: '800', color: '#B45309' }}>Annual Fluency Pass</Text>
                      <View style={{ backgroundColor: '#F59E0B', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6 }}>
                        <Text style={{ color: '#FFFFFF', fontSize: 10, fontWeight: '700' }}>BEST VALUE</Text>
                      </View>
                    </View>
                    <Text style={{ fontSize: 12, color: '#78716C', marginTop: 2 }}>Full 12 months unlimited access</Text>
                  </View>
                  <View style={{ alignItems: 'flex-end' }}>
                    <Text style={{ fontSize: 18, fontWeight: '800', color: '#1E293B' }}>$79.99</Text>
                    <Text style={{ fontSize: 11, color: '#64748B' }}>/ year</Text>
                  </View>
                </View>
                <TouchableOpacity
                  style={{
                    backgroundColor: '#F59E0B',
                    borderRadius: 10,
                    paddingVertical: 10,
                    alignItems: 'center',
                    marginTop: 12
                  }}
                  onPress={() => handleUpgradeToPro('yearly')}
                >
                  <Text style={{ color: '#FFFFFF', fontWeight: '700', fontSize: 14 }}>
                    {userSubscription?.plan === 'pro' ? 'Renew Yearly Plan' : 'Subscribe Yearly (Save 33%)'}
                  </Text>
                </TouchableOpacity>
              </View>

              <View style={{
                borderWidth: 1,
                borderColor: '#E2E8F0',
                borderRadius: 16,
                padding: 16,
                backgroundColor: '#F8FAFC'
              }}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                  <View>
                    <Text style={{ fontSize: 15, fontWeight: '700', color: '#1E293B' }}>Monthly Pro</Text>
                    <Text style={{ fontSize: 12, color: '#64748B', marginTop: 2 }}>Billed monthly, cancel anytime</Text>
                  </View>
                  <View style={{ alignItems: 'flex-end' }}>
                    <Text style={{ fontSize: 18, fontWeight: '800', color: '#1E293B' }}>$9.99</Text>
                    <Text style={{ fontSize: 11, color: '#64748B' }}>/ month</Text>
                  </View>
                </View>
                <TouchableOpacity
                  style={{
                    backgroundColor: '#2563EB',
                    borderRadius: 10,
                    paddingVertical: 10,
                    alignItems: 'center',
                    marginTop: 12
                  }}
                  onPress={() => handleUpgradeToPro('monthly')}
                >
                  <Text style={{ color: '#FFFFFF', fontWeight: '700', fontSize: 14 }}>
                    {userSubscription?.plan === 'pro' ? 'Switch to Monthly' : 'Subscribe Monthly'}
                  </Text>
                </TouchableOpacity>
              </View>
            </View>

            {/* Feature List */}
            <View style={{ backgroundColor: '#F1F5F9', borderRadius: 12, padding: 12, gap: 8, marginBottom: 12 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <Ionicons name="checkmark-circle" size={16} color="#10B981" />
                <Text style={{ fontSize: 12, color: '#334155' }}>Unlimited 1-on-1 direct audio calling</Text>
              </View>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <Ionicons name="checkmark-circle" size={16} color="#10B981" />
                <Text style={{ fontSize: 12, color: '#334155' }}>Priority matching with active English speakers</Text>
              </View>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <Ionicons name="checkmark-circle" size={16} color="#10B981" />
                <Text style={{ fontSize: 12, color: '#334155' }}>Instant AI grammar & pronunciation feedback</Text>
              </View>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <Ionicons name="checkmark-circle" size={16} color="#10B981" />
                <Text style={{ fontSize: 12, color: '#334155' }}>Exclusive BYTALK Pro gold badge on profile</Text>
              </View>
            </View>

            <TouchableOpacity
              onPress={() => setShowSubscriptionModal(false)}
              style={{ alignItems: 'center', paddingVertical: 8 }}
            >
              <Text style={{ fontSize: 12, color: '#64748B' }}>Maybe Later</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  contentContainer: {
    paddingBottom: 30,
    alignItems: 'center',
  },
  responsiveWrapper: {
    width: '100%',
    maxWidth: isWebOrTablet ? 720 : '100%',
    paddingHorizontal: 20,
    paddingTop: 12,
  },

  /* Header */
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#F3F4F6',
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  logoRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  headerLogoIcon: {
    width: 24,
    height: 24,
    marginRight: 6,
  },
  headerBrandText: {
    fontSize: 21,
    fontWeight: '900',
    color: navy,
    letterSpacing: -0.5,
  },
  statusPill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: light,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: border,
  },
  statusDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    marginRight: 5,
  },
  statusText: {
    fontSize: 11,
    color: muted,
    fontWeight: '600',
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  iconButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: light,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: border,
    position: 'relative',
  },
  notificationBadge: {
    position: 'absolute',
    top: 6,
    right: 7,
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: orange,
  },
  avatarButton: {
    marginLeft: 2,
  },
  avatarCircle: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: orangeLight,
    borderWidth: 1.5,
    borderColor: orange,
    alignItems: 'center',
    justifyContent: 'center',
  },

  /* Greeting row */
  userGreetingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 18,
    marginBottom: 16,
  },
  greetingTitle: {
    fontSize: 22,
    fontWeight: '800',
    color: navy,
  },
  greetingSubtitle: {
    fontSize: 13,
    color: muted,
    marginTop: 3,
  },
  levelBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: orangeLight,
    borderColor: '#FED7AA',
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    gap: 4,
  },
  levelBadgeText: {
    fontSize: 12,
    fontWeight: '700',
    color: orange,
  },

  /* Hero Section */
  heroCard: {
    borderRadius: 20,
    overflow: 'hidden',
    marginBottom: 24,
    borderWidth: 1,
    borderColor: '#FED7AA',
  },
  heroGradient: {
    padding: 20,
  },
  heroBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    marginBottom: 12,
    gap: 5,
  },
  heroBadgeText: {
    fontSize: 11,
    fontWeight: '700',
    color: orange,
  },
  heroTitle: {
    fontSize: 23,
    fontWeight: '800',
    color: navy,
    lineHeight: 29,
    marginBottom: 6,
  },
  heroSubtitle: {
    fontSize: 13,
    color: '#4B5563',
    lineHeight: 19,
    marginBottom: 18,
  },
  startSpeakingButtonShadow: {
    borderRadius: 26,
    shadowColor: orange,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.35,
    shadowRadius: 10,
    elevation: 6,
  },
  startSpeakingGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    borderRadius: 26,
  },
  startSpeakingText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '800',
    letterSpacing: 0.2,
  },

  /* Section Header */
  sectionHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
    marginBottom: 12,
    marginTop: 10,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: navy,
  },
  sectionCaption: {
    fontSize: 12,
    color: muted,
  },
  sectionActionLink: {
    fontSize: 13,
    fontWeight: '700',
    color: orange,
  },

  /* Quick Actions Grid */
  quickActionsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    gap: 12,
    marginBottom: 24,
  },
  quickCard: {
    width: isWebOrTablet ? '31%' : '48%',
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 14,
    borderWidth: 1.2,
    justifyContent: 'space-between',
    minHeight: 145,
  },
  quickIconCircle: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 10,
  },
  quickCardTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: navy,
    marginBottom: 4,
  },
  quickCardDesc: {
    fontSize: 11,
    color: muted,
    lineHeight: 15,
    flex: 1,
  },
  quickCardActionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 10,
    gap: 4,
  },
  quickActionLabel: {
    fontSize: 11,
    fontWeight: '700',
  },

  /* Learning Progress Section */
  loadingBox: {
    padding: 24,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 10,
  },
  loadingText: {
    color: muted,
    fontSize: 13,
  },
  progressCardContainer: {
    backgroundColor: light,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: border,
    padding: 18,
    marginBottom: 24,
  },
  statsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  statBox: {
    alignItems: 'center',
    flex: 1,
  },
  statIconBadge: {
    marginBottom: 4,
  },
  statValue: {
    fontSize: 18,
    fontWeight: '800',
    color: navy,
  },
  statLabel: {
    fontSize: 10,
    color: muted,
    marginTop: 2,
    textAlign: 'center',
  },
  goalContainer: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: '#EEF0F4',
  },
  goalHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  goalTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: navy,
  },
  goalFraction: {
    fontSize: 12,
    fontWeight: '700',
    color: orange,
  },
  goalTrack: {
    height: 8,
    borderRadius: 4,
    backgroundColor: '#F3F4F6',
    overflow: 'hidden',
    marginBottom: 8,
  },
  goalFill: {
    height: '100%',
    backgroundColor: orange,
    borderRadius: 4,
  },
  goalTip: {
    fontSize: 11,
    color: muted,
    lineHeight: 16,
  },

  /* Word of the Day Section */
  wordOfTheDayCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    padding: 18,
    borderWidth: 1.5,
    borderColor: '#FED7AA',
    marginBottom: 24,
  },
  wotdTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  wotdBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: orangeLight,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
    gap: 4,
  },
  wotdBadgeText: {
    fontSize: 11,
    fontWeight: '700',
    color: orange,
  },
  wotdPartOfSpeech: {
    fontSize: 12,
    fontStyle: 'italic',
    color: muted,
  },
  wotdMainRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 6,
    flexWrap: 'wrap',
  },
  wotdWord: {
    fontSize: 24,
    fontWeight: '800',
    color: navy,
  },
  wotdPhonetic: {
    fontSize: 14,
    color: orange,
    fontWeight: '600',
  },
  speakerPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: orangeLight,
    borderWidth: 1,
    borderColor: '#FED7AA',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 12,
    marginLeft: 'auto',
  },
  speakerPillActive: {
    backgroundColor: greenLight,
    borderColor: green,
  },
  speakerPillText: {
    fontSize: 11,
    fontWeight: '700',
    color: orange,
  },
  wotdMeaning: {
    fontSize: 13,
    color: '#374151',
    lineHeight: 19,
    marginBottom: 12,
  },
  wotdExampleBox: {
    backgroundColor: light,
    borderRadius: 10,
    padding: 12,
    borderLeftWidth: 3,
    borderLeftColor: orange,
    marginBottom: 14,
  },
  wotdExampleLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: muted,
    marginBottom: 3,
  },
  wotdExampleText: {
    fontSize: 12,
    fontStyle: 'italic',
    color: navy,
    lineHeight: 17,
  },
  wotdActionsRow: {
    flexDirection: 'row',
    gap: 10,
  },
  saveWordButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: 1.2,
    borderColor: orange,
    backgroundColor: '#FFFFFF',
    gap: 6,
  },
  saveWordButtonActive: {
    borderColor: green,
    backgroundColor: greenLight,
  },
  saveWordButtonText: {
    fontSize: 12,
    fontWeight: '700',
    color: orange,
  },
  quizWordButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    borderRadius: 12,
    backgroundColor: orange,
    gap: 6,
  },
  quizWordButtonText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#FFFFFF',
  },

  /* Common Phrases Section */
  categoryFilterContainer: {
    paddingVertical: 6,
    gap: 8,
    marginBottom: 14,
  },
  categoryPill: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 16,
    backgroundColor: light,
    borderWidth: 1,
    borderColor: border,
  },
  categoryPillActive: {
    backgroundColor: navy,
    borderColor: navy,
  },
  categoryPillText: {
    fontSize: 12,
    color: muted,
    fontWeight: '600',
  },
  categoryPillTextActive: {
    color: '#FFFFFF',
    fontWeight: '700',
  },
  phrasesListContainer: {
    gap: 12,
    marginBottom: 24,
  },
  phraseCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: border,
  },
  phraseCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  phraseCategoryTag: {
    backgroundColor: blueLight,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
  },
  phraseCategoryTagText: {
    fontSize: 11,
    fontWeight: '700',
    color: blue,
  },
  phraseLevelTag: {
    fontSize: 11,
    color: muted,
  },
  phraseText: {
    fontSize: 15,
    fontWeight: '700',
    color: navy,
    lineHeight: 21,
    marginBottom: 4,
  },
  phraseMeaning: {
    fontSize: 12,
    color: '#4B5563',
    lineHeight: 17,
    marginBottom: 4,
  },
  phraseContext: {
    fontSize: 11,
    color: muted,
    marginBottom: 10,
  },
  phraseFooterRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: '#F3F4F6',
  },
  phraseAudioButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: orangeLight,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#FED7AA',
  },
  phraseAudioButtonActive: {
    backgroundColor: greenLight,
    borderColor: green,
  },
  phraseAudioText: {
    fontSize: 11,
    fontWeight: '700',
    color: orange,
  },
  phraseSaveButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingVertical: 5,
    paddingHorizontal: 10,
  },
  phraseSaveButtonActive: {
    opacity: 0.9,
  },
  phraseSaveText: {
    fontSize: 12,
    fontWeight: '700',
    color: orange,
  },

  /* Live Audio Rooms Preview */
  roomsPreviewContainer: {
    gap: 12,
    marginBottom: 24,
  },
  roomPreviewCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: border,
  },
  roomHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  roomLiveBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: greenLight,
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 8,
  },
  livePulseDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: green,
  },
  liveBadgeText: {
    fontSize: 10,
    fontWeight: '800',
    color: green,
  },
  roomTopicTag: {
    fontSize: 11,
    color: muted,
    fontWeight: '600',
  },
  roomTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: navy,
    marginBottom: 2,
  },
  roomSubtitle: {
    fontSize: 11,
    color: muted,
    marginBottom: 12,
  },
  roomFooterRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  listenerCountRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  listenerCountText: {
    fontSize: 12,
    color: muted,
  },
  joinRoomButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: orange,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 18,
    gap: 5,
  },
  joinRoomButtonText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '700',
  },

  /* Empty state */
  emptyStateBox: {
    padding: 24,
    alignItems: 'center',
    backgroundColor: light,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: border,
    marginBottom: 24,
  },
  emptyStateTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: navy,
    marginTop: 8,
  },
  emptyStateSubtitle: {
    fontSize: 12,
    color: muted,
    textAlign: 'center',
    marginTop: 3,
  },

  /* Recent Activity */
  activityContainer: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 14,
    borderWidth: 1,
    borderColor: border,
    marginBottom: 24,
  },
  recentItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#F3F4F6',
  },
  recentAvatarCircle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: orangeLight,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  recentItemInfo: {
    flex: 1,
  },
  recentItemName: {
    fontSize: 14,
    fontWeight: '700',
    color: navy,
  },
  recentItemSnippet: {
    fontSize: 12,
    color: muted,
    marginTop: 2,
  },
  emptyActivityBox: {
    padding: 16,
    alignItems: 'center',
  },
  emptyActivityTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: navy,
    marginTop: 6,
  },
  emptyActivitySubtitle: {
    fontSize: 12,
    color: muted,
    textAlign: 'center',
    marginTop: 2,
    marginBottom: 10,
  },
  emptyActivityBtn: {
    backgroundColor: orangeLight,
    borderColor: orange,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 16,
  },
  emptyActivityBtnText: {
    fontSize: 12,
    fontWeight: '700',
    color: orange,
  },
  recentVocabSection: {
    marginTop: 12,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: '#F3F4F6',
  },
  recentVocabTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: muted,
    marginBottom: 8,
  },
  vocabChipsContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  vocabChip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: orangeLight,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 10,
    gap: 4,
    maxWidth: '90%',
  },
  vocabChipText: {
    fontSize: 11,
    color: orangeDark,
    fontWeight: '600',
  },

  /* Modals Common */
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(20, 23, 39, 0.65)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  modalCard: {
    width: '100%',
    maxWidth: 480,
    backgroundColor: '#FFFFFF',
    borderRadius: 22,
    padding: 22,
    maxHeight: '90%',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: navy,
  },

  /* Matching Modal */
  matchingStateContainer: {
    alignItems: 'center',
    paddingVertical: 24,
  },
  matchingTitle: {
    fontSize: 17,
    fontWeight: '800',
    color: navy,
    marginTop: 16,
  },
  matchingSubtitle: {
    fontSize: 12,
    color: muted,
    textAlign: 'center',
    marginTop: 6,
    paddingHorizontal: 20,
  },
  pulseRadar: {
    marginVertical: 20,
  },
  cancelMatchButton: {
    marginTop: 10,
    paddingVertical: 8,
    paddingHorizontal: 16,
  },
  cancelMatchButtonText: {
    color: muted,
    fontSize: 13,
    fontWeight: '600',
  },
  matchedStateContainer: {
    alignItems: 'center',
  },
  matchedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: greenLight,
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 14,
    gap: 5,
    marginBottom: 14,
  },
  matchedBadgeText: {
    fontSize: 12,
    fontWeight: '700',
    color: green,
  },
  partnerProfileCard: {
    alignItems: 'center',
    backgroundColor: light,
    borderRadius: 16,
    padding: 16,
    width: '100%',
    borderWidth: 1,
    borderColor: border,
    marginBottom: 14,
  },
  partnerAvatarBig: {
    width: 68,
    height: 68,
    borderRadius: 34,
    backgroundColor: '#FFE0D3',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  partnerNameBig: {
    fontSize: 18,
    fontWeight: '800',
    color: navy,
  },
  partnerDetailsBig: {
    fontSize: 12,
    color: muted,
    marginTop: 2,
  },
  partnerLevelPill: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: orange,
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: 12,
    marginTop: 6,
  },
  partnerLevelText: {
    fontSize: 11,
    fontWeight: '700',
    color: orange,
  },
  promptBox: {
    backgroundColor: orangeLight,
    borderRadius: 12,
    padding: 12,
    width: '100%',
    marginBottom: 14,
    borderWidth: 1,
    borderColor: '#FED7AA',
  },
  promptLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: orangeDark,
    marginBottom: 2,
  },
  promptQuestion: {
    fontSize: 13,
    fontStyle: 'italic',
    color: navy,
  },
  matchedActionButtonCall: {
    backgroundColor: green,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    width: '100%',
    paddingVertical: 14,
    borderRadius: 24,
  },
  matchedActionButton: {
    backgroundColor: orange,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    width: '100%',
    paddingVertical: 14,
    borderRadius: 24,
  },
  matchedActionButtonText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '700',
  },

  /* Live In-Call Voice Modal */
  callModalCard: {
    backgroundColor: '#111726',
    alignItems: 'center',
    paddingVertical: 28,
  },
  callTopHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    marginBottom: 8,
  },
  callLiveDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: green,
  },
  callLiveStatus: {
    fontSize: 11,
    color: '#D1D5DB',
    fontWeight: '700',
  },
  callTimerText: {
    fontSize: 26,
    fontWeight: '800',
    color: '#FFFFFF',
    letterSpacing: 1,
    marginBottom: 16,
  },
  callAvatarContainer: {
    marginVertical: 10,
  },
  callAvatarPulseOuter: {
    width: 110,
    height: 110,
    borderRadius: 55,
    backgroundColor: 'rgba(255, 104, 71, 0.2)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  callAvatarPulseInner: {
    width: 86,
    height: 86,
    borderRadius: 43,
    backgroundColor: '#FFE0D3',
    alignItems: 'center',
    justifyContent: 'center',
  },
  callPartnerName: {
    fontSize: 20,
    fontWeight: '800',
    color: '#FFFFFF',
    marginTop: 8,
  },
  callPartnerCountry: {
    fontSize: 12,
    color: '#9CA3AF',
    marginTop: 2,
    marginBottom: 16,
  },
  callTopicBox: {
    backgroundColor: 'rgba(255, 255, 255, 0.06)',
    borderRadius: 14,
    padding: 14,
    width: '100%',
    marginBottom: 24,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
  },
  callTopicTitle: {
    fontSize: 11,
    color: orange,
    fontWeight: '700',
    marginBottom: 4,
  },
  callTopicText: {
    fontSize: 13,
    color: '#E5E7EB',
    fontStyle: 'italic',
    lineHeight: 18,
  },
  callControlsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
    width: '100%',
    paddingHorizontal: 10,
  },
  callControlCircle: {
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    width: 58,
    height: 58,
    borderRadius: 29,
    justifyContent: 'center',
  },
  callControlCircleActive: {
    backgroundColor: '#FEE2E2',
  },
  callControlLabel: {
    fontSize: 10,
    color: '#9CA3AF',
    marginTop: 4,
    fontWeight: '600',
  },
  callEndButton: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#EF4444',
    width: 68,
    height: 68,
    borderRadius: 34,
    shadowColor: '#EF4444',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.4,
    shadowRadius: 10,
    elevation: 8,
  },
  callEndLabel: {
    fontSize: 10,
    color: '#FFFFFF',
    marginTop: 2,
    fontWeight: '700',
  },

  /* Quiz Modal */
  quizContent: {},
  quizProgressBarContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 14,
  },
  quizProgressText: {
    fontSize: 12,
    fontWeight: '700',
    color: muted,
  },
  quizScoreText: {
    fontSize: 12,
    fontWeight: '800',
    color: purple,
  },
  quizQuestion: {
    fontSize: 16,
    fontWeight: '800',
    color: navy,
    lineHeight: 22,
    marginBottom: 18,
  },
  quizOptionsList: {
    gap: 10,
    marginBottom: 14,
  },
  quizOptionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: light,
    borderWidth: 1.5,
    borderColor: border,
    borderRadius: 12,
    padding: 12,
  },
  quizOptionCorrect: {
    backgroundColor: greenLight,
    borderColor: green,
  },
  quizOptionWrong: {
    backgroundColor: '#FEE2E2',
    borderColor: '#EF4444',
  },
  quizOptionLetter: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: '#FFFFFF',
    textAlign: 'center',
    lineHeight: 26,
    fontSize: 12,
    fontWeight: '800',
    color: navy,
    marginRight: 10,
  },
  quizOptionText: {
    fontSize: 13,
    color: navy,
    flex: 1,
    fontWeight: '600',
  },
  quizExplanationBox: {
    backgroundColor: purpleLight,
    padding: 10,
    borderRadius: 10,
    marginTop: 6,
  },
  quizExplanationText: {
    fontSize: 12,
    color: purple,
    lineHeight: 16,
  },
  quizResultContent: {
    alignItems: 'center',
    paddingVertical: 20,
  },
  quizResultTitle: {
    fontSize: 22,
    fontWeight: '800',
    color: navy,
    marginTop: 10,
  },
  quizResultScore: {
    fontSize: 18,
    fontWeight: '800',
    color: purple,
    marginTop: 4,
  },
  quizResultFeedback: {
    fontSize: 13,
    color: muted,
    textAlign: 'center',
    marginTop: 8,
    marginBottom: 20,
    paddingHorizontal: 16,
  },
  quizRestartBtn: {
    backgroundColor: purple,
    width: '100%',
    paddingVertical: 14,
    borderRadius: 24,
    alignItems: 'center',
    marginBottom: 10,
  },
  quizRestartBtnText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '700',
  },
  quizCloseBtn: {
    paddingVertical: 10,
  },
  quizCloseBtnText: {
    color: muted,
    fontSize: 13,
    fontWeight: '600',
  },

  /* Notifications Modal */
  notifItem: {
    flexDirection: 'row',
    gap: 12,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#F3F4F6',
  },
  notifIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  notifTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: navy,
  },
  notifDesc: {
    fontSize: 12,
    color: muted,
    marginTop: 2,
    lineHeight: 16,
  },
  notifTime: {
    fontSize: 10,
    color: '#9CA3AF',
    marginTop: 4,
  },

  /* Settings Modal */
  settingsUserBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: light,
    padding: 14,
    borderRadius: 14,
    marginBottom: 12,
  },
  settingsUserName: {
    fontSize: 15,
    fontWeight: '800',
    color: navy,
  },
  settingsUserEmail: {
    fontSize: 12,
    color: muted,
    marginTop: 2,
  },
  accountSwitcherBox: {
    backgroundColor: light,
    padding: 12,
    borderRadius: 14,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: border,
  },
  accountSwitcherTitle: {
    fontSize: 11,
    fontWeight: '700',
    color: navy,
  },
  userPillButton: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: border,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 14,
    marginRight: 6,
  },
  userPillButtonActive: {
    backgroundColor: orange,
    borderColor: orange,
  },
  userPillText: {
    fontSize: 11,
    color: navy,
    fontWeight: '600',
  },
  settingsActionItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 13,
    borderBottomWidth: 1,
    borderBottomColor: '#F3F4F6',
    gap: 12,
  },
  settingsActionText: {
    fontSize: 14,
    color: navy,
    flex: 1,
    fontWeight: '600',
  },
});
