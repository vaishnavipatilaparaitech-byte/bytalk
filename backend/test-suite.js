// Comprehensive End-to-End Test Suite for BYTALK
// Tests all REST endpoints and Socket.IO signaling events

import http from 'http';
import { io as ClientIO } from '../mobile/node_modules/socket.io-client/build/esm/index.js';

const BASE_URL = 'http://localhost:4000';

async function request(path, options = {}) {
  const url = `${BASE_URL}${path}`;
  const headers = { 'Content-Type': 'application/json', ...(options.headers || {}) };
  const res = await fetch(url, {
    ...options,
    headers
  });
  const data = await res.json().catch(() => ({}));
  return { status: res.status, ok: res.ok, data };
}

async function runTests() {
  console.log('--- STARTING BYTALK COMPREHENSIVE TEST SUITE ---\n');
  let passed = 0;
  let failed = 0;

  function assert(condition, testName, extra = '') {
    if (condition) {
      console.log(`✅ PASS: ${testName}`);
      passed++;
    } else {
      console.error(`❌ FAIL: ${testName} ${extra}`);
      failed++;
    }
  }

  // 1. Health & Welcome
  const health = await request('/api/health');
  assert(health.ok && health.data.ok === true, 'GET /api/health');

  const root = await request('/');
  assert(root.ok && root.data.service === 'BYTALK Backend API', 'GET / (Service Discovery)');

  // 2. Authentication (Register & Login)
  const testEmail = `test_${Date.now()}@bytalk.app`;
  const reg = await request('/auth/register', {
    method: 'POST',
    body: JSON.stringify({
      name: 'E2E Tester',
      email: testEmail,
      password: 'password123',
      country: 'India',
      level: 'Intermediate'
    })
  });
  assert(reg.status === 201 && reg.data.token, 'POST /auth/register', JSON.stringify(reg.data));
  const token = reg.data.token;
  const testUserId = reg.data.user?.id;

  const login = await request('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ identifier: testEmail, password: 'password123' })
  });
  assert(login.ok && login.data.token, 'POST /auth/login', JSON.stringify(login.data));

  // 3. User Profile & Directory
  const me = await request('/me', { headers: { Authorization: `Bearer ${token}` } });
  assert(me.ok && me.data.user?.id === testUserId, 'GET /me (Authenticated Profile)');

  const updateProfile = await request('/me', {
    method: 'PATCH',
    headers: { Authorization: `Bearer ${token}` },
    body: JSON.stringify({ alias: 'SuperTester' })
  });
  assert(updateProfile.ok && updateProfile.data.user?.alias === 'SuperTester', 'PATCH /me');

  const users = await request('/api/users');
  assert(users.ok && Array.isArray(users.data) && users.data.length > 0, 'GET /api/users');

  const partners = await request('/api/partners?q=');
  assert(partners.ok && Array.isArray(partners.data), 'GET /api/partners');

  // 4. Matchmaking
  const matchReq = await request('/matches', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: JSON.stringify({ userId: testUserId })
  });
  assert(matchReq.status === 202 || matchReq.status === 200, 'POST /matches (Queue Entry)');

  if (matchReq.data.requestId) {
    const cancelMatch = await request(`/matches/${matchReq.data.requestId}`, { method: 'DELETE' });
    assert(cancelMatch.ok, 'DELETE /matches/:id (Queue Exit)');
  }

  // 5. Audio Rooms
  const initialRooms = await request('/api/rooms');
  assert(initialRooms.ok && Array.isArray(initialRooms.data), 'GET /api/rooms');

  const createRoom = await request('/api/rooms', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: JSON.stringify({
      name: 'E2E Audio Test Room',
      topic: 'Daily English',
      capacity: 40,
      hostId: testUserId
    })
  });
  assert(createRoom.status === 201 && createRoom.data.id, 'POST /api/rooms (Create Room)');
  const testRoomId = createRoom.data.id;

  const joinRoom = await request(`/api/rooms/${testRoomId}/join`, { method: 'POST' });
  assert(joinRoom.ok && joinRoom.data.listeners >= 1, 'POST /api/rooms/:id/join');

  const raiseHand = await request(`/api/rooms/${testRoomId}/raise-hand`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: JSON.stringify({ userId: testUserId })
  });
  assert(raiseHand.ok, 'POST /api/rooms/:id/raise-hand (Speaker Request)');

  const approveSpeaker = await request(`/api/rooms/${testRoomId}/approve-speaker`, {
    method: 'POST',
    body: JSON.stringify({ userId: testUserId })
  });
  assert(approveSpeaker.ok, 'POST /api/rooms/:id/approve-speaker');

  const leaveRoom = await request(`/api/rooms/${testRoomId}/leave`, { method: 'POST' });
  assert(leaveRoom.ok, 'POST /api/rooms/:id/leave');

  // 6. Direct Messages
  const sendMsg = await request('/api/messages', {
    method: 'POST',
    body: JSON.stringify({ from: 'u1', to: 'u2', text: 'Hello from test suite!' })
  });
  assert(sendMsg.status === 201 && sendMsg.data.id, 'POST /api/messages');

  const getMsgs = await request('/api/messages/u1/u2');
  assert(getMsgs.ok && Array.isArray(getMsgs.data) && getMsgs.data.length > 0, 'GET /api/messages/:a/:b');

  // 7. Vocabulary & Word Games
  const gameQuestions = await request('/games/questions');
  assert(gameQuestions.ok && gameQuestions.data.total >= 5, 'GET /games/questions');

  const dailyQuiz = await request('/api/quiz/daily');
  assert(dailyQuiz.ok && dailyQuiz.data.wordOfTheDay, 'GET /api/quiz/daily');

  const gameAttempt = await request('/games/attempts', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: JSON.stringify({
      answers: { q_meaning_1: 0, q_fitb_1: 0 }
    })
  });
  assert(gameAttempt.ok && gameAttempt.data.score !== undefined, 'POST /games/attempts');

  const addVocab = await request('/api/vocabulary', {
    method: 'POST',
    body: JSON.stringify({ userId: testUserId, word: 'articulate', category: 'Speaking' })
  });
  assert(addVocab.status === 201 && addVocab.data.word === 'articulate', 'POST /api/vocabulary');

  const getVocab = await request(`/api/vocabulary/${testUserId}`);
  assert(getVocab.ok && getVocab.data.some((v) => v.word === 'articulate'), 'GET /api/vocabulary/:userId');

  // 8. Everyday Phrases Library
  const phrases = await request('/phrases');
  assert(phrases.ok && phrases.data.total >= 8, 'GET /phrases');

  const favPhrase = await request('/phrases/phr_greet_1/favourite', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` }
  });
  assert(favPhrase.ok && favPhrase.data.favourited === true, 'POST /phrases/:id/favourite');

  const addPhraseCMS = await request('/admin/phrases', {
    method: 'POST',
    body: JSON.stringify({
      phrase: 'Test Phrase CMS',
      meaning: 'A test phrase for CMS verification',
      category: 'everyday conversation'
    })
  });
  assert(addPhraseCMS.status === 201 && addPhraseCMS.data.phrase.id, 'POST /admin/phrases');
  const customPhraseId = addPhraseCMS.data.phrase.id;

  const deletePhraseCMS = await request(`/admin/phrases/${customPhraseId}`, { method: 'DELETE' });
  assert(deletePhraseCMS.ok, 'DELETE /admin/phrases/:id');

  // 9. Safety, Blocking & Moderation
  const blockUser = await request('/blocks', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: JSON.stringify({ targetUserId: 'u3', reason: 'Unsolicited spamming' })
  });
  assert(blockUser.status === 201, 'POST /blocks (Block User)');

  const getBlocks = await request(`/blocks/${testUserId}`);
  assert(getBlocks.ok && getBlocks.data.blockedUsers.includes('u3'), 'GET /blocks/:userId');

  const reportUser = await request('/reports', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: JSON.stringify({
      reportedUserId: 'u3',
      reason: 'Repeated inappropriate behavior during audio session.'
    })
  });
  assert(reportUser.status === 201 && reportUser.data.report.id, 'POST /reports');
  const testReportId = reportUser.data.report.id;

  // Anti-Spam: Test self-reporting rejection
  const selfReport = await request('/reports', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: JSON.stringify({ reportedUserId: testUserId, reason: 'Trying to report self.' })
  });
  assert(selfReport.status === 400, 'POST /reports (Prevent Self-Reporting)');

  const resolveReport = await request(`/api/reports/${testReportId}`, {
    method: 'PATCH',
    body: JSON.stringify({ status: 'resolved' })
  });
  assert(resolveReport.ok && resolveReport.data.report.status === 'resolved', 'PATCH /api/reports/:id');

  const unblockUser = await request(`/blocks/${testUserId}/u3`, { method: 'DELETE' });
  assert(unblockUser.ok, 'DELETE /blocks/:userId/:targetId');

  // 10. Referrals
  const referrals = await request(`/referrals/${testUserId}`);
  assert(referrals.ok && referrals.data.referralCode, 'GET /referrals/:userId');

  const claimReferral = await request('/referrals/claim', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: JSON.stringify({ referralCode: 'BYTALK-PAVAN', newUserId: testUserId })
  });
  assert(claimReferral.ok && claimReferral.data.status === 'qualified', 'POST /referrals/claim');

  // 11. Admin Audit & User Management
  const auditLogs = await request('/admin/audit');
  assert(auditLogs.ok && Array.isArray(auditLogs.data.auditLogs), 'GET /admin/audit');

  const suspendUser = await request(`/admin/users/${testUserId}/status`, {
    method: 'PATCH',
    body: JSON.stringify({ status: 'suspended' })
  });
  assert(suspendUser.ok && suspendUser.data.user.status === 'suspended', 'PATCH /admin/users/:id/status (Suspend)');

  const reactivateUser = await request(`/admin/users/${testUserId}/status`, {
    method: 'PATCH',
    body: JSON.stringify({ status: 'active' })
  });
  assert(reactivateUser.ok && reactivateUser.data.user.status === 'active', 'PATCH /admin/users/:id/status (Reactivate)');

  const stats = await request('/api/stats');
  assert(stats.ok && stats.data.users > 0, 'GET /api/stats');

  // 12. Advanced PRD Features: Notes, Feedback, Data Export, Preferences, Password Reset, Question CMS
  // Room by ID
  const getSingleRoom = await request(`/api/rooms/${testRoomId}`);
  assert(getSingleRoom.ok && getSingleRoom.data.id === testRoomId, 'GET /api/rooms/:id');

  // Call Feedback
  const submitFeedback = await request('/api/calls/feedback', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: JSON.stringify({
      sessionId: 'call_test_123',
      rating: 5,
      audioQuality: 'excellent',
      tags: ['fluent', 'helpful'],
      comment: 'Great conversation partner!'
    })
  });
  assert(submitFeedback.status === 201 && submitFeedback.data.feedback, 'POST /api/calls/feedback');

  // Learner Private Notes
  const createNote = await request('/api/notes', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: JSON.stringify({
      title: 'Vocabulary from Call',
      content: 'Partner introduced idiom: beat around the bush.'
    })
  });
  assert(createNote.status === 201 && createNote.data.id, 'POST /api/notes');
  const testNoteId = createNote.data.id;

  const getNotes = await request(`/api/notes/${testUserId}`);
  assert(getNotes.ok && getNotes.data.total >= 1, 'GET /api/notes/:userId');

  const deleteNote = await request(`/api/notes/${testNoteId}`, { method: 'DELETE' });
  assert(deleteNote.ok, 'DELETE /api/notes/:id');

  // Data Export / GDPR
  const dataExport = await request('/me/export', { headers: { Authorization: `Bearer ${token}` } });
  assert(dataExport.ok && dataExport.data.exportVersion === '1.0' && dataExport.data.learningHistory, 'GET /me/export (Data Portability)');

  // Notification Preferences
  const getNotifPrefs = await request(`/api/notifications/preferences/${testUserId}`);
  assert(getNotifPrefs.ok && getNotifPrefs.data.preferences, 'GET /api/notifications/preferences/:userId');

  const updateNotifPrefs = await request('/api/notifications/preferences', {
    method: 'PATCH',
    headers: { Authorization: `Bearer ${token}` },
    body: JSON.stringify({ dailyReminders: false, quietHoursEnabled: true })
  });
  assert(updateNotifPrefs.ok && updateNotifPrefs.data.preferences.dailyReminders === false, 'PATCH /api/notifications/preferences');

  // Notifications Management
  const getNotifs = await request(`/api/notifications/${testUserId}`);
  assert(getNotifs.ok && Array.isArray(getNotifs.data.notifications), 'GET /api/notifications/:userId');

  const createNotif = await request('/api/notifications', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: JSON.stringify({
      userId: testUserId,
      type: 'streak',
      title: 'Goal Achieved!',
      message: 'You completed your 15-minute speaking goal today.'
    })
  });
  assert(createNotif.status === 201 && createNotif.data.notification?.id, 'POST /api/notifications');
  const notifId = createNotif.data.notification?.id;

  const markRead = await request(`/api/notifications/${notifId}/read`, {
    method: 'PATCH',
    body: JSON.stringify({ read: true })
  });
  assert(markRead.ok && markRead.data.notification?.read === true, 'PATCH /api/notifications/:id/read');

  const markAllRead = await request('/api/notifications/read-all', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: JSON.stringify({ userId: testUserId })
  });
  assert(markAllRead.ok && markAllRead.data.unreadCount === 0, 'POST /api/notifications/read-all');

  const deleteNotif = await request(`/api/notifications/${notifId}`, { method: 'DELETE' });
  assert(deleteNotif.ok, 'DELETE /api/notifications/:id');

  // Password Reset Flow
  const forgotPw = await request('/auth/forgot-password', {
    method: 'POST',
    body: JSON.stringify({ email: testEmail })
  });
  assert(forgotPw.ok && forgotPw.data.resetToken, 'POST /auth/forgot-password');

  const resetPw = await request('/auth/reset-password', {
    method: 'POST',
    body: JSON.stringify({ resetToken: forgotPw.data.resetToken, newPassword: 'newPassword456' })
  });
  assert(resetPw.ok, 'POST /auth/reset-password');

  // Question CMS
  const addQuestionCMS = await request('/admin/questions', {
    method: 'POST',
    body: JSON.stringify({
      type: 'Word Meaning',
      prompt: 'What does "Tenacious" mean?',
      options: ['Tending to keep a firm hold', 'Easily discouraged', 'Careless', 'Passive'],
      answer: 0,
      difficulty: 'Advanced'
    })
  });
  assert(addQuestionCMS.status === 201 && addQuestionCMS.data.question.id, 'POST /admin/questions');
  const customQuestionId = addQuestionCMS.data.question.id;

  const deleteQuestionCMS = await request(`/admin/questions/${customQuestionId}`, { method: 'DELETE' });
  assert(deleteQuestionCMS.ok, 'DELETE /admin/questions/:id');

  // 13. Subscription System (BYTALK Pro)
  const plans = await request('/api/subscription/plans');
  assert(plans.ok && Array.isArray(plans.data.plans) && plans.data.plans.length >= 2, 'GET /api/subscription/plans');

  const userSub = await request(`/api/subscription/${testUserId}`);
  assert(userSub.ok && userSub.data.subscription?.plan === 'free', 'GET /api/subscription/:userId (Initial Free Plan)');

  const upgradeSub = await request('/api/subscription/upgrade', {
    method: 'POST',
    body: JSON.stringify({ userId: testUserId, plan: 'pro', billingCycle: 'yearly' })
  });
  assert(upgradeSub.ok && upgradeSub.data.subscription?.plan === 'pro', 'POST /api/subscription/upgrade (Upgrade to Pro)');

  const cancelSub = await request('/api/subscription/cancel', {
    method: 'POST',
    body: JSON.stringify({ userId: testUserId })
  });
  assert(cancelSub.ok && cancelSub.data.subscription?.plan === 'free', 'POST /api/subscription/cancel');

  // 14. Real-Time Socket.IO: 2 Active Users Audio Calling (Ringing -> Accept -> Connected)
  await new Promise((resolve) => {
    const callerId = `caller_${Date.now()}`;
    const calleeId = `callee_${Date.now()}`;

    const callerSocket = ClientIO(BASE_URL, { transports: ['websocket', 'polling'] });
    const calleeSocket = ClientIO(BASE_URL, { transports: ['websocket', 'polling'] });

    let callerConnected = false;
    let calleeConnected = false;
    let gotRinging = false;
    let gotIncoming = false;
    let bothConnected = false;

    function cleanup() {
      callerSocket.disconnect();
      calleeSocket.disconnect();
      resolve();
    }

    callerSocket.on('connect', () => {
      callerConnected = true;
      callerSocket.emit('user:online', { userId: callerId });
      checkBothOnline();
    });

    calleeSocket.on('connect', () => {
      calleeConnected = true;
      calleeSocket.emit('user:online', { userId: calleeId });
      checkBothOnline();
    });

    function checkBothOnline() {
      if (callerConnected && calleeConnected) {
        setTimeout(() => {
          // Step 1: Caller initiates audio call to callee
          callerSocket.emit('call:initiate', {
            callerId,
            callerName: 'Alice Caller',
            calleeId,
            calleeName: 'Bob Callee',
            callerCountry: 'UK'
          });
        }, 250);
      }
    }

    // Step 2: Caller receives ringing signal
    callerSocket.on('call:ringing', (data) => {
      gotRinging = true;
      assert(data.calleeId === calleeId, 'Socket.IO Caller receives call:ringing');
    });

    // Step 3: Callee receives incoming call modal event with caller details
    calleeSocket.on('call:incoming', (data) => {
      gotIncoming = true;
      assert(data.callerId === callerId && data.callerName === 'Alice Caller', 'Socket.IO Callee receives call:incoming');

      // Step 4: Callee accepts audio call
      calleeSocket.emit('call:accept', {
        sessionId: data.sessionId,
        callerId: data.callerId,
        calleeId: data.calleeId,
        callerName: data.callerName,
        calleeName: 'Bob Callee'
      });
    });

    // Step 5: Both users receive call:connected and negotiate WebRTC audio stream
    let connectedCount = 0;
    let gotOffer = false;
    let gotAnswer = false;
    let gotCandidate = false;

    calleeSocket.on('call:offer', (data) => {
      gotOffer = true;
      assert(data.offer && data.offer.sdp, 'Socket.IO WebRTC call:offer relayed to Callee');
      // Callee replies with answer
      calleeSocket.emit('call:answer', {
        toUserId: callerId,
        sessionId: data.sessionId,
        answer: { type: 'answer', sdp: 'v=0 audio-answer-test' }
      });
    });

    callerSocket.on('call:answer', (data) => {
      gotAnswer = true;
      assert(data.answer && data.answer.sdp, 'Socket.IO WebRTC call:answer relayed to Caller');
      // Caller sends ICE candidate
      callerSocket.emit('call:ice-candidate', {
        toUserId: calleeId,
        sessionId: data.sessionId,
        candidate: { candidate: 'candidate:1 1 UDP 2122260223 192.168.1.100 50000 typ host', sdpMid: '0', sdpMLineIndex: 0 }
      });
    });

    calleeSocket.on('call:ice-candidate', (data) => {
      gotCandidate = true;
      assert(data.candidate && data.candidate.candidate, 'Socket.IO WebRTC call:ice-candidate relayed to Callee');

      // Send raw PCM audio frame to verify voice relay
      callerSocket.emit('audio:pcm', {
        toUserId: calleeId,
        sessionId: data.sessionId,
        buffer: Buffer.from([1, 2, 3, 4]),
        sampleRate: 44100
      });
    });

    calleeSocket.on('audio:pcm', (data) => {
      assert(data && data.buffer, 'Socket.IO Real-time PCM audio stream relayed to peer');
      // Step 6: End call cleanly once audio channel handshake is confirmed
      setTimeout(() => {
        callerSocket.emit('call:end', { sessionId: data.sessionId, peerUserId: calleeId });
      }, 100);
    });

    const handleConnected = (role, data) => {
      connectedCount++;
      if (connectedCount === 2) {
        bothConnected = true;
        assert(true, 'Socket.IO 2 Active Users Connected in Live Audio Call');
        // Initiate WebRTC audio offer
        callerSocket.emit('call:offer', {
          toUserId: calleeId,
          sessionId: data.sessionId,
          offer: { type: 'offer', sdp: 'v=0 audio-offer-test' }
        });
      }
    };

    callerSocket.on('call:connected', (data) => handleConnected('caller', data));
    calleeSocket.on('call:connected', (data) => handleConnected('callee', data));

    // Step 7: Callee receives call:ended event when caller disconnects
    calleeSocket.on('call:ended', (endData) => {
      assert(gotOffer, 'Socket.IO WebRTC audio offer negotiated');
      assert(gotAnswer, 'Socket.IO WebRTC audio answer negotiated');
      assert(gotCandidate, 'Socket.IO WebRTC audio ICE candidate relayed');
      assert(true, 'Socket.IO Both Members Disconnected Synchronously when one member hangs up');
      setTimeout(cleanup, 200);
    });

    setTimeout(() => {
      if (!bothConnected) {
        assert(gotRinging, 'Socket.IO call:ringing verification');
        assert(gotIncoming, 'Socket.IO call:incoming verification');
        assert(false, 'Socket.IO direct call connection timeout');
      }
      cleanup();
    }, 6000);
  });

  // 15. Real-Time Socket.IO: 2 Active Searching Users Matchmaking -> Both Connect -> One Hangs Up -> Other Disconnects Synchronously
  await new Promise((resolve) => {
    const user1Id = `searcher1_${Date.now()}`;
    const user2Id = `searcher2_${Date.now()}`;

    const socket1 = ClientIO(BASE_URL, { transports: ['websocket', 'polling'] });
    const socket2 = ClientIO(BASE_URL, { transports: ['websocket', 'polling'] });

    let socket1Matched = false;
    let socket2Matched = false;
    let bothMatched = false;

    function cleanup() {
      socket1.disconnect();
      socket2.disconnect();
      resolve();
    }

    socket1.on('connect', () => {
      socket1.emit('user:online', { userId: user1Id });
      // User 1 starts searching for conversation partner
      socket1.emit('partner:find', { userId: user1Id, name: 'Searcher One', level: 'Intermediate' });
    });

    socket1.on('partner:waiting', () => {
      // User 2 starts searching once User 1 is in waiting queue
      socket2.emit('user:online', { userId: user2Id });
      socket2.emit('partner:find', { userId: user2Id, name: 'Searcher Two', level: 'Intermediate' });
    });

    let matchSessionId = null;

    socket1.on('partner:matched', (data) => {
      socket1Matched = true;
      matchSessionId = data.sessionId;
      assert(data.partner && data.partner.name, 'Socket.IO User 1 matched with partner');
      checkMatchComplete();
    });

    socket2.on('partner:matched', (data) => {
      socket2Matched = true;
      matchSessionId = data.sessionId;
      assert(data.partner && data.partner.name, 'Socket.IO User 2 matched with partner');
      checkMatchComplete();
    });

    function checkMatchComplete() {
      if (socket1Matched && socket2Matched && !bothMatched) {
        bothMatched = true;
        assert(true, 'Socket.IO 2 Active Searching Members Connected Simultaneously');

        // One member disconnects call
        setTimeout(() => {
          socket1.emit('call:end', { sessionId: matchSessionId, peerUserId: user2Id });
        }, 150);
      }
    }

    // Remote member receives call:ended event immediately
    socket2.on('call:ended', (data) => {
      assert(true, 'Socket.IO When one matched member disconnects call, the other member also disconnects');
      setTimeout(cleanup, 200);
    });

    setTimeout(() => {
      if (!bothMatched) {
        assert(false, 'Socket.IO Matchmaking 2 active searching users timeout');
      }
      cleanup();
    }, 6000);
  });

  console.log(`\n========================================`);
  console.log(`TEST SUMMARY: ${passed} PASSED, ${failed} FAILED`);
  console.log(`========================================\n`);

  process.exit(failed > 0 ? 1 : 0);
}

runTests().catch((err) => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
