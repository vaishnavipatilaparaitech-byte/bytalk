import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { createServer } from 'http';
import { Server } from 'socket.io';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import crypto from 'crypto';

import { hashPassword, verifyPassword, signJwt, requireAuth, optionalAuth } from './auth.js';
import { COMMON_PHRASES, WORD_GAME_BANK, DAILY_CHALLENGE, evaluateGameAttempt } from './learning.js';
import { setupSignaling } from './signaling.js';
import { connectDB, getDbStatus, disconnectDB } from './db.js';
import { syncStoreWithMongo, queueMongoSync } from './models/index.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dbFile = path.join(root, 'data', 'store.json');
fs.mkdirSync(path.dirname(dbFile), { recursive: true });

const seed = {
  users: [
    {
      id: 'u1',
      name: 'Pavan Nerkar',
      alias: 'PavanN',
      email: 'pavan@bytalk.app',
      country: 'India',
      nativeLanguage: 'Hindi',
      learningLanguage: 'English',
      level: 'Intermediate',
      online: true,
      streak: 12,
      minutes: 150,
      words: 28,
      savedPhrases: ['phr_work_1', 'phr_int_1'],
      blockedUsers: [],
      referralCode: 'BYTALK-PAVAN',
      referredCount: 3
    },
    { id: 'u2', name: 'Yuki', alias: 'YukiTokyo', email: 'yuki@bytalk.app', country: 'Japan', nativeLanguage: 'Japanese', learningLanguage: 'English', level: 'Intermediate', online: true, minutes: 80, words: 15, streak: 5, savedPhrases: [], blockedUsers: [], referralCode: 'BYTALK-YUKI', referredCount: 1 },
    { id: 'u3', name: 'Lucas', alias: 'LucasRio', email: 'lucas@bytalk.app', country: 'Brazil', nativeLanguage: 'Portuguese', learningLanguage: 'English', level: 'Beginner', online: true, minutes: 45, words: 9, streak: 3, savedPhrases: [], blockedUsers: [], referralCode: 'BYTALK-LUCAS', referredCount: 0 },
    { id: 'u4', name: 'Minji', alias: 'MinjiSeoul', email: 'minji@bytalk.app', country: 'South Korea', nativeLanguage: 'Korean', learningLanguage: 'English', level: 'Intermediate', online: true, minutes: 110, words: 22, streak: 8, savedPhrases: [], blockedUsers: [], referralCode: 'BYTALK-MINJI', referredCount: 2 },
    { id: 'u5', name: 'Carlos', alias: 'CarlosMex', email: 'carlos@bytalk.app', country: 'Mexico', nativeLanguage: 'Spanish', learningLanguage: 'English', level: 'Intermediate', online: true, minutes: 60, words: 14, streak: 4, savedPhrases: [], blockedUsers: [], referralCode: 'BYTALK-CARLOS', referredCount: 0 },
    { id: 'u6', name: 'Aditi', alias: 'Aditi_In', email: 'aditi@bytalk.app', country: 'India', nativeLanguage: 'Hindi', learningLanguage: 'English', level: 'Beginner', online: true, minutes: 30, words: 8, streak: 2, savedPhrases: [], blockedUsers: [], referralCode: 'BYTALK-ADITI', referredCount: 0 }
  ],
  rooms: [
    { id: 'r1', name: 'Everyday English', topic: 'Daily English', level: 'Beginner - Intermediate', listeners: 24, capacity: 50, speakers: ['u1'], isLive: true, joined: 0 },
    { id: 'r2', name: 'Job Interview Practice', topic: 'Interviews', level: 'Intermediate - Advanced', listeners: 18, capacity: 30, speakers: ['u2'], isLive: true, joined: 0 },
    { id: 'r3', name: 'IELTS Speaking Prep', topic: 'IELTS Practice', level: 'All levels', listeners: 32, capacity: 50, speakers: ['u4'], isLive: true, joined: 0 },
    { id: 'r4', name: 'Travel & Free Conversation', topic: 'Travel', level: 'Beginner - Intermediate', listeners: 12, capacity: 40, speakers: [], isLive: true, joined: 0 }
  ],
  messages: [
    { id: 'm1', from: 'u2', to: 'u1', text: 'Hi Pavan! 👋 How is your day going?', at: new Date().toISOString() },
    { id: 'm2', from: 'u1', to: 'u2', text: 'Hi! My day is good. I am learning English!', at: new Date().toISOString() }
  ],
  vocabulary: [{ id: 'v1', userId: 'u1', word: 'conversation', category: 'Conversation' }],
  reports: [],
  blocks: [],
  auditLogs: []
};

let store;
try {
  store = JSON.parse(fs.readFileSync(dbFile, 'utf8'));
} catch {
  store = seed;
  fs.writeFileSync(dbFile, JSON.stringify(store, null, 2));
}

// Data normalization to ensure all fields from Section 19 exist
if (!store.blocks) store.blocks = [];
if (!store.auditLogs) store.auditLogs = [];
if (!store.callFeedback) store.callFeedback = [];
if (!store.notes) store.notes = [];
if (!store.notifications || store.notifications.length === 0) {
  store.notifications = [
    {
      id: 'notif_1',
      userId: 'u1',
      type: 'streak',
      icon: 'flame',
      color: '#FF6847',
      bgColor: '#FFF4EE',
      title: '12-Day Streak Maintained!',
      message: 'You have practised English 12 days in a row. Keep the momentum going!',
      time: 'Today, 9:00 AM',
      read: false,
      createdAt: new Date().toISOString()
    },
    {
      id: 'notif_2',
      userId: 'u1',
      type: 'partner',
      icon: 'people',
      color: '#3B82F6',
      bgColor: '#EDF5FF',
      title: 'Yuki accepted your chat request',
      message: 'Yuki from Japan is online and ready for conversation practice.',
      time: 'Yesterday',
      read: false,
      createdAt: new Date(Date.now() - 86400000).toISOString()
    },
    {
      id: 'notif_3',
      userId: 'u1',
      type: 'learning',
      icon: 'book',
      color: '#10B981',
      bgColor: '#E6F9F0',
      title: 'New Common Phrases Added',
      message: 'Check out the new Interview and Workplace phrases on your dashboard.',
      time: '2 days ago',
      read: true,
      createdAt: new Date(Date.now() - 172800000).toISOString()
    }
  ];
}
if (!store.notificationPreferences) store.notificationPreferences = {};
if (!store.passwordResetTokens) store.passwordResetTokens = [];
store.users.forEach((u) => {
  if (!u.savedPhrases) u.savedPhrases = [];
  if (!u.blockedUsers) u.blockedUsers = [];
  if (!u.alias) u.alias = u.name ? u.name.split(' ')[0] : 'Learner';
  if (!u.referralCode) u.referralCode = `BYTALK-${(u.name || 'USER').toUpperCase().slice(0, 5)}-${Math.floor(100 + Math.random() * 900)}`;
  if (u.referredCount === undefined) u.referredCount = 0;
  if (!u.subscription) u.subscription = { plan: 'free', status: 'active', startedAt: new Date().toISOString() };
});

const save = () => {
  fs.writeFileSync(dbFile, JSON.stringify(store, null, 2));
  queueMongoSync(store);
};

const logAuditEvent = (actor, eventType, target) => {
  store.auditLogs.push({
    id: crypto.randomUUID(),
    actor: actor || 'system',
    eventType,
    target: target || null,
    timestamp: new Date().toISOString()
  });
  save();
};

const app = express();
const corsOrigin = process.env.CORS_ORIGIN || '*';
app.use(cors({ origin: corsOrigin, credentials: true }));
app.use(express.json({ limit: '128kb' }));

// Request logging middleware for visual confirmation of client connections
app.use((req, res, next) => {
  const start = Date.now();
  res.on('finish', () => {
    const duration = Date.now() - start;
    console.log(`[HTTP] ${req.method} ${req.originalUrl} - ${res.statusCode} (${duration}ms)`);
  });
  next();
});

const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: {
    origin: corsOrigin,
    methods: ['GET', 'POST', 'PATCH', 'DELETE'],
    credentials: true
  }
});

const createNotification = ({ userId, type = 'system', title, message, icon, color, bgColor, data = {} }) => {
  const notif = {
    id: `notif_${crypto.randomUUID()}`,
    userId: userId || 'all',
    type,
    icon: icon || (type === 'streak' ? 'flame' : type === 'message' ? 'chatbubble' : type === 'room' ? 'mic' : type === 'partner' ? 'people' : type === 'learning' ? 'book' : 'notifications'),
    color: color || '#FF6847',
    bgColor: bgColor || '#FFF4EE',
    title: String(title).slice(0, 120),
    message: String(message).slice(0, 300),
    time: 'Just now',
    read: false,
    data,
    createdAt: new Date().toISOString()
  };
  if (!store.notifications) store.notifications = [];
  store.notifications.unshift(notif);
  save();
  io.emit('notification:new', notif);
  return notif;
};

// Root welcome route for quick health inspection
app.get('/', (req, res) => {
  const dbStatus = getDbStatus();
  res.json({
    service: 'BYTALK Backend API',
    status: 'online',
    version: '1.0.0',
    database: dbStatus.isConnected ? 'connected' : dbStatus.state,
    databaseName: dbStatus.dbName,
    databaseHost: dbStatus.host,
    documentation: 'Aparaitech Software BYTALK Specification',
    endpoints: {
      health: '/api/health',
      stats: '/api/stats',
      users: '/api/users',
      dashboard: '/api/dashboard/u1',
      rooms: '/rooms',
      phrases: '/phrases',
      games: '/games/questions',
      dailyQuiz: '/api/quiz/daily'
    }
  });
});

// ==========================================
// 1. ORIGINAL CORE API ENDPOINTS (PRESERVED)
// ==========================================

app.get('/api/health', (req, res) => {
  const dbStatus = getDbStatus();
  res.json({
    ok: true,
    service: 'BYTALK API',
    database: dbStatus.isConnected ? 'connected' : dbStatus.state,
    databaseName: dbStatus.dbName,
    databaseHost: dbStatus.host
  });
});

app.get('/api/users', (req, res) => {
  const safeUsers = store.users.map((u) => {
    const { passwordHash, ...safe } = u;
    return safe;
  });
  res.json(safeUsers);
});

app.get('/api/partners', (req, res) => {
  const q = String(req.query.q || '').toLowerCase();
  res.json(
    store.users.filter(
      (u) =>
        u.id !== 'u1' &&
        [u.name, u.alias, u.country, u.nativeLanguage, u.level].some((x) =>
          String(x || '').toLowerCase().includes(q)
        )
    )
  );
});

app.post('/api/onboard', (req, res) => {
  const { name, country, nativeLanguage, learningLanguage, level } = req.body;
  const me = store.users.find((u) => u.id === 'u1');
  for (const [k, v] of Object.entries({ name, country, nativeLanguage, learningLanguage, level })) {
    if (typeof v === 'string' && v.trim()) me[k] = v.trim().slice(0, 80);
  }
  save();
  res.json(me);
});

app.get(['/api/rooms', '/rooms'], (req, res) => res.json(store.rooms));

// Fetch specific room details (Section 20: GET /rooms; GET /rooms/:id)
app.get(['/api/rooms/:id', '/rooms/:id'], (req, res) => {
  const room = store.rooms.find((r) => r.id === req.params.id);
  if (!room) return res.status(404).json({ error: 'Room not found' });
  const speakerDetails = store.users
    .filter((u) => (room.speakers || []).includes(u.id))
    .map(({ passwordHash, ...safe }) => safe);
  res.json({ ...room, speakerDetails });
});

app.post(['/api/rooms/:id/join', '/rooms/:id/join'], (req, res) => {
  const room = store.rooms.find((r) => r.id === req.params.id);
  if (!room) return res.status(404).json({ error: 'Room not found' });
  room.joined = (room.joined || 0) + 1;
  room.listeners = (room.listeners || 0) + 1;
  save();
  io.emit('rooms:changed', store.rooms);
  res.json(room);
});

app.post(['/api/rooms/:id/leave', '/rooms/:id/leave'], (req, res) => {
  const room = store.rooms.find((r) => r.id === req.params.id);
  if (!room) return res.status(404).json({ error: 'Room not found' });
  if (room.listeners > 0) room.listeners -= 1;
  save();
  io.emit('rooms:changed', store.rooms);
  res.json({ message: 'Left room successfully.', room });
});

// Create new audio room (Section 8: Host can create/open/close room)
app.post(['/api/rooms', '/rooms'], optionalAuth(store), (req, res) => {
  const { name, topic, level, capacity } = req.body;
  const hostId = req.user?.id || req.body.hostId || 'u1';
  if (!name || typeof name !== 'string' || !name.trim()) {
    return res.status(400).json({ error: 'Room name is required' });
  }
  const newRoom = {
    id: `r_${crypto.randomBytes(4).toString('hex')}`,
    name: name.trim().slice(0, 60),
    topic: topic || 'Daily English',
    level: level || 'All levels',
    capacity: Number(capacity) || 50,
    listeners: 1,
    joined: 1,
    speakers: [hostId],
    hostId,
    speakerRequests: [],
    isLive: true,
    createdAt: new Date().toISOString()
  };
  store.rooms.push(newRoom);
  logAuditEvent(hostId, 'ROOM_CREATED', newRoom.id);
  save();
  io.emit('rooms:changed', store.rooms);
  res.status(201).json(newRoom);
});

// Raise Hand / Request Speaker status (Section 8 & 9)
app.post(['/api/rooms/:id/raise-hand', '/rooms/:id/raise-hand'], optionalAuth(store), (req, res) => {
  const room = store.rooms.find((r) => r.id === req.params.id);
  if (!room) return res.status(404).json({ error: 'Room not found' });
  const userId = req.user?.id || req.body.userId || 'u1';
  if (!room.speakerRequests) room.speakerRequests = [];
  if (!room.speakers) room.speakers = [];
  if (room.speakers.includes(userId)) {
    return res.json({ message: 'User is already a speaker in this room', room });
  }
  if (!room.speakerRequests.includes(userId)) {
    room.speakerRequests.push(userId);
  }
  save();
  io.emit('rooms:changed', store.rooms);
  io.emit(`room:${room.id}:event`, { type: 'raise_hand', userId });
  res.json({ message: 'Speaker request submitted to room host.', room });
});

// Host approves speaker request (Section 8)
app.post(['/api/rooms/:id/approve-speaker', '/rooms/:id/approve-speaker'], (req, res) => {
  const room = store.rooms.find((r) => r.id === req.params.id);
  if (!room) return res.status(404).json({ error: 'Room not found' });
  const { userId } = req.body;
  if (!userId) return res.status(400).json({ error: 'userId is required' });
  if (!room.speakers) room.speakers = [];
  if (!room.speakers.includes(userId)) {
    room.speakers.push(userId);
  }
  room.speakerRequests = (room.speakerRequests || []).filter((id) => id !== userId);
  save();
  io.emit('rooms:changed', store.rooms);
  io.emit(`room:${room.id}:event`, { type: 'speaker_approved', userId });
  createNotification({
    userId,
    type: 'room',
    icon: 'mic',
    color: '#10B981',
    bgColor: '#E6F9F0',
    title: 'Speaker Approved!',
    message: `You are now a speaker in "${room.name}".`,
    data: { roomId: room.id }
  });
  res.json({ message: 'User promoted to speaker.', room });
});

app.get('/api/messages/:a/:b', (req, res) =>
  res.json(
    store.messages.filter(
      (m) =>
        (m.from === req.params.a && m.to === req.params.b) ||
        (m.from === req.params.b && m.to === req.params.a)
    )
  )
);

app.post('/api/messages', (req, res) => {
  const { from, to, text } = req.body;
  if (
    !store.users.some((u) => u.id === from) ||
    !store.users.some((u) => u.id === to) ||
    typeof text !== 'string' ||
    !text.trim() ||
    text.length > 1500
  )
    return res.status(400).json({ error: 'Invalid message' });

  const msg = { id: crypto.randomUUID(), from, to, text: text.trim(), at: new Date().toISOString() };
  store.messages.push(msg);
  save();
  io.emit('message:new', msg);

  const sender = store.users.find((u) => u.id === from);
  createNotification({
    userId: to,
    type: 'message',
    icon: 'chatbubble',
    color: '#3B82F6',
    bgColor: '#EDF5FF',
    title: `New message from ${sender?.alias || sender?.name || 'Partner'}`,
    message: text.trim().slice(0, 100),
    data: { from, messageId: msg.id }
  });

  res.status(201).json(msg);
});

app.get('/api/vocabulary/:userId', (req, res) =>
  res.json(store.vocabulary.filter((v) => v.userId === req.params.userId))
);

app.post('/api/vocabulary', (req, res) => {
  const { userId, word, category } = req.body;
  if (typeof word !== 'string' || !word.trim() || word.length > 100)
    return res.status(400).json({ error: 'Invalid word' });

  const item = {
    id: crypto.randomUUID(),
    userId: userId || 'u1',
    word: word.trim(),
    category: category || 'Conversation'
  };
  store.vocabulary.push(item);
  const u = store.users.find((x) => x.id === item.userId);
  if (u) u.words = (u.words || 0) + 1;
  save();
  res.status(201).json(item);
});

app.get('/api/stats', (req, res) =>
  res.json({
    users: store.users.length,
    rooms: store.rooms.length,
    messages: store.messages.length,
    reports: store.reports.filter((r) => r.status === 'open').length,
    activeUsers: store.users.filter((x) => x.online).length,
    proSubscribers: store.users.filter((x) => x.subscription?.plan === 'pro').length,
    totalBlocks: store.blocks.length
  })
);

// In-memory rate limiting tracker for report submissions (Spam & Abuse Prevention)
const recentReportsTracker = new Map(); // reporterId -> [timestamp1, timestamp2, ...]

app.get('/api/reports', (req, res) => res.json(store.reports));

app.post(['/api/reports', '/reports'], optionalAuth(store), (req, res) => {
  const reporterId = req.user?.id || req.body.reporterId || 'anonymous_user';
  const { reason, reportedUserId, sessionId } = req.body;

  if (typeof reason !== 'string' || !reason.trim() || reason.trim().length < 5) {
    return res.status(400).json({ error: 'A specific, descriptive reason (minimum 5 characters) is required for safety reports.' });
  }

  // 1. Prevent Self-Reporting
  if (reportedUserId && reportedUserId === reporterId) {
    return res.status(400).json({ error: 'You cannot submit a safety report against your own account.' });
  }

  // 2. Anti-Spam Throttling & Rate Limiting (Section 12: "Apply spam prevention, request throttling")
  const now = Date.now();
  const windowMs = 10 * 60 * 1000; // 10-minute sliding window
  const maxReportsPerWindow = 3;

  const userReportTimestamps = (recentReportsTracker.get(reporterId) || []).filter(
    (t) => now - t < windowMs
  );

  if (userReportTimestamps.length >= maxReportsPerWindow) {
    return res.status(429).json({
      error: 'Abuse protection: You have exceeded the maximum report submissions allowed in a 10-minute window. Please wait before submitting more reports.'
    });
  }

  userReportTimestamps.push(now);
  recentReportsTracker.set(reporterId, userReportTimestamps);

  // 3. Prevent Duplicate Harassment Reports against the same user
  const duplicateOpenReport = store.reports.find(
    (r) => r.reporterId === reporterId && r.reportedUserId === reportedUserId && r.status === 'open'
  );
  if (duplicateOpenReport) {
    return res.status(409).json({
      error: 'A report against this user is already open and currently under moderation review.'
    });
  }

  // 4. Interaction Verification (Context Check)
  // Check if reporter and reported user actually had shared interactions (messages or sessions)
  const hasSharedMessages = reportedUserId
    ? store.messages.some(
        (m) =>
          (m.from === reporterId && m.to === reportedUserId) ||
          (m.from === reportedUserId && m.to === reporterId)
      )
    : false;

  const verificationStatus = (sessionId || hasSharedMessages) ? 'context_verified' : 'unverified_interaction';

  // 5. Check Reporter Reputation (Section 12: "Limits on abusive behavior")
  const reporter = store.users.find((u) => u.id === reporterId);
  const falseReportCount = reporter?.falseReportCount || 0;
  const isHighRiskReporter = falseReportCount >= 3;

  const report = {
    id: crypto.randomUUID(),
    reporterId,
    reportedUserId: reportedUserId || null,
    sessionId: sessionId || null,
    reason: reason.trim().slice(0, 500),
    verificationStatus, // Flag whether direct interaction evidence exists
    reporterCredibility: isHighRiskReporter ? 'flagged_for_false_reports' : 'standard',
    status: 'open',
    at: new Date().toISOString()
  };

  store.reports.push(report);
  logAuditEvent(reporterId, 'REPORT_FILED', reportedUserId);
  save();

  res.status(201).json({
    message: 'Report received and queued for moderator review. Innocent users are never penalized without human verification.',
    report
  });
});

app.patch('/api/reports/:id', (req, res) => {
  const report = store.reports.find((r) => r.id === req.params.id);
  if (!report) return res.status(404).json({ error: 'Report not found' });

  const validStatuses = ['open', 'resolved', 'dismissed_as_false'];
  if (!validStatuses.includes(req.body.status)) {
    return res.status(400).json({ error: `Invalid status. Must be one of: ${validStatuses.join(', ')}` });
  }

  report.status = req.body.status;
  report.reviewedAt = new Date().toISOString();
  report.moderatorNotes = req.body.moderatorNotes || null;

  // If dismissed as false / malicious report, penalize the malicious reporter
  if (req.body.status === 'dismissed_as_false' && report.reporterId) {
    const maliciousReporter = store.users.find((u) => u.id === report.reporterId);
    if (maliciousReporter) {
      maliciousReporter.falseReportCount = (maliciousReporter.falseReportCount || 0) + 1;
      logAuditEvent('moderator', 'REPORTER_PENALIZED_FOR_FALSE_REPORT', report.reporterId);
    }
  }

  logAuditEvent('moderator', 'REPORT_STATUS_UPDATED', report.id);
  save();
  res.json({ message: 'Report updated successfully.', report });
});

// ===============================================================
// 2. USER AUTHENTICATION & SESSIONS (Section 5, 19, 20)
// ===============================================================

// Create user session / Register (POST /auth/register and POST /api/auth/register)
app.post(['/auth/register', '/api/auth/register'], (req, res) => {
  const { name, alias, email, password, country, nativeLanguage, learningLanguage, level } = req.body;

  if (!name || typeof name !== 'string' || name.trim().length < 2) {
    return res.status(400).json({ error: 'Display name is required (min 2 chars).' });
  }

  if (!password || typeof password !== 'string' || password.length < 6) {
    return res.status(400).json({ error: 'Password must be at least 6 characters long.' });
  }

  const normalizedEmail = (email || `${name.toLowerCase().replace(/\s+/g, '')}@bytalk.app`).toLowerCase().trim();

  if (store.users.some((u) => u.email && u.email.toLowerCase() === normalizedEmail)) {
    return res.status(409).json({ error: 'An account with this email address already exists.' });
  }

  const userId = `u_${crypto.randomBytes(6).toString('hex')}`;
  const newUser = {
    id: userId,
    name: name.trim().slice(0, 80),
    alias: alias ? alias.trim().slice(0, 40) : name.trim().split(' ')[0],
    email: normalizedEmail,
    passwordHash: hashPassword(password),
    country: country?.trim() || 'Global',
    nativeLanguage: nativeLanguage?.trim() || 'English',
    learningLanguage: learningLanguage?.trim() || 'English',
    level: level?.trim() || 'Intermediate',
    online: true,
    streak: 1,
    minutes: 0,
    words: 0,
    quizzesCompleted: 0,
    savedPhrases: [],
    blockedUsers: [],
    referralCode: `BYTALK-${name.trim().toUpperCase().slice(0, 5)}-${Math.floor(100 + Math.random() * 900)}`,
    referredCount: 0,
    subscription: { plan: 'free', status: 'active', startedAt: new Date().toISOString() },
    createdAt: new Date().toISOString()
  };

  store.users.push(newUser);
  logAuditEvent(newUser.id, 'USER_REGISTERED', newUser.id);
  save();

  io.emit('users:changed', store.users.map(({ passwordHash, ...u }) => u));
  io.emit('users:presence', { userId: newUser.id, online: true });
  io.emit('stats:changed');

  const token = signJwt({ userId: newUser.id, name: newUser.name, email: newUser.email });
  const { passwordHash, ...safeUser } = newUser;

  res.status(201).json({
    message: 'User registered successfully.',
    token,
    user: safeUser
  });
});

// Create user session / Login (POST /auth/login and POST /api/auth/login)
app.post(['/auth/login', '/api/auth/login'], (req, res) => {
  const { identifier, email, password } = req.body;
  const loginKey = String(identifier || email || '').toLowerCase().trim();

  if (!loginKey) {
    return res.status(400).json({ error: 'Email, username, or ID is required to login.' });
  }

  const user = store.users.find(
    (u) =>
      u.id === loginKey ||
      (u.email && u.email.toLowerCase() === loginKey) ||
      (u.name && u.name.toLowerCase() === loginKey) ||
      (u.alias && u.alias.toLowerCase() === loginKey)
  );

  if (!user) {
    return res.status(401).json({ error: 'No user account found matching those credentials.' });
  }

  if (user.passwordHash) {
    if (!password || !verifyPassword(password, user.passwordHash)) {
      return res.status(401).json({ error: 'Invalid password.' });
    }
  } else if (password && typeof password === 'string' && password.length >= 4) {
    user.passwordHash = hashPassword(password);
    save();
  }

  user.online = true;
  save();

  io.emit('users:changed', store.users.map(({ passwordHash, ...u }) => u));
  io.emit('users:presence', { userId: user.id, online: true });
  io.emit('stats:changed');

  const token = signJwt({ userId: user.id, name: user.name, email: user.email || '' });
  const { passwordHash, ...safeUser } = user;

  res.json({
    message: 'Login successful.',
    token,
    user: safeUser
  });
});

// Password Reset Request (Section 5.1: "password reset and verification")
app.post(['/auth/forgot-password', '/api/auth/forgot-password'], (req, res) => {
  const { email } = req.body;
  if (!email) return res.status(400).json({ error: 'Email address is required.' });
  const user = store.users.find((u) => (u.email || '').toLowerCase() === email.toLowerCase().trim());
  if (!user) {
    return res.json({ message: 'If that email is registered, a password reset token has been generated.' });
  }
  const resetToken = crypto.randomBytes(24).toString('hex');
  if (!store.passwordResetTokens) store.passwordResetTokens = [];
  store.passwordResetTokens.push({
    userId: user.id,
    token: resetToken,
    expiresAt: Date.now() + 3600 * 1000 // 1 hour validity
  });
  logAuditEvent(user.id, 'PASSWORD_RESET_REQUESTED', user.id);
  save();
  res.json({
    message: 'Password reset token generated.',
    resetToken
  });
});

// Password Reset Completion (Section 5.1)
app.post(['/auth/reset-password', '/api/auth/reset-password'], (req, res) => {
  const { resetToken, newPassword } = req.body;
  if (!resetToken || !newPassword || newPassword.length < 6) {
    return res.status(400).json({ error: 'Valid reset token and new password (min 6 chars) are required.' });
  }
  if (!store.passwordResetTokens) store.passwordResetTokens = [];
  const tokenEntry = store.passwordResetTokens.find(
    (t) => t.token === resetToken && t.expiresAt > Date.now()
  );
  if (!tokenEntry) {
    return res.status(400).json({ error: 'Invalid or expired password reset token.' });
  }
  const user = store.users.find((u) => u.id === tokenEntry.userId);
  if (!user) return res.status(404).json({ error: 'User not found.' });

  user.passwordHash = hashPassword(newPassword);
  store.passwordResetTokens = store.passwordResetTokens.filter((t) => t.token !== resetToken);
  logAuditEvent(user.id, 'PASSWORD_RESET_COMPLETED', user.id);
  save();
  res.json({ message: 'Password reset successful. You can now login with your new password.' });
});

// User Profile (GET /me, PATCH /me, DELETE /me per Section 16 & 20)
app.get(['/me', '/api/me'], optionalAuth(store), (req, res) => {
  const user = req.user || store.users[0];
  const { passwordHash, ...safeUser } = user;
  res.json({ user: safeUser });
});

app.patch(['/me', '/api/me'], optionalAuth(store), (req, res) => {
  const user = req.user || store.users[0];
  const allowed = ['alias', 'name', 'country', 'level', 'nativeLanguage', 'learningLanguage', 'goals', 'interests', 'avatar'];

  allowed.forEach((field) => {
    if (req.body[field] !== undefined) {
      user[field] = req.body[field];
    }
  });

  save();
  const { passwordHash, ...safeUser } = user;
  res.json({ message: 'Profile updated successfully.', user: safeUser });
});

// Privacy Account Deletion (Section 16: "Expose account deletion, data export/request")
app.delete(['/me', '/api/me'], optionalAuth(store), (req, res) => {
  const user = req.user || store.users.find((u) => u.id === req.body.userId);
  if (!user) return res.status(404).json({ error: 'User not found' });

  store.users = store.users.filter((u) => u.id !== user.id);
  store.messages = store.messages.filter((m) => m.from !== user.id && m.to !== user.id);
  store.vocabulary = store.vocabulary.filter((v) => v.userId !== user.id);
  logAuditEvent(user.id, 'ACCOUNT_DELETED', user.id);
  save();

  res.json({ message: 'Account and associated personal data deleted cleanly.' });
});

// Privacy Data Export / Takeout (Section 16: "data export/request consistent with applicable laws")
app.get(['/me/export', '/api/me/export'], optionalAuth(store), (req, res) => {
  const user = req.user || store.users[0];
  const { passwordHash, ...safeUser } = user;
  const userNotes = (store.notes || []).filter((n) => n.userId === user.id);
  const userVocab = (store.vocabulary || []).filter((v) => v.userId === user.id);
  const userSavedPhrases = COMMON_PHRASES.filter((p) => (user.savedPhrases || []).includes(p.id));
  const userFeedback = (store.callFeedback || []).filter((f) => f.userId === user.id);

  logAuditEvent(user.id, 'DATA_EXPORT_REQUESTED', user.id);

  res.setHeader('Content-Disposition', `attachment; filename="bytalk-export-${user.id}.json"`);
  res.json({
    exportVersion: '1.0',
    exportedAt: new Date().toISOString(),
    user: safeUser,
    learningHistory: {
      streak: user.streak || 0,
      practiceMinutes: user.minutes || 0,
      wordsCount: user.words || 0,
      quizzesCompleted: user.quizzesCompleted || 0
    },
    vocabulary: userVocab,
    savedPhrases: userSavedPhrases,
    notes: userNotes,
    callFeedback: userFeedback
  });
});

// ===============================================================
// 3. RANDOM MATCHMAKING & SESSION APIS (Section 7, 20)
// ===============================================================

// REST Match Request (POST /matches, DELETE /matches/:id)
const pendingMatchRequests = new Map();

app.post(['/matches', '/api/matches'], optionalAuth(store), (req, res) => {
  const user = req.user || store.users.find((u) => u.id === req.body.userId) || store.users[0];
  const requestId = `req_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;

  // Find another pending match request not blocked
  let matchedEntry = null;
  for (const [otherReqId, entry] of pendingMatchRequests.entries()) {
    if (entry.userId !== user.id && !(user.blockedUsers || []).includes(entry.userId)) {
      matchedEntry = { otherReqId, ...entry };
      break;
    }
  }

  if (matchedEntry) {
    pendingMatchRequests.delete(matchedEntry.otherReqId);
    const sessionId = `call_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const partnerUser = store.users.find((u) => u.id === matchedEntry.userId);

    res.json({
      status: 'matched',
      sessionId,
      partner: {
        id: partnerUser?.id || matchedEntry.userId,
        alias: partnerUser?.alias || partnerUser?.name || 'Partner',
        country: partnerUser?.country || 'Global',
        level: partnerUser?.level || 'Intermediate'
      }
    });
  } else {
    pendingMatchRequests.set(requestId, {
      userId: user.id,
      timestamp: Date.now()
    });

    res.status(202).json({
      status: 'queued',
      requestId,
      message: 'Entered random voice matching queue.'
    });
  }
});

app.delete(['/matches/:id', '/api/matches/:id'], (req, res) => {
  pendingMatchRequests.delete(req.params.id);
  res.json({ message: 'Match request cancelled or ended successfully.' });
});

// ===============================================================
// 4. WORD GAME & VOCABULARY CONTENT (Section 10, 20)
// ===============================================================

// Get game questions across all 5 types (GET /games/questions)
app.get(['/games/questions', '/api/games/questions'], (req, res) => {
  const { type } = req.query;
  let questions = WORD_GAME_BANK;

  if (type && typeof type === 'string' && type.toLowerCase() !== 'all') {
    questions = questions.filter((q) => q.type.toLowerCase() === type.toLowerCase());
  }

  // Client view: sanitize by withholding direct answer index
  const clientQuestions = questions.map((q) => ({
    id: q.id,
    type: q.type,
    prompt: q.prompt,
    options: q.options,
    difficulty: q.difficulty
  }));

  res.json({
    total: clientQuestions.length,
    gameTypes: ['Word Meaning', 'Fill in the Blank', 'Synonym / Antonym', 'Word Formation', 'Daily Challenge'],
    questions: clientQuestions
  });
});

// Record user game attempt & evaluate score (POST /games/attempts)
app.post(['/games/attempts', '/api/games/attempts'], optionalAuth(store), (req, res) => {
  const user = req.user || store.users.find((u) => u.id === req.body.userId) || store.users[0];
  const { answers } = req.body;

  const result = evaluateGameAttempt(user, answers || {});
  save();

  res.json({
    attemptId: crypto.randomUUID(),
    userId: user.id,
    ...result
  });
});

// Daily Challenge shortcut
app.get(['/api/quiz/daily', '/quiz/daily'], (req, res) => {
  res.json({
    challengeId: DAILY_CHALLENGE.id,
    date: DAILY_CHALLENGE.date,
    wordOfTheDay: DAILY_CHALLENGE.wordOfTheDay,
    theme: DAILY_CHALLENGE.theme,
    questions: DAILY_CHALLENGE.questions.map((q) => ({
      id: q.id,
      type: q.type,
      prompt: q.prompt,
      options: q.options
    }))
  });
});

// ===============================================================
// 5. COMMON PHRASES & FAVORITES (Section 11, 20)
// ===============================================================

// Fetch phrase library (GET /phrases)
app.get(['/phrases', '/api/phrases'], (req, res) => {
  const { category, search } = req.query;
  let phrases = COMMON_PHRASES;

  if (category && typeof category === 'string' && category.toLowerCase() !== 'all') {
    phrases = phrases.filter((p) => p.category.toLowerCase() === category.toLowerCase());
  }

  if (search && typeof search === 'string' && search.trim()) {
    const q = search.toLowerCase().trim();
    phrases = phrases.filter(
      (p) =>
        p.phrase.toLowerCase().includes(q) ||
        p.meaning.toLowerCase().includes(q) ||
        p.example.toLowerCase().includes(q)
    );
  }

  const categories = ['all', 'greetings', 'introductions', 'shopping', 'travel', 'work', 'interviews', 'education', 'everyday conversation'];

  res.json({
    total: phrases.length,
    categories,
    phrases
  });
});

// Save favourite phrase (POST /phrases/:id/favourite and POST /phrases/bookmark)
app.post(['/phrases/:id/favourite', '/api/phrases/:id/favourite', '/api/phrases/bookmark'], optionalAuth(store), (req, res) => {
  const phraseId = req.params.id || req.body.phraseId;
  const user = req.user || store.users.find((u) => u.id === req.body.userId) || store.users[0];

  if (!user.savedPhrases) user.savedPhrases = [];

  const exists = user.savedPhrases.includes(phraseId);
  if (exists) {
    user.savedPhrases = user.savedPhrases.filter((id) => id !== phraseId);
  } else {
    user.savedPhrases.push(phraseId);
  }

  save();
  res.json({
    phraseId,
    favourited: !exists,
    favourites: user.savedPhrases
  });
});

// Get user's saved phrases
app.get(['/phrases/favourites/:userId', '/api/phrases/favourites/:userId'], (req, res) => {
  const user = store.users.find((u) => u.id === req.params.userId);
  if (!user) return res.status(404).json({ error: 'User not found' });

  const favList = COMMON_PHRASES.filter((p) => (user.savedPhrases || []).includes(p.id));
  res.json({ total: favList.length, favourites: favList });
});

// ===============================================================
// 6. BLOCKING & SAFETY CONTROLS (Section 12, 20)
// ===============================================================

// Block a user (POST /blocks and POST /api/blocks)
app.post(['/blocks', '/api/blocks'], optionalAuth(store), (req, res) => {
  const user = req.user || store.users.find((u) => u.id === req.body.userId) || store.users[0];
  const { targetUserId, reason } = req.body;

  if (!targetUserId) {
    return res.status(400).json({ error: 'targetUserId is required' });
  }

  if (!user.blockedUsers) user.blockedUsers = [];
  if (!user.blockedUsers.includes(targetUserId)) {
    user.blockedUsers.push(targetUserId);
  }

  const blockRecord = {
    id: crypto.randomUUID(),
    blockerId: user.id,
    blockedId: targetUserId,
    reason: reason || 'Inappropriate interaction',
    timestamp: new Date().toISOString()
  };
  store.blocks.push(blockRecord);
  logAuditEvent(user.id, 'USER_BLOCKED', targetUserId);
  save();

  res.status(201).json({
    message: 'User blocked successfully. You will not be rematched with this account.',
    blockRecord
  });
});

// Get block list
app.get(['/blocks/:userId', '/api/blocks/:userId'], (req, res) => {
  const user = store.users.find((u) => u.id === req.params.userId);
  if (!user) return res.status(404).json({ error: 'User not found' });
  res.json({ blockedUsers: user.blockedUsers || [] });
});

// Unblock a user
app.delete(['/blocks/:userId/:targetId', '/api/blocks/:userId/:targetId'], (req, res) => {
  const user = store.users.find((u) => u.id === req.params.userId);
  if (!user) return res.status(404).json({ error: 'User not found' });

  user.blockedUsers = (user.blockedUsers || []).filter((id) => id !== req.params.targetId);
  store.blocks = store.blocks.filter((b) => !(b.blockerId === user.id && b.blockedId === req.params.targetId));
  save();

  res.json({ message: 'User unblocked successfully.' });
});

// ===============================================================
// 7. REFERRALS & SHARING (Section 15, 20)
// ===============================================================

// Claim invite token or referral code (POST /referrals/claim)
app.post(['/referrals/claim', '/api/referrals/claim'], optionalAuth(store), (req, res) => {
  const { referralCode, newUserId } = req.body;
  if (!referralCode || typeof referralCode !== 'string') {
    return res.status(400).json({ error: 'Valid referral code required.' });
  }

  const codeClean = referralCode.trim().toUpperCase();
  const inviter = store.users.find(
    (u) =>
      (u.referralCode || '').toUpperCase() === codeClean ||
      (u.referralCode || '').toUpperCase().startsWith(codeClean)
  );

  if (!inviter) {
    return res.status(404).json({ error: 'Invalid or expired referral code.' });
  }

  if (inviter.id === newUserId) {
    return res.status(400).json({ error: 'Self-referral is not permitted.' });
  }

  inviter.referredCount = (inviter.referredCount || 0) + 1;
  logAuditEvent(inviter.id, 'REFERRAL_CLAIMED', newUserId || 'new_user');
  save();

  res.json({
    status: 'qualified',
    message: 'Referral attributed successfully.',
    inviterAlias: inviter.alias || 'Partner'
  });
});

// Get referral details for a user
app.get(['/referrals/:userId', '/api/referrals/:userId'], (req, res) => {
  const user = store.users.find((u) => u.id === req.params.userId);
  if (!user) return res.status(404).json({ error: 'User not found' });

  res.json({
    referralCode: user.referralCode,
    referredLearners: user.referredCount || 0,
    shareUrl: `https://bytalk.app/invite/${user.referralCode}`
  });
});

// ===============================================================
// 8. ADMIN AUDIT & MONITORING (Section 17, 19)
// ===============================================================

app.get(['/admin/audit', '/api/admin/audit'], (req, res) => {
  res.json({ total: store.auditLogs.length, auditLogs: store.auditLogs.slice(-50).reverse() });
});

// Admin User Status Toggle (Suspend / Ban / Activate per Section 12 & 17)
app.patch(['/admin/users/:id/status', '/api/admin/users/:id/status'], (req, res) => {
  const user = store.users.find((u) => u.id === req.params.id);
  if (!user) return res.status(404).json({ error: 'User not found' });
  const { status } = req.body;
  if (!['active', 'suspended', 'banned'].includes(status)) {
    return res.status(400).json({ error: 'Status must be active, suspended, or banned.' });
  }
  user.status = status;
  logAuditEvent('admin', `USER_${status.toUpperCase()}`, user.id);
  save();
  res.json({ message: `User status set to ${status}.`, user });
});

// Phrase CMS (Create & retire phrases per Section 17)
app.post(['/admin/phrases', '/api/admin/phrases'], (req, res) => {
  const { phrase, meaning, category, example } = req.body;
  if (!phrase || !meaning) {
    return res.status(400).json({ error: 'Phrase and meaning are required.' });
  }
  const newPhrase = {
    id: `phr_cms_${Date.now()}`,
    category: (category || 'everyday conversation').toLowerCase().trim(),
    phrase: phrase.trim(),
    meaning: meaning.trim(),
    usage: 'Curated phrase entry.',
    example: example?.trim() || phrase.trim()
  };
  COMMON_PHRASES.push(newPhrase);
  logAuditEvent('admin', 'PHRASE_CREATED', newPhrase.id);
  res.status(201).json({ message: 'Phrase added to library.', phrase: newPhrase });
});

app.delete(['/admin/phrases/:id', '/api/admin/phrases/:id'], (req, res) => {
  const idx = COMMON_PHRASES.findIndex((p) => p.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'Phrase not found.' });
  const removed = COMMON_PHRASES.splice(idx, 1)[0];
  logAuditEvent('admin', 'PHRASE_RETIRED', removed.id);
  res.json({ message: 'Phrase retired successfully.', phrase: removed });
});

// Vocabulary Question CMS (Section 17: "Vocabulary CMS: Create, edit, publish and retire word-game questions")
app.post(['/admin/questions', '/api/admin/questions'], (req, res) => {
  const { type, prompt, options, answer, difficulty, explanation } = req.body;
  if (!prompt || !Array.isArray(options) || options.length < 2 || answer === undefined) {
    return res.status(400).json({ error: 'Prompt, options array (min 2), and correct answer index are required.' });
  }
  const newQuestion = {
    id: `gm_cms_${Date.now()}`,
    type: type || 'Word Meaning',
    prompt: prompt.trim(),
    options,
    answer: Number(answer),
    difficulty: difficulty || 'Intermediate',
    explanation: explanation || 'Curated question.'
  };
  WORD_GAME_BANK.push(newQuestion);
  logAuditEvent('admin', 'QUESTION_CREATED', newQuestion.id);
  res.status(201).json({ message: 'Question added to game bank.', question: newQuestion });
});

app.delete(['/admin/questions/:id', '/api/admin/questions/:id'], (req, res) => {
  const idx = WORD_GAME_BANK.findIndex((q) => q.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'Question not found.' });
  const removed = WORD_GAME_BANK.splice(idx, 1)[0];
  logAuditEvent('admin', 'QUESTION_RETIRED', removed.id);
  res.json({ message: 'Question retired successfully.', question: removed });
});

// Call Experience Feedback (Section 4 & 20 & 23: "submit optional experience feedback", "call ended/feedback")
app.post(['/api/calls/feedback', '/calls/feedback'], optionalAuth(store), (req, res) => {
  const userId = req.user?.id || req.body.userId || 'anonymous';
  const { sessionId, partnerId, rating, audioQuality, tags, comment } = req.body;
  if (!rating || rating < 1 || rating > 5) {
    return res.status(400).json({ error: 'Rating between 1 and 5 is required.' });
  }
  const feedback = {
    id: `fb_${crypto.randomUUID()}`,
    userId,
    sessionId: sessionId || null,
    partnerId: partnerId || null,
    rating: Number(rating),
    audioQuality: audioQuality || 'good',
    tags: Array.isArray(tags) ? tags : [],
    comment: comment ? String(comment).slice(0, 300) : '',
    submittedAt: new Date().toISOString()
  };
  if (!store.callFeedback) store.callFeedback = [];
  store.callFeedback.push(feedback);
  logAuditEvent(userId, 'CALL_FEEDBACK_SUBMITTED', sessionId || partnerId);
  save();
  res.status(201).json({ message: 'Thank you for your feedback! It helps improve matching quality.', feedback });
});

// Learner Private Notes (Section 4 & 14: "take private learning notes", "deletion of user-controlled notes")
app.get(['/api/notes/:userId', '/notes/:userId'], optionalAuth(store), (req, res) => {
  const userId = req.params.userId;
  const userNotes = (store.notes || []).filter((n) => n.userId === userId);
  res.json({ total: userNotes.length, notes: userNotes });
});

app.post(['/api/notes', '/notes'], optionalAuth(store), (req, res) => {
  const userId = req.user?.id || req.body.userId || 'u1';
  const { title, content, partnerAlias, category } = req.body;
  if (!content || !content.trim()) {
    return res.status(400).json({ error: 'Note content cannot be empty.' });
  }
  const note = {
    id: `note_${crypto.randomUUID()}`,
    userId,
    title: title ? title.trim().slice(0, 100) : 'Practice Note',
    content: content.trim(),
    partnerAlias: partnerAlias || null,
    category: category || 'Speaking Practice',
    createdAt: new Date().toISOString()
  };
  if (!store.notes) store.notes = [];
  store.notes.push(note);
  logAuditEvent(userId, 'NOTE_CREATED', note.id);
  save();
  res.status(201).json(note);
});

app.delete(['/api/notes/:id', '/notes/:id'], (req, res) => {
  if (!store.notes) store.notes = [];
  const idx = store.notes.findIndex((n) => n.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'Note not found' });
  const [removed] = store.notes.splice(idx, 1);
  save();
  res.json({ message: 'Note deleted successfully.', note: removed });
});

// Notification Preferences (Section 13: "consent, category toggles, quiet hours and unsubscribe controls")
app.get(['/api/notifications/preferences/:userId', '/notifications/preferences/:userId'], (req, res) => {
  const userId = req.params.userId;
  const prefs = store.notificationPreferences?.[userId] || {
    dailyReminders: true,
    roomAlerts: true,
    weeklyProgress: true,
    quietHoursEnabled: false,
    quietHoursStart: '22:00',
    quietHoursEnd: '08:00'
  };
  res.json({ userId, preferences: prefs });
});

app.patch(['/api/notifications/preferences', '/notifications/preferences'], optionalAuth(store), (req, res) => {
  const userId = req.user?.id || req.body.userId || 'u1';
  if (!store.notificationPreferences) store.notificationPreferences = {};
  store.notificationPreferences[userId] = {
    ...(store.notificationPreferences[userId] || {
      dailyReminders: true,
      roomAlerts: true,
      weeklyProgress: true,
      quietHoursEnabled: false,
      quietHoursStart: '22:00',
      quietHoursEnd: '08:00'
    }),
    ...req.body
  };
  save();
  res.json({ message: 'Notification preferences updated.', preferences: store.notificationPreferences[userId] });
});

// ===============================================================
// NOTIFICATIONS MANAGEMENT (REST & REAL-TIME)
// ===============================================================

// Fetch notifications for a user
app.get(['/api/notifications', '/api/notifications/:userId', '/notifications', '/notifications/:userId'], optionalAuth(store), (req, res) => {
  const targetUserId = req.params.userId || req.query.userId || req.user?.id || 'u1';
  const unreadOnly = req.query.unread === 'true';
  const limit = Number(req.query.limit) || 50;

  if (!store.notifications) store.notifications = [];

  const userNotifs = store.notifications.filter(
    (n) => n.userId === targetUserId || n.userId === 'all'
  );

  const filtered = unreadOnly ? userNotifs.filter((n) => !n.read) : userNotifs;
  const unreadCount = userNotifs.filter((n) => !n.read).length;

  res.json({
    total: userNotifs.length,
    unreadCount,
    notifications: filtered.slice(0, limit)
  });
});

// Create/Send notification
app.post(['/api/notifications', '/notifications'], optionalAuth(store), (req, res) => {
  const { userId, type, title, message, icon, color, bgColor, data } = req.body;
  if (!title || !message) {
    return res.status(400).json({ error: 'Title and message are required for notification.' });
  }

  const notif = createNotification({
    userId: userId || req.user?.id || 'u1',
    type,
    title,
    message,
    icon,
    color,
    bgColor,
    data
  });

  res.status(201).json({ message: 'Notification created successfully.', notification: notif });
});

// Mark single notification as read
app.patch(['/api/notifications/:id/read', '/notifications/:id/read', '/api/notifications/:id', '/notifications/:id'], (req, res) => {
  if (!store.notifications) store.notifications = [];
  const notif = store.notifications.find((n) => n.id === req.params.id);
  if (!notif) return res.status(404).json({ error: 'Notification not found' });

  notif.read = req.body.read !== undefined ? Boolean(req.body.read) : true;
  save();
  res.json({ message: 'Notification marked as read.', notification: notif });
});

app.post(['/api/notifications/:id/read', '/notifications/:id/read'], (req, res) => {
  if (!store.notifications) store.notifications = [];
  const notif = store.notifications.find((n) => n.id === req.params.id);
  if (!notif) return res.status(404).json({ error: 'Notification not found' });

  notif.read = true;
  save();
  res.json({ message: 'Notification marked as read.', notification: notif });
});

// Mark all notifications as read for a user
app.post(['/api/notifications/read-all', '/notifications/read-all'], optionalAuth(store), (req, res) => {
  const userId = req.body.userId || req.user?.id || 'u1';
  if (!store.notifications) store.notifications = [];

  let count = 0;
  store.notifications.forEach((n) => {
    if ((n.userId === userId || n.userId === 'all') && !n.read) {
      n.read = true;
      count++;
    }
  });

  save();
  res.json({ message: `Marked ${count} notifications as read.`, unreadCount: 0 });
});

// Delete a notification
app.delete(['/api/notifications/:id', '/notifications/:id'], (req, res) => {
  if (!store.notifications) store.notifications = [];
  const idx = store.notifications.findIndex((n) => n.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'Notification not found' });

  const [removed] = store.notifications.splice(idx, 1);
  save();
  res.json({ message: 'Notification deleted.', notification: removed });
});

// ===============================================================
// SUBSCRIPTION & PREMIUM TIERS (BYTALK PRO)
// ===============================================================

app.get(['/api/subscription/plans', '/subscription/plans'], (req, res) => {
  res.json({
    plans: [
      {
        id: 'free',
        name: 'Free Starter',
        price: 'Free',
        period: 'Forever',
        features: [
          '15 minutes daily conversation practice',
          'Access to public live audio rooms',
          'Standard partner matchmaking',
          'Daily Word of the Day & 5 questions'
        ]
      },
      {
        id: 'pro',
        name: 'BYTALK Pro',
        price: '$9.99',
        priceInr: '₹499',
        period: '/ month',
        badge: 'POPULAR',
        features: [
          'Unlimited speaking minutes & direct audio calls',
          'Priority matching with fluent/native speakers',
          'Stage speaker pass in all audio rooms',
          'Full Word Game bank (all 5 difficulty types)',
          'AI pronunciation feedback & speaking analysis',
          'Exclusive Pro Learner verification badge',
          'Ad-free uninterrupted learning'
        ]
      }
    ]
  });
});

app.get(['/api/subscription/:userId', '/subscription/:userId'], (req, res) => {
  const user = store.users.find((u) => u.id === req.params.userId);
  if (!user) return res.status(404).json({ error: 'User not found' });
  res.json({
    userId: user.id,
    subscription: user.subscription || { plan: 'free', status: 'active' }
  });
});

app.post(['/api/subscription/upgrade', '/subscription/upgrade'], optionalAuth(store), (req, res) => {
  const userId = req.body.userId || req.user?.id || 'u1';
  const { plan = 'pro', paymentMethod = 'mock_card' } = req.body;

  const user = store.users.find((u) => u.id === userId);
  if (!user) return res.status(404).json({ error: 'User not found' });

  const expiry = new Date();
  expiry.setMonth(expiry.getMonth() + 1);

  user.subscription = {
    plan,
    status: 'active',
    startedAt: new Date().toISOString(),
    expiresAt: expiry.toISOString(),
    paymentMethod
  };

  logAuditEvent(user.id, 'SUBSCRIPTION_UPGRADED', plan);
  save();

  createNotification({
    userId: user.id,
    type: 'system',
    icon: 'star',
    color: '#8B5CF6',
    bgColor: '#F3EEFF',
    title: 'Welcome to BYTALK Pro! 🎉',
    message: 'Your Pro plan is active. Enjoy unlimited calls, native partner matching, and AI evaluation.'
  });

  io.emit('users:changed', store.users.map(({ passwordHash, ...u }) => u));
  io.emit('stats:changed');

  res.json({
    message: 'Subscription upgraded to BYTALK Pro successfully!',
    subscription: user.subscription
  });
});

app.post(['/api/subscription/cancel', '/subscription/cancel'], optionalAuth(store), (req, res) => {
  const userId = req.body.userId || req.user?.id || 'u1';
  const user = store.users.find((u) => u.id === userId);
  if (!user) return res.status(404).json({ error: 'User not found' });

  user.subscription = {
    plan: 'free',
    status: 'cancelled',
    cancelledAt: new Date().toISOString()
  };

  logAuditEvent(user.id, 'SUBSCRIPTION_CANCELLED', 'free');
  save();

  io.emit('users:changed', store.users.map(({ passwordHash, ...u }) => u));
  io.emit('stats:changed');

  res.json({
    message: 'Subscription reverted to Free Starter plan.',
    subscription: user.subscription
  });
});

// ===============================================================
// 9. DASHBOARD AGGREGATED VIEW (Section 6, 14)
// ===============================================================

app.get(['/api/dashboard/:userId', '/dashboard/:userId'], (req, res) => {
  const targetId = req.params.userId || 'u1';
  const user = store.users.find((u) => u.id === targetId);

  if (!user) return res.status(404).json({ error: 'User not found' });

  const safePartners = store.users
    .filter((u) => u.id !== targetId && u.online && !(user.blockedUsers || []).includes(u.id))
    .slice(0, 5)
    .map((u) => {
      const { passwordHash, ...safe } = u;
      return safe;
    });

  const { passwordHash, ...safeProfile } = user;

  res.json({
    user: safeProfile,
    stats: {
      streak: user.streak || 0,
      minutes: user.minutes || 0,
      words: user.words || 0,
      quizzesCompleted: user.quizzesCompleted || 0,
      savedPhrasesCount: (user.savedPhrases || []).length
    },
    wordOfTheDay: DAILY_CHALLENGE.wordOfTheDay,
    quickActionPhrases: COMMON_PHRASES.slice(0, 4),
    activeRooms: store.rooms.slice(0, 4),
    availablePartners: safePartners
  });
});

// ===============================================================
// 10. SOCKET.IO & WEBRTC SIGNALING (Section 7, 8, 9, 18, 20)
// ===============================================================

io.on('connection', (socket) => {
  console.log(`[Socket.IO] Client connected: ${socket.id} (Transport: ${socket.conn.transport.name})`);

  socket.on('disconnect', (reason) => {
    console.log(`[Socket.IO] Client disconnected: ${socket.id} (Reason: ${reason})`);
  });

  socket.on('ping:app', () => socket.emit('pong:app'));
});

// Initialize full WebRTC audio signaling, matchmaking, and room stage management
setupSignaling(io, store, save);

// Global 404 handler for undefined API routes
app.use((req, res) => {
  res.status(404).json({ error: 'Endpoint not found', path: req.originalUrl, service: 'BYTALK API' });
});

// Global error-handling middleware
app.use((err, req, res, next) => {
  console.error('[Unhandled Error]', err);
  res.status(err.status || 500).json({ error: err.message || 'Internal Server Error' });
});

// Start server with MongoDB Atlas connection
const port = Number(process.env.PORT || 4000);

async function startServer() {
  await connectDB();
  await syncStoreWithMongo(store);

  httpServer.on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
      console.error(`\n❌ [PORT CONFLICT] Port ${port} is already in use by another running process.`);
      console.error(`👉 Run the following in PowerShell to free port ${port}:`);
      console.error(`   Stop-Process -Id (Get-NetTCPConnection -LocalPort ${port} -State Listen).OwningProcess -Force`);
      console.error(`   Or launch with an alternate port: PORT=${port + 1} npm start\n`);
      process.exit(1);
    } else {
      console.error('[HTTP Server Error]', err);
    }
  });

  httpServer.listen(port, '0.0.0.0', () => {
    const dbStatus = getDbStatus();
    console.log(`BYTALK backend running on http://localhost:${port}`);
    console.log(`✅ [DATABASE] MongoDB Atlas Status: ${dbStatus.isConnected ? 'Connected' : dbStatus.state} (${dbStatus.host || 'remote'})`);
  });
}

startServer();

// Graceful shutdown handling
const shutdown = async (signal) => {
  console.log(`\nReceived ${signal}. Shutting down cleanly...`);
  await disconnectDB();
  httpServer.close(() => {
    console.log('HTTP server closed.');
    process.exit(0);
  });
};

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
