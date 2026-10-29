import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  SafeAreaView,
  StatusBar,
  Platform,
  Alert,
  Image,
  StyleSheet,
  Dimensions,
  Modal,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { io } from 'socket.io-client';

import UserDashboard from './src/components/UserDashboard';
import webrtcService from './src/services/webrtcService';
import audioService from './src/services/audioService';
import { getApiBaseUrl, API_BASE_URL } from './src/config';

const { height: screenHeight } = Dimensions.get('window');
const API = getApiBaseUrl();

const orange = '#FF6847';
const orangeDark = '#FF5226';
const orangeLight = '#FFF4EE';
const navy = '#141727';
const muted = '#6B7280';
const light = '#F8FAFC';
const border = '#E5E7EB';

const fallbackPartners = [
  { id: 'u2', name: 'Yuki', alias: 'YukiTokyo', country: 'Japan', nativeLanguage: 'Japanese', learningLanguage: 'English', level: 'Intermediate', online: true },
  { id: 'u3', name: 'Lucas', alias: 'LucasRio', country: 'Brazil', nativeLanguage: 'Portuguese', learningLanguage: 'English', level: 'Beginner', online: true },
  { id: 'u4', name: 'Minji', alias: 'MinjiSeoul', country: 'South Korea', nativeLanguage: 'Korean', learningLanguage: 'English', level: 'Intermediate', online: true },
  { id: 'u5', name: 'Carlos', alias: 'CarlosMex', country: 'Mexico', nativeLanguage: 'Spanish', learningLanguage: 'English', level: 'Intermediate', online: true },
  { id: 'u6', name: 'Aditi', alias: 'Aditi_In', country: 'India', nativeLanguage: 'Hindi', learningLanguage: 'English', level: 'Beginner', online: true },
];

const fallbackRooms = [
  { id: 'r1', name: 'Everyday English', topic: 'Daily English', level: 'Beginner - Intermediate', listeners: 24, capacity: 50, speakers: ['u1'] },
  { id: 'r2', name: 'Job Interview Practice', topic: 'Interviews', level: 'Intermediate - Advanced', listeners: 18, capacity: 30, speakers: ['u2'] },
  { id: 'r3', name: 'IELTS Speaking Prep', topic: 'IELTS Practice', level: 'All levels', listeners: 32, capacity: 50, speakers: ['u4'] },
  { id: 'r4', name: 'Travel & Free Conversation', topic: 'Travel', level: 'Beginner - Intermediate', listeners: 12, capacity: 40, speakers: [] },
];

async function request(endpoint, options = {}, token = null) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const response = await fetch(`${API}/api/${endpoint}`, {
    ...options,
    headers: { ...headers, ...(options.headers || {}) },
  });
  if (!response.ok) {
    const err = await response.json().catch(() => ({ error: 'Unable to connect to server' }));
    throw new Error(err.error || 'Request failed');
  }
  return response.json();
}

const Txt = ({ children, size = 14, color = navy, bold = false, style = {} }) => (
  <Text style={{ fontSize: size, color, fontWeight: bold ? '700' : '400', ...style }}>{children}</Text>
);

const Btn = ({ label, onPress, outline = false, style = {} }) => (
  <TouchableOpacity
    onPress={onPress}
    activeOpacity={0.85}
    style={{
      backgroundColor: outline ? '#fff' : orange,
      borderWidth: outline ? 1.5 : 0,
      borderColor: orange,
      paddingVertical: 15,
      paddingHorizontal: 20,
      borderRadius: 26,
      alignItems: 'center',
      justifyContent: 'center',
      ...style,
    }}
  >
    <Txt color={outline ? orange : '#fff'} bold size={15}>{label}</Txt>
  </TouchableOpacity>
);

const Header = ({ title, subtitle, onBack }) => (
  <View style={{ paddingHorizontal: 22, paddingTop: 14, paddingBottom: 14 }}>
    {onBack && (
      <TouchableOpacity onPress={onBack} style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 12 }}>
        <Ionicons name="arrow-back" size={20} color={navy} />
        <Txt size={14} color={muted} style={{ marginLeft: 6 }}>Back</Txt>
      </TouchableOpacity>
    )}
    <Txt size={24} bold>{title}</Txt>
    {subtitle && <Txt color={muted} size={13} style={{ marginTop: 4 }}>{subtitle}</Txt>}
  </View>
);

const Field = ({ label, value, setValue, placeholder, secureTextEntry = false }) => (
  <View style={{ marginBottom: 16 }}>
    <Txt size={13} bold style={{ marginBottom: 6 }}>{label}</Txt>
    <TextInput
      value={value}
      onChangeText={setValue}
      placeholder={placeholder}
      placeholderTextColor="#9CA3AF"
      secureTextEntry={secureTextEntry}
      style={{
        backgroundColor: light,
        borderRadius: 14,
        padding: 14,
        fontSize: 15,
        borderColor: border,
        borderWidth: 1,
        color: navy,
      }}
    />
  </View>
);

function App() {
  const [screen, setScreen] = useState('welcome');
  const [authToken, setAuthToken] = useState(null);

  // Authenticated user state
  const [currentUser, setCurrentUser] = useState({
    id: 'u1',
    name: 'Vedant Kengale',
    alias: 'VedantK',
    email: 'vedant@bytalk.app',
    country: 'India',
    nativeLanguage: 'Hindi',
    learningLanguage: 'English',
    level: 'Intermediate',
    streak: 12,
    minutes: 150,
    words: 28,
    referralCode: 'BYTALK-VEDANT',
    referredCount: 3,
    savedPhrases: ['phr_work_1', 'phr_int_1'],
    blockedUsers: []
  });

  // Form states
  const [name, setName] = useState(currentUser.name);
  const [alias, setAlias] = useState(currentUser.alias || 'VedantK');
  const [country, setCountry] = useState(currentUser.country);
  const [nativeLanguage, setNativeLanguage] = useState(currentUser.nativeLanguage);
  const [learningLanguage, setLearningLanguage] = useState(currentUser.learningLanguage);
  const [level, setLevel] = useState(currentUser.level);
  const [goals, setGoals] = useState('Daily Conversation');

  // Sign in / Sign up states
  const [signInEmail, setSignInEmail] = useState('');
  const [signInPassword, setSignInPassword] = useState('');
  const [signUpName, setSignUpName] = useState('');
  const [signUpEmail, setSignUpEmail] = useState('');
  const [signUpPassword, setSignUpPassword] = useState('');
  const [signUpConfirm, setSignUpConfirm] = useState('');

  // Collections & state
  const [partners, setPartners] = useState(fallbackPartners);
  const [rooms, setRooms] = useState(fallbackRooms);
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState(fallbackPartners[0]);
  const [messages, setMessages] = useState([]);
  const [draft, setDraft] = useState('');
  const [filter, setFilter] = useState('All');
  const [vocab, setVocab] = useState([]);
  const [backendUp, setBackendUp] = useState(false);
  const [busy, setBusy] = useState(false);

  // Modals
  const [showSafetyModal, setShowSafetyModal] = useState(false);
  const [showCreateRoomModal, setShowCreateRoomModal] = useState(false);
  const [newRoomName, setNewRoomName] = useState('');
  const [newRoomTopic, setNewRoomTopic] = useState('Daily English');
  const [newRoomCapacity, setNewRoomCapacity] = useState('50');

  const [showReferralModal, setShowReferralModal] = useState(false);
  const [inputReferralCode, setInputReferralCode] = useState('');

  const [allUsers, setAllUsers] = useState([
    { id: 'u1', name: 'Pavan Nerkar', alias: 'PavanN', email: 'pavan@bytalk.app', country: 'India', level: 'Intermediate' },
    { id: 'u2', name: 'Yuki', alias: 'YukiTokyo', email: 'yuki@bytalk.app', country: 'Japan', level: 'Intermediate' },
    { id: 'u3', name: 'Lucas', alias: 'LucasRio', email: 'lucas@bytalk.app', country: 'Brazil', level: 'Beginner' },
    { id: 'u4', name: 'Minji', alias: 'MinjiSeoul', email: 'minji@bytalk.app', country: 'South Korea', level: 'Intermediate' },
    { id: 'u5', name: 'Carlos', alias: 'CarlosMex', email: 'carlos@bytalk.app', country: 'Mexico', level: 'Intermediate' },
    { id: 'u6', name: 'Aditi', alias: 'Aditi_In', email: 'aditi@bytalk.app', country: 'India', level: 'Beginner' },
  ]);

  const refresh = async () => {
    try {
      const [p, r, v, u] = await Promise.all([
        request('partners'),
        request('rooms'),
        request(`vocabulary/${currentUser.id}`).catch(() => []),
        request('users').catch(() => [])
      ]);
      setPartners(p.length > 0 ? p : fallbackPartners);
      setRooms(r.length > 0 ? r : fallbackRooms);
      setVocab(v);
      if (u && Array.isArray(u) && u.length > 0) setAllUsers(u);
      setBackendUp(true);
    } catch {
      setBackendUp(false);
    }
  };

  useEffect(() => {
    refresh();
    const socket = io(API, { transports: ['websocket', 'polling'] });
    socket.emit('user:online', { userId: currentUser.id });

    socket.on('message:new', (m) => {
      setMessages((prev) => (prev.some((x) => x.id === m.id) ? prev : [...prev, m]));
    });

    socket.on('rooms:changed', (updatedRooms) => {
      setRooms(updatedRooms);
    });

    return () => socket.disconnect();
  }, [currentUser.id]);

  useEffect(() => {
    if (screen === 'chat' && selected) {
      request(`messages/${currentUser.id}/${selected.id}`)
        .then(setMessages)
        .catch(() => setMessages([]));
    }
  }, [selected, screen, currentUser.id]);

  // Handle Sign In (Section 5)
  const handleSignIn = async () => {
    if (!signInEmail.trim() || !signInPassword.trim()) {
      Alert.alert('Missing fields', 'Please enter your email and password.');
      return;
    }
    setBusy(true);
    try {
      const res = await request('auth/login', {
        method: 'POST',
        body: JSON.stringify({ identifier: signInEmail, password: signInPassword }),
      });
      if (res.token && res.user) {
        setAuthToken(res.token);
        setCurrentUser(res.user);
        setName(res.user.name || '');
        setAlias(res.user.alias || res.user.name?.split(' ')[0] || '');
        setCountry(res.user.country || 'India');
        setNativeLanguage(res.user.nativeLanguage || 'Hindi');
        setLearningLanguage(res.user.learningLanguage || 'English');
        setLevel(res.user.level || 'Intermediate');
        if (res.user.goals) setGoals(res.user.goals);
        setBackendUp(true);
        setScreen('home');
      }
    } catch (err) {
      // Offline fallback login for presentation preview
      Alert.alert('Notice', 'Signing in with local session.');
      setCurrentUser((prev) => ({ ...prev, email: signInEmail }));
      setScreen('home');
    } finally {
      setBusy(false);
    }
  };

  // Handle Sign Up (Section 5)
  const handleSignUp = async () => {
    if (!signUpName.trim() || !signUpEmail.trim() || !signUpPassword.trim()) {
      Alert.alert('Missing fields', 'Please fill in all registration fields.');
      return;
    }
    if (signUpPassword !== signUpConfirm) {
      Alert.alert('Password mismatch', 'Passwords do not match.');
      return;
    }
    setBusy(true);
    try {
      const res = await request('auth/register', {
        method: 'POST',
        body: JSON.stringify({
          name: signUpName,
          email: signUpEmail,
          password: signUpPassword,
        }),
      });
      if (res.token && res.user) {
        setAuthToken(res.token);
        setCurrentUser(res.user);
        setName(res.user.name);
        setBackendUp(true);
        setScreen('level');
      }
    } catch (err) {
      Alert.alert('Notice', 'Creating account in local session.');
      setCurrentUser((prev) => ({ ...prev, name: signUpName, email: signUpEmail }));
      setScreen('level');
    } finally {
      setBusy(false);
    }
  };

  // Save profile updates
  async function saveProfile(next = 'home') {
    setBusy(true);
    try {
      await request('me', {
        method: 'PATCH',
        body: JSON.stringify({ name, alias, country, nativeLanguage, learningLanguage, level, goals }),
      }, authToken);
      setCurrentUser((prev) => ({ ...prev, name, alias, country, nativeLanguage, learningLanguage, level, goals }));
      setBackendUp(true);
      Alert.alert('Profile Updated', 'Your profile details and conversation preferences have been saved.');
    } catch {
      setCurrentUser((prev) => ({ ...prev, name, alias, country, nativeLanguage, learningLanguage, level, goals }));
      Alert.alert('Saved', 'Profile updated for your current session.');
    }
    setBusy(false);
    setScreen(next);
  }

  // Send Direct Message (Section 7)
  async function send() {
    if (!draft.trim()) return;
    const text = draft.trim();
    setDraft('');
    try {
      const result = await request('messages', {
        method: 'POST',
        body: JSON.stringify({ from: currentUser.id, to: selected.id, text }),
      });
      setMessages((prev) => (prev.some((x) => x.id === result.id) ? prev : [...prev, result]));
    } catch {
      Alert.alert('Offline notice', 'Message stored locally.');
      const localMsg = { id: `m_${Date.now()}`, from: currentUser.id, to: selected.id, text, at: new Date().toISOString() };
      setMessages((prev) => [...prev, localMsg]);
    }
  }

  // Join Room (Section 8 & 9)
  async function join(room) {
    try {
      await request(`rooms/${room.id}/join`, { method: 'POST' });
      Alert.alert('Joined Audio Room', `You're now listening to "${room.name}". Microphones stay disabled by default.`);
      refresh();
    } catch {
      Alert.alert('Joined Demo Room', `You're listening to "${room.name}".`);
    }
  }

  // Request to speak / Raise Hand in Room (Section 8 & 9)
  async function handleRaiseHand(room) {
    try {
      await request(`rooms/${room.id}/raise-hand`, {
        method: 'POST',
        body: JSON.stringify({ userId: currentUser.id })
      });
      Alert.alert('Request Sent', 'Your request to speak has been sent to the room host.');
      refresh();
    } catch (err) {
      Alert.alert('Speaker Request', 'Speaker request queued.');
    }
  }

  // Create New Room (Section 8)
  async function handleCreateRoom() {
    if (!newRoomName.trim()) {
      Alert.alert('Required', 'Please enter a room name.');
      return;
    }
    try {
      await request('rooms', {
        method: 'POST',
        body: JSON.stringify({
          name: newRoomName.trim(),
          topic: newRoomTopic,
          level: 'All levels',
          capacity: Number(newRoomCapacity) || 50,
          hostId: currentUser.id
        })
      });
      setShowCreateRoomModal(false);
      setNewRoomName('');
      Alert.alert('Room Created', 'Your live audio room is now open for practice.');
      refresh();
    } catch {
      Alert.alert('Notice', 'Room created in session.');
      setShowCreateRoomModal(false);
    }
  }

  // Add Vocabulary Word / Phrase (Section 10 & 11)
  async function addWord(wordText) {
    if (!wordText || !wordText.trim()) return;
    try {
      const item = await request('vocabulary', {
        method: 'POST',
        body: JSON.stringify({ userId: currentUser.id, word: wordText.trim(), category: 'Saved Practice' }),
      });
      setVocab((v) => [...v, item]);
      setCurrentUser((prev) => ({ ...prev, words: (prev.words || 0) + 1 }));
    } catch {
      setVocab((v) => [...v, { id: `v_${Date.now()}`, word: wordText, category: 'Saved' }]);
    }
  }

  // Claim Referral Code (Section 15)
  async function handleClaimReferral() {
    if (!inputReferralCode.trim()) return;
    try {
      const res = await request('referrals/claim', {
        method: 'POST',
        body: JSON.stringify({ referralCode: inputReferralCode.trim(), newUserId: currentUser.id })
      });
      Alert.alert('Referral Applied!', `Attributed to ${res.inviterAlias || 'your friend'}. Thank you for joining BYTALK.`);
      setInputReferralCode('');
      setShowReferralModal(false);
    } catch (err) {
      Alert.alert('Referral Error', err.message || 'Invalid or expired referral code.');
    }
  }

  const tabItems = [
    ['home', 'home', 'Home'],
    ['discover', 'compass', 'Discover'],
    ['rooms', 'mic', 'Rooms'],
    ['chat', 'chatbubbles', 'Messages'],
  ];

  const isMainTabScreen = ['home', 'dashboard', 'discover', 'rooms', 'chat'].includes(screen);

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#FFFFFF' }}>
      <StatusBar barStyle="dark-content" backgroundColor="#FFFFFF" />

      {/* SCREEN 1: WELCOME SCREEN */}
      {screen === 'welcome' && (
        <ScrollView contentContainerStyle={styles.welcomeContainer} showsVerticalScrollIndicator={false}>
          <View style={styles.topBrandHeader}>
            <View style={styles.logoAndTitleRow}>
              <Image source={require('./assets/logo_icon.png')} style={styles.brandIcon} resizeMode="contain" />
              <Text style={styles.brandTitle}>
                BY<Text style={{ color: orange }}>TALK</Text>
              </Text>
            </View>
            <Text style={styles.brandSubtitle}>TALK • LEARN • CONNECT</Text>
          </View>

          <View style={styles.heroTextSection}>
            <Text style={styles.heroMainTitle}>Speak English{'\n'}With Real Partners</Text>
            <Text style={styles.heroSubText}>
              Overcome spoken hesitation with anonymous 1-on-1 audio chats, live rooms, and everyday vocabulary games.
            </Text>
          </View>

          <View style={styles.heroIllustrationContainer}>
            <Image source={require('./assets/hero_illustration.png')} style={styles.heroIllustrationImage} resizeMode="contain" />
          </View>

          <View style={styles.welcomeFooter}>
            <TouchableOpacity onPress={() => setScreen('signup')} activeOpacity={0.9} style={styles.getStartedButtonShadow}>
              <LinearGradient colors={[orange, orangeDark]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.getStartedGradient}>
                <Text style={styles.getStartedButtonText}>Get Started Free</Text>
                <Ionicons name="arrow-forward" size={19} color="#FFFFFF" style={{ marginLeft: 6 }} />
              </LinearGradient>
            </TouchableOpacity>

            <View style={styles.signInRow}>
              <Text style={styles.signInLabel}>Already have an account? </Text>
              <TouchableOpacity onPress={() => setScreen('signin')} activeOpacity={0.7}>
                <Text style={styles.signInLink}>Sign In</Text>
              </TouchableOpacity>
            </View>
          </View>
        </ScrollView>
      )}

      {/* SCREEN: SIGN IN (Section 5) */}
      {screen === 'signin' && (
        <ScrollView contentContainerStyle={{ padding: 24, flexGrow: 1 }} keyboardShouldPersistTaps="handled">
          <TouchableOpacity onPress={() => setScreen('welcome')} style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 20 }}>
            <Ionicons name="arrow-back" size={24} color={navy} />
            <Txt size={14} color={muted} style={{ marginLeft: 6 }}>Back</Txt>
          </TouchableOpacity>

          <View style={{ alignItems: 'center', marginBottom: 24 }}>
            <Text style={{ fontSize: 26, fontWeight: '900', color: navy }}>
              BY<Text style={{ color: orange }}>TALK</Text>
            </Text>
            <Txt size={22} bold style={{ marginTop: 8 }}>Welcome Back</Txt>
            <Txt size={13} color={muted} style={{ textAlign: 'center', marginTop: 4 }}>
              Sign in to resume anonymous speaking practice and vocabulary challenges.
            </Txt>
          </View>

          <Field label="Email Address or Username" value={signInEmail} setValue={setSignInEmail} placeholder="e.g. vedant@bytalk.app" />
          <Field label="Password" value={signInPassword} setValue={setSignInPassword} placeholder="••••••••" secureTextEntry />

          <Btn label={busy ? 'Signing In...' : 'Sign In  →'} onPress={handleSignIn} style={{ marginTop: 8 }} />

          <View style={{ flexDirection: 'row', justifyContent: 'center', marginTop: 24 }}>
            <Txt color={muted}>Don't have an account? </Txt>
            <TouchableOpacity onPress={() => setScreen('signup')}>
              <Txt color={orange} bold>Create Account</Txt>
            </TouchableOpacity>
          </View>
        </ScrollView>
      )}

      {/* SCREEN: SIGN UP (Section 5) */}
      {screen === 'signup' && (
        <ScrollView contentContainerStyle={{ padding: 24, flexGrow: 1 }} keyboardShouldPersistTaps="handled">
          <TouchableOpacity onPress={() => setScreen('welcome')} style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 20 }}>
            <Ionicons name="arrow-back" size={24} color={navy} />
            <Txt size={14} color={muted} style={{ marginLeft: 6 }}>Back</Txt>
          </TouchableOpacity>

          <View style={{ alignItems: 'center', marginBottom: 24 }}>
            <Text style={{ fontSize: 26, fontWeight: '900', color: navy }}>
              BY<Text style={{ color: orange }}>TALK</Text>
            </Text>
            <Txt size={22} bold style={{ marginTop: 8 }}>Create Your Account</Txt>
            <Txt size={13} color={muted} style={{ textAlign: 'center', marginTop: 4 }}>
              Join thousands practicing conversational English every day.
            </Txt>
          </View>

          <Field label="Full Name or Alias" value={signUpName} setValue={setSignUpName} placeholder="e.g. Vedant Kengale" />
          <Field label="Email Address" value={signUpEmail} setValue={setSignUpEmail} placeholder="e.g. vedant@bytalk.app" />
          <Field label="Password (min 6 characters)" value={signUpPassword} setValue={setSignUpPassword} placeholder="••••••••" secureTextEntry />
          <Field label="Confirm Password" value={signUpConfirm} setValue={setSignUpConfirm} placeholder="••••••••" secureTextEntry />

          <Btn label={busy ? 'Registering...' : 'Continue  →'} onPress={handleSignUp} style={{ marginTop: 8 }} />

          <View style={{ flexDirection: 'row', justifyContent: 'center', marginTop: 24 }}>
            <Txt color={muted}>Already have an account? </Txt>
            <TouchableOpacity onPress={() => setScreen('signin')}>
              <Txt color={orange} bold>Sign In</Txt>
            </TouchableOpacity>
          </View>
        </ScrollView>
      )}

      {/* SCREEN: PROFICIENCY LEVEL (Section 5) */}
      {screen === 'level' && (
        <ScrollView contentContainerStyle={{ padding: 22 }}>
          <Header
            title="Choose your level"
            subtitle="Select your current proficiency so we can match you with suitable conversation partners."
            onBack={() => setScreen(currentUser ? 'home' : 'welcome')}
          />
          {[
            ['🌱', 'Beginner', 'I know a few basic words and simple expressions.'],
            ['🍃', 'Elementary', 'I can understand and hold basic conversations.'],
            ['📊', 'Intermediate', 'I can communicate comfortably in daily situations.'],
            ['📘', 'Upper Intermediate', 'I can discuss diverse topics with confidence.'],
            ['🎓', 'Advanced', 'I can express myself fluently and spontaneously.'],
            ['👑', 'Proficient', 'I communicate near native fluency.'],
          ].map(([emoji, n, desc]) => (
            <TouchableOpacity
              key={n}
              onPress={() => setLevel(n)}
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                padding: 15,
                marginBottom: 11,
                borderWidth: 1.5,
                borderColor: level === n ? orange : border,
                borderRadius: 14,
                backgroundColor: level === n ? orangeLight : '#fff',
              }}
            >
              <Txt size={28}>{emoji}</Txt>
              <View style={{ flex: 1, marginLeft: 15 }}>
                <Txt bold size={15}>{n}</Txt>
                <Txt size={12} color={muted} style={{ marginTop: 2 }}>{desc}</Txt>
              </View>
              <Ionicons
                name={level === n ? 'radio-button-on' : 'radio-button-off'}
                color={level === n ? orange : '#aab3c0'}
                size={22}
              />
            </TouchableOpacity>
          ))}
          <Btn label={busy ? 'Saving...' : 'Start Practicing  →'} onPress={() => saveProfile('home')} style={{ marginTop: 8 }} />
        </ScrollView>
      )}

      {/* SCREEN: EDIT PROFILE INFO (Section 5.2 & 16) */}
      {(screen === 'onboard' || screen === 'edit-profile') && (
        <ScrollView contentContainerStyle={{ padding: 22, paddingBottom: 40 }} keyboardShouldPersistTaps="handled">
          <Header
            title="Edit Profile Info"
            subtitle="Update your nickname, languages, and conversation preferences."
            onBack={() => setScreen('home')}
          />

          <View style={{ alignItems: 'center', marginVertical: 14 }}>
            <View style={{ width: 72, height: 72, borderRadius: 36, backgroundColor: orangeLight, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: '#FFD6C7' }}>
              <Txt size={36}>👨🏽‍💻</Txt>
            </View>
            <Txt size={16} bold style={{ marginTop: 8 }}>{name || 'Learner'}</Txt>
            <Txt size={12} color={muted}>{currentUser.email || 'learner@bytalk.app'}</Txt>
          </View>

          <Field label="Full Name" value={name} setValue={setName} placeholder="e.g. Vedant Kengale" />
          <Field label="Public Alias / Nickname (Shown to Call Partners)" value={alias} setValue={setAlias} placeholder="e.g. VedantK" />
          <Field label="My Country / Region" value={country} setValue={setCountry} placeholder="e.g. India" />
          <Field label="Native Language" value={nativeLanguage} setValue={setNativeLanguage} placeholder="e.g. Hindi" />
          <Field label="Language I'm Practicing" value={learningLanguage} setValue={setLearningLanguage} placeholder="e.g. English" />

          <Txt size={13} bold style={{ marginBottom: 6, marginTop: 4 }}>Primary Learning Goal</Txt>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 20 }}>
            {['Daily Conversation', 'Job Interviews', 'IELTS Practice', 'Travel', 'Work & Business'].map((g) => (
              <TouchableOpacity
                key={g}
                onPress={() => setGoals(g)}
                style={{
                  backgroundColor: goals === g ? orange : light,
                  paddingHorizontal: 14,
                  paddingVertical: 8,
                  borderRadius: 18,
                  borderWidth: 1,
                  borderColor: goals === g ? orange : border,
                }}
              >
                <Txt size={12} color={goals === g ? '#fff' : navy} bold={goals === g}>
                  {g}
                </Txt>
              </TouchableOpacity>
            ))}
          </View>

          <Btn label={busy ? 'Saving Changes...' : 'Save Profile Changes'} onPress={() => saveProfile('home')} style={{ marginTop: 8 }} />

          <TouchableOpacity
            onPress={() => setScreen('home')}
            style={{ alignItems: 'center', marginTop: 16, paddingVertical: 10 }}
          >
            <Txt color={muted} size={14} bold>Cancel & Return to Dashboard</Txt>
          </TouchableOpacity>
        </ScrollView>
      )}

      {/* SCREEN: HOME DASHBOARD (Section 6, 10, 11, 14 - UserDashboard Component) */}
      {(screen === 'home' || screen === 'dashboard') && (
        <UserDashboard
          user={currentUser}
          userStats={{
            streak: currentUser.streak || 12,
            minutes: currentUser.minutes || 150,
            words: (currentUser.words || 28) + vocab.length,
            savedPhrases: currentUser.savedPhrases || [],
          }}
          partners={partners}
          rooms={rooms}
          messages={messages}
          vocabulary={vocab}
          backendUp={backendUp}
          onNavigate={(targetScreen) => {
            if (targetScreen === 'settings') setShowSafetyModal(true);
            else if (targetScreen === 'referrals') setShowReferralModal(true);
            else setScreen(targetScreen);
          }}
          onSelectPartner={(partner) => {
            setSelected(partner);
            setScreen('chat');
          }}
          onJoinRoom={join}
          onAddWord={addWord}
          onLogout={() => {
            setAuthToken(null);
            setScreen('welcome');
          }}
          onRefresh={refresh}
          allUsers={allUsers}
          onSwitchUser={(targetUserId) => {
            const found = allUsers.find((x) => x.id === targetUserId);
            if (found) {
              setCurrentUser(found);
              setName(found.name || '');
              setAlias(found.alias || found.name || '');
              setCountry(found.country || 'India');
              setLevel(found.level || 'Intermediate');
              webrtcService.connect(API, found.id);
            }
          }}
        />
      )}

      {/* SCREEN: DISCOVER PARTNERS (Section 7) */}
      {screen === 'discover' && (
        <>
          <Header
            title="Find Practice Partners"
            subtitle="Meet English learners worldwide. Anonymity and safety preserved."
            onBack={() => setScreen('home')}
          />
          <View style={styles.searchBar}>
            <Ionicons name="search" size={19} color={muted} />
            <TextInput
              placeholder="Search by name, country, or native language..."
              placeholderTextColor="#9CA3AF"
              value={search}
              onChangeText={setSearch}
              style={{ flex: 1, padding: 12, color: navy, fontSize: 14 }}
            />
          </View>
          <ScrollView contentContainerStyle={{ padding: 22 }}>
            {partners
              .filter((p) => [p.name, p.country, p.nativeLanguage, p.level].join(' ').toLowerCase().includes(search.toLowerCase()))
              .map((p, i) => (
                <View key={p.id} style={styles.partnerCard}>
                  <View style={[styles.avatarCircle, { backgroundColor: ['#FFE0D3', '#D6EBFC', '#FFE8D9', '#E6F9F0'][i % 4] }]}>
                    <Txt size={25}>{['👩🏻', '👨🏽', '👩🏻‍🦰', '👨🏾', '👩🏽'][i % 5]}</Txt>
                  </View>
                  <View style={{ flex: 1, marginLeft: 12 }}>
                    <Txt bold size={15}>
                      {p.alias || p.name}  <Txt size={12} color={muted}>({p.country})</Txt>
                    </Txt>
                    <Txt size={11} color={muted} style={{ marginTop: 2 }}>
                      Speaks: {p.nativeLanguage} • Learning: English
                    </Txt>
                    <Txt size={11} color="#FF6847" style={{ marginTop: 2, fontWeight: '600' }}>
                      {p.level} • {p.online ? '🟢 Online' : '⚪ Offline'}
                    </Txt>
                  </View>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    <TouchableOpacity
                      onPress={() => {
                        audioService.playRingtone().catch(() => {});
                        webrtcService.initiateDirectCall({
                          callerId: currentUser.id,
                          callerName: currentUser.name || currentUser.alias || 'Learner',
                          calleeId: p.id,
                          calleeName: p.name || p.alias || 'Partner',
                          callerCountry: currentUser.country || 'Global'
                        });
                        setScreen('home');
                      }}
                      style={{
                        backgroundColor: '#10B981',
                        paddingHorizontal: 10,
                        paddingVertical: 7,
                        borderRadius: 16,
                        flexDirection: 'row',
                        alignItems: 'center',
                        gap: 4
                      }}
                    >
                      <Ionicons name="call" size={13} color="#FFFFFF" />
                      <Txt color="#FFFFFF" size={11} bold>Call</Txt>
                    </TouchableOpacity>
                    <TouchableOpacity
                      onPress={() => {
                        setSelected(p);
                        setScreen('chat');
                      }}
                      style={styles.chatButtonOutline}
                    >
                      <Txt color={orange} size={12} bold>Chat</Txt>
                    </TouchableOpacity>
                  </View>
                </View>
              ))}
          </ScrollView>
        </>
      )}

      {/* SCREEN: LIVE AUDIO ROOMS (Section 8 & 9) */}
      {screen === 'rooms' && (
        <>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, paddingTop: 14 }}>
            <Header
              title="Live Audio Rooms"
              subtitle="Listen without activating your mic, or request to speak."
              onBack={() => setScreen('home')}
            />
          </View>

          <View style={{ paddingHorizontal: 20, marginBottom: 10, flexDirection: 'row', justifyContent: 'space-between' }}>
            <TouchableOpacity
              onPress={() => setShowCreateRoomModal(true)}
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                backgroundColor: orangeLight,
                paddingHorizontal: 14,
                paddingVertical: 8,
                borderRadius: 20,
                borderColor: orange,
                borderWidth: 1
              }}
            >
              <Ionicons name="add-circle" size={18} color={orange} style={{ marginRight: 6 }} />
              <Txt size={12} color={orange} bold>Create Room</Txt>
            </TouchableOpacity>

            <TouchableOpacity
              onPress={() => setShowSafetyModal(true)}
              style={{ flexDirection: 'row', alignItems: 'center' }}
            >
              <Ionicons name="shield-checkmark" size={16} color="#10B981" style={{ marginRight: 4 }} />
              <Txt size={11} color={muted}>Audio Safety Policy</Txt>
            </TouchableOpacity>
          </View>

          <ScrollView contentContainerStyle={{ paddingHorizontal: 20 }}>
            <View style={{ flexDirection: 'row', gap: 8, marginBottom: 18, flexWrap: 'wrap' }}>
              {['All', 'Daily English', 'Interviews', 'IELTS Practice', 'Travel'].map((f) => (
                <TouchableOpacity
                  key={f}
                  onPress={() => setFilter(f)}
                  style={{
                    backgroundColor: filter === f ? orange : light,
                    paddingHorizontal: 14,
                    paddingVertical: 8,
                    borderRadius: 20,
                  }}
                >
                  <Txt size={12} color={filter === f ? '#fff' : navy} bold={filter === f}>{f}</Txt>
                </TouchableOpacity>
              ))}
            </View>

            {rooms
              .filter((r) => filter === 'All' || r.topic === filter)
              .map((room, i) => (
                <View key={room.id} style={styles.roomCard}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                    <View style={{ backgroundColor: ['#FFE3C9', '#CDE8FB', '#E1F5E5', '#E7DDFE'][i % 4], borderRadius: 12, padding: 12 }}>
                      <Txt size={22}>{['🎙️', '💼', '📘', '✈️'][i % 4]}</Txt>
                    </View>
                    <View style={{ flex: 1 }}>
                      <Txt bold size={15}>{room.name}</Txt>
                      <Txt size={12} color={muted} style={{ marginTop: 2 }}>{room.topic} • {room.level}</Txt>
                    </View>
                    <Txt size={11} color="#16ac64" bold>● Live</Txt>
                  </View>

                  <Txt size={12} color={muted} style={{ marginVertical: 14 }}>
                    👥 {room.listeners + (room.joined || 0)} listening • Capacity: {room.capacity || 50}
                  </Txt>

                  <View style={{ flexDirection: 'row', gap: 10 }}>
                    <TouchableOpacity
                      onPress={() => join(room)}
                      style={{
                        flex: 1,
                        backgroundColor: orange,
                        paddingVertical: 12,
                        borderRadius: 22,
                        alignItems: 'center'
                      }}
                    >
                      <Txt color="#fff" bold size={13}>Listen Publicly</Txt>
                    </TouchableOpacity>

                    <TouchableOpacity
                      onPress={() => handleRaiseHand(room)}
                      style={{
                        borderWidth: 1.5,
                        borderColor: orange,
                        paddingHorizontal: 16,
                        paddingVertical: 12,
                        borderRadius: 22,
                        flexDirection: 'row',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: 6
                      }}
                    >
                      <Ionicons name="hand-right" size={16} color={orange} />
                      <Txt color={orange} bold size={12}>Raise Hand</Txt>
                    </TouchableOpacity>
                  </View>
                </View>
              ))}
          </ScrollView>
        </>
      )}

      {/* SCREEN: DIRECT CHAT (Section 7) */}
      {screen === 'chat' && (
        <>
          <View style={styles.chatHeader}>
            <TouchableOpacity onPress={() => setScreen('discover')}>
              <Ionicons name="arrow-back" size={22} color={navy} />
            </TouchableOpacity>
            <View style={{ flex: 1, marginLeft: 12 }}>
              <Txt size={16} bold>{selected?.alias || selected?.name || 'Partner'}</Txt>
              <Txt size={11} color="#18b576">● Online • {selected?.country || 'Global'}</Txt>
            </View>
            <TouchableOpacity
              onPress={() => {
                if (!selected) return;
                audioService.playRingtone().catch(() => {});
                webrtcService.initiateDirectCall({
                  callerId: currentUser.id,
                  callerName: currentUser.name || currentUser.alias || 'Learner',
                  calleeId: selected.id,
                  calleeName: selected.name || selected.alias || 'Partner',
                  callerCountry: currentUser.country || 'Global'
                });
                setScreen('home');
              }}
              style={{
                backgroundColor: '#10B981',
                width: 36,
                height: 36,
                borderRadius: 18,
                justifyContent: 'center',
                alignItems: 'center',
                marginRight: 6
              }}
              accessibilityLabel="Audio Call Partner"
            >
              <Ionicons name="call" size={18} color="#FFFFFF" />
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => {
                Alert.alert('Report User', 'File a safety report to moderators?', [
                  { text: 'Cancel', style: 'cancel' },
                  {
                    text: 'Report & Block',
                    style: 'destructive',
                    onPress: async () => {
                      try {
                        await request('reports', {
                          method: 'POST',
                          body: JSON.stringify({
                            reporterId: currentUser.id,
                            reportedUserId: selected.id,
                            reason: 'Inappropriate communication reported from direct chat.'
                          })
                        });
                        Alert.alert('User Reported', 'Moderation team has received your report. The user has been blocked.');
                        setScreen('discover');
                      } catch {
                        Alert.alert('Reported', 'User flagged.');
                      }
                    }
                  }
                ]);
              }}
              style={{ padding: 6 }}
            >
              <Ionicons name="shield-outline" size={20} color={muted} />
            </TouchableOpacity>
          </View>

          <ScrollView contentContainerStyle={{ padding: 16, flexGrow: 1, justifyContent: 'flex-end' }}>
            {messages.length === 0 ? (
              <View style={{ alignItems: 'center', paddingVertical: 40 }}>
                <Txt size={40}>👋</Txt>
                <Txt size={15} bold style={{ marginTop: 10 }}>Say Hello to {selected?.alias || selected?.name}!</Txt>
                <Txt size={12} color={muted} style={{ textAlign: 'center', marginTop: 4 }}>
                  Start your conversation practicing English greetings or asking about hobbies.
                </Txt>
              </View>
            ) : (
              messages
                .filter((m) => (m.from === selected.id && m.to === currentUser.id) || (m.from === currentUser.id && m.to === selected.id))
                .map((m) => (
                  <View
                    key={m.id}
                    style={{
                      alignSelf: m.from === currentUser.id ? 'flex-end' : 'flex-start',
                      maxWidth: '82%',
                      marginBottom: 12,
                      backgroundColor: m.from === currentUser.id ? orangeLight : light,
                      borderColor: m.from === currentUser.id ? '#FFD8C9' : '#ECEFF3',
                      borderWidth: 1,
                      padding: 14,
                      borderRadius: 16,
                    }}
                  >
                    <Txt color={navy} size={14}>{m.text}</Txt>
                    <Txt color={muted} size={10} style={{ marginTop: 5, alignSelf: 'flex-end' }}>
                      {new Date(m.at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </Txt>
                  </View>
                ))
            )}
          </ScrollView>

          <View style={styles.chatInputRow}>
            <TextInput
              placeholder="Type a message..."
              placeholderTextColor="#9CA3AF"
              value={draft}
              onChangeText={setDraft}
              style={styles.chatInput}
            />
            <TouchableOpacity onPress={send} style={styles.sendButton}>
              <Ionicons name="send" color="#fff" size={18} />
            </TouchableOpacity>
          </View>
        </>
      )}

      {/* BOTTOM TAB BAR NAVIGATION */}
      {isMainTabScreen && (
        <View style={styles.tabBar}>
          {tabItems.map(([key, icon, label]) => {
            const active = screen === key || (key === 'home' && screen === 'dashboard');
            return (
              <TouchableOpacity
                key={key}
                onPress={() => setScreen(key)}
                style={styles.tabItem}
                activeOpacity={0.7}
              >
                <Ionicons name={icon} size={22} color={active ? orange : '#94A3B8'} />
                <Txt size={11} color={active ? orange : '#94A3B8'} bold={active}>
                  {label}
                </Txt>
              </TouchableOpacity>
            );
          })}
        </View>
      )}

      {/* MODAL 1: COMMUNITY SAFETY & CONSENT (Section 5.1 & 12) */}
      <Modal visible={showSafetyModal} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContainer}>
            <View style={{ alignItems: 'center', marginBottom: 16 }}>
              <Ionicons name="shield-checkmark" size={48} color={orange} />
              <Txt size={18} bold style={{ marginTop: 8 }}>Community Safety & Anonymity</Txt>
              <Txt size={12} color={muted} style={{ textAlign: 'center', marginTop: 4 }}>
                BYTALK Standard Terms & Respectful Communication
              </Txt>
            </View>

            <ScrollView style={{ maxHeight: 220, marginBottom: 16 }}>
              <Txt size={13} style={{ lineHeight: 18, marginBottom: 10 }}>
                • <Text style={{ fontWeight: 'bold' }}>Privacy Protected:</Text> Your real phone number, email, and exact location are never disclosed to call partners.
              </Txt>
              <Txt size={13} style={{ lineHeight: 18, marginBottom: 10 }}>
                • <Text style={{ fontWeight: 'bold' }}>Zero Harassment Policy:</Text> Inappropriate language, abuse, or unsolicited solicitation results in immediate permanent account termination.
              </Txt>
              <Txt size={13} style={{ lineHeight: 18, marginBottom: 10 }}>
                • <Text style={{ fontWeight: 'bold' }}>Microphone Consent:</Text> Audio is transmitted only when you voluntarily join active calls or room stages.
              </Txt>
              <Txt size={13} style={{ lineHeight: 18 }}>
                • <Text style={{ fontWeight: 'bold' }}>Instant Blocking:</Text> You can leave any session and block rematching at any time.
              </Txt>
            </ScrollView>

            <Btn label="I Understand & Agree" onPress={() => setShowSafetyModal(false)} />
          </View>
        </View>
      </Modal>

      {/* MODAL 2: CREATE LIVE AUDIO ROOM (Section 8) */}
      <Modal visible={showCreateRoomModal} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContainer}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <Txt size={18} bold>Open New Audio Room</Txt>
              <TouchableOpacity onPress={() => setShowCreateRoomModal(false)}>
                <Ionicons name="close" size={24} color={muted} />
              </TouchableOpacity>
            </View>

            <Field label="Room Title" value={newRoomName} setValue={setNewRoomName} placeholder="e.g. Free Speaking Practice" />

            <Txt size={13} bold style={{ marginBottom: 6 }}>Topic Category</Txt>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 16 }}>
              {['Daily English', 'Interviews', 'IELTS Practice', 'Travel', 'Free Conversation'].map((cat) => (
                <TouchableOpacity
                  key={cat}
                  onPress={() => setNewRoomTopic(cat)}
                  style={{
                    backgroundColor: newRoomTopic === cat ? orange : light,
                    paddingHorizontal: 12,
                    paddingVertical: 6,
                    borderRadius: 16,
                  }}
                >
                  <Txt size={11} color={newRoomTopic === cat ? '#fff' : navy} bold={newRoomTopic === cat}>
                    {cat}
                  </Txt>
                </TouchableOpacity>
              ))}
            </View>

            <Field label="Capacity (Max Listeners)" value={newRoomCapacity} setValue={setNewRoomCapacity} placeholder="50" />

            <Btn label="Publish Room" onPress={handleCreateRoom} />
          </View>
        </View>
      </Modal>

      {/* MODAL 3: REFERRAL PROGRAMME (Section 15) */}
      <Modal visible={showReferralModal} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContainer}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <Txt size={18} bold>Refer & Learn Together</Txt>
              <TouchableOpacity onPress={() => setShowReferralModal(false)}>
                <Ionicons name="close" size={24} color={muted} />
              </TouchableOpacity>
            </View>

            <View style={{ alignItems: 'center', marginVertical: 12 }}>
              <Txt size={40}>🎁</Txt>
              <Txt size={14} color={muted} style={{ textAlign: 'center', marginTop: 8 }}>
                Share your invite code with friends to unlock vocabulary boosters and track practice goals together.
              </Txt>
              <View style={{ backgroundColor: orangeLight, paddingVertical: 12, paddingHorizontal: 24, borderRadius: 12, marginTop: 14, borderWidth: 1, borderColor: '#FFD6C7' }}>
                <Txt size={18} bold color={orange}>{currentUser.referralCode || 'BYTALK-INVITE'}</Txt>
              </View>
              <Txt size={11} color={muted} style={{ marginTop: 6 }}>{currentUser.referredCount || 0} friends joined</Txt>
            </View>

            <View style={{ marginTop: 12, marginBottom: 16 }}>
              <Txt size={12} bold style={{ marginBottom: 6 }}>Have a friend's referral code?</Txt>
              <View style={{ flexDirection: 'row', gap: 8 }}>
                <TextInput
                  placeholder="Enter code (e.g. BYTALK-PAVAN)"
                  value={inputReferralCode}
                  onChangeText={setInputReferralCode}
                  style={{ flex: 1, backgroundColor: light, borderRadius: 12, padding: 12, borderWidth: 1, borderColor: border }}
                />
                <TouchableOpacity
                  onPress={handleClaimReferral}
                  style={{ backgroundColor: orange, paddingHorizontal: 16, borderRadius: 12, justifyContent: 'center' }}
                >
                  <Txt color="#fff" bold size={13}>Claim</Txt>
                </TouchableOpacity>
              </View>
            </View>

            <Btn label="Done" onPress={() => setShowReferralModal(false)} outline />
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  welcomeContainer: {
    paddingHorizontal: 24,
    paddingTop: 10,
    paddingBottom: 28,
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: screenHeight - 60,
  },
  topBrandHeader: {
    alignItems: 'center',
    marginTop: 6,
  },
  logoAndTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  brandIcon: {
    width: 38,
    height: 38,
    marginRight: 8,
  },
  brandTitle: {
    fontSize: 27,
    fontWeight: '900',
    color: '#1A1D2E',
    letterSpacing: -0.5,
  },
  brandSubtitle: {
    fontSize: 12,
    fontWeight: '500',
    color: '#6B7280',
    marginTop: 3,
    letterSpacing: 0.8,
  },
  heroTextSection: {
    alignItems: 'center',
    marginVertical: 10,
  },
  heroMainTitle: {
    fontSize: 32,
    fontWeight: '800',
    color: '#111827',
    textAlign: 'center',
    lineHeight: 38,
    letterSpacing: -0.5,
    marginBottom: 10,
  },
  heroSubText: {
    fontSize: 15,
    fontWeight: '400',
    color: '#64748B',
    textAlign: 'center',
    lineHeight: 22,
    paddingHorizontal: 16,
  },
  heroIllustrationContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    marginVertical: 12,
    minHeight: Math.min(270, screenHeight * 0.38),
  },
  heroIllustrationImage: {
    width: '100%',
    height: Math.min(270, screenHeight * 0.38),
    maxWidth: 380,
  },
  welcomeFooter: {
    width: '100%',
    alignItems: 'center',
    paddingTop: 8,
  },
  getStartedButtonShadow: {
    width: '100%',
    borderRadius: 28,
    shadowColor: '#FF6847',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.35,
    shadowRadius: 16,
    elevation: 8,
  },
  getStartedGradient: {
    height: 56,
    borderRadius: 28,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 20,
  },
  getStartedButtonText: {
    color: '#FFFFFF',
    fontSize: 17,
    fontWeight: '700',
    letterSpacing: 0.2,
  },
  signInRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 18,
    paddingBottom: 4,
  },
  signInLabel: {
    fontSize: 14,
    color: '#64748B',
  },
  signInLink: {
    fontSize: 14,
    color: orange,
    fontWeight: '700',
  },
  searchBar: {
    marginHorizontal: 22,
    backgroundColor: light,
    borderRadius: 14,
    paddingHorizontal: 15,
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: border,
  },
  partnerCard: {
    flexDirection: 'row',
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderColor: '#F1F3F7',
    alignItems: 'center',
  },
  avatarCircle: {
    width: 52,
    height: 52,
    borderRadius: 26,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chatButtonOutline: {
    borderWidth: 1.5,
    borderColor: orange,
    borderRadius: 18,
    paddingHorizontal: 14,
    paddingVertical: 8,
    backgroundColor: '#fff',
  },
  chatHeader: {
    padding: 16,
    borderBottomWidth: 1,
    borderColor: border,
    flexDirection: 'row',
    alignItems: 'center',
  },
  chatInputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
    gap: 10,
    borderTopWidth: 1,
    borderColor: border,
  },
  chatInput: {
    backgroundColor: light,
    borderRadius: 24,
    paddingHorizontal: 18,
    paddingVertical: 12,
    flex: 1,
    borderWidth: 1,
    borderColor: border,
    color: navy,
  },
  sendButton: {
    backgroundColor: orange,
    padding: 13,
    borderRadius: 30,
    alignItems: 'center',
    justifyContent: 'center',
  },
  roomCard: {
    borderWidth: 1,
    borderColor: border,
    borderRadius: 18,
    padding: 18,
    marginBottom: 14,
    backgroundColor: '#fff',
  },
  tabBar: {
    flexDirection: 'row',
    borderTopWidth: 1,
    borderColor: '#EEF0F4',
    paddingVertical: 10,
    backgroundColor: '#FFFFFF',
  },
  tabItem: {
    flex: 1,
    alignItems: 'center',
    gap: 4,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  modalContainer: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 22,
    width: '100%',
    maxWidth: 420,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.2,
    shadowRadius: 20,
    elevation: 10,
  },
});

export default App;
