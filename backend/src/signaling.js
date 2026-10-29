// WebRTC Audio Signaling & Matchmaking Module for BYTALK
// Conforming to Aparaitech Software BYTALK Specification (Sections 7, 8, 9, 12, 18, 20)

export function setupSignaling(io, store, save) {
  // In-memory queue for random conversation matchmaking
  // Elements: { socketId, userId, name, level, requestedAt, blockedUsers }
  const matchmakingQueue = [];

  // Active audio sessions: sessionId -> { callerId, calleeId, startedAt }
  const activeSessions = new Map();

  // Socket mappings: socketId <-> userId
  const socketToUser = new Map();
  const userToSocket = new Map();

  io.on('connection', (socket) => {
    // Register user presence
    socket.on('user:online', ({ userId }) => {
      if (!userId) return;
      socketToUser.set(socket.id, userId);
      userToSocket.set(userId, socket.id);

      const user = store.users.find((u) => u.id === userId);
      if (user) {
        user.online = true;
        save();
        io.emit('users:presence', { userId, online: true });
      }
    });

    // 1. RANDOM PARTNER MATCHMAKING (Section 7 & Section 12)
    socket.on('partner:find', (userData) => {
      const userId = userData?.userId || socketToUser.get(socket.id) || socket.id;
      const userLevel = userData?.level || 'Intermediate';

      const currentUser = store.users.find((u) => u.id === userId) || {};
      const userBlockedList = currentUser.blockedUsers || [];

      // Remove any existing entry for this socket or user
      const existingIdx = matchmakingQueue.findIndex(
        (entry) => entry.socketId === socket.id || entry.userId === userId
      );
      if (existingIdx !== -1) {
        matchmakingQueue.splice(existingIdx, 1);
      }

      // Check if user is currently in an active session
      const isAlreadyInSession = Array.from(activeSessions.values()).some(
        (s) => s.callerId === userId || s.calleeId === userId
      );
      if (isAlreadyInSession) {
        socket.emit('match:error', { error: 'You are already in an active audio session.' });
        return;
      }

      // Find partner satisfying block exclusions (Section 12: "blocked accounts must not be rematched")
      const partnerIdx = matchmakingQueue.findIndex((entry) => {
        if (entry.userId === userId) return false;

        // Check if currentUser blocked this candidate
        if (userBlockedList.includes(entry.userId)) return false;

        // Check if candidate blocked currentUser
        const partnerRecord = store.users.find((u) => u.id === entry.userId);
        if (partnerRecord && (partnerRecord.blockedUsers || []).includes(userId)) return false;

        return true;
      });

      if (partnerIdx !== -1) {
        // Suitable unblocked partner found!
        const partner = matchmakingQueue.splice(partnerIdx, 1)[0];
        const sessionId = `call_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;

        const partnerUser = store.users.find((u) => u.id === partner.userId) || {
          id: partner.userId,
          name: partner.name
        };

        // Record active session
        activeSessions.set(sessionId, {
          callerId: userId,
          calleeId: partner.userId,
          callerSocketId: socket.id,
          calleeSocketId: partner.socketId,
          startedAt: Date.now()
        });

        // Notify both peers (Contract: match:found / partner:matched)
        socket.emit('partner:matched', {
          sessionId,
          role: 'caller', // initiator of WebRTC offer
          partner: {
            id: partnerUser.id,
            name: partnerUser.name || 'Anonymous Learner',
            country: partnerUser.country || 'Global',
            level: partnerUser.level || 'Intermediate'
          }
        });
        socket.emit('match:found', { sessionId, partnerId: partnerUser.id });

        io.to(partner.socketId).emit('partner:matched', {
          sessionId,
          role: 'receiver', // responds with WebRTC answer
          partner: {
            id: currentUser.id || userId,
            name: currentUser.name || 'Anonymous Learner',
            country: currentUser.country || 'Global',
            level: currentUser.level || 'Intermediate'
          }
        });
        io.to(partner.socketId).emit('match:found', { sessionId, partnerId: currentUser.id || userId });
      } else {
        // Enqueue user
        matchmakingQueue.push({
          socketId: socket.id,
          userId,
          name: userData?.name || currentUser.name || 'Learner',
          level: userLevel,
          requestedAt: Date.now()
        });

        socket.emit('partner:waiting', { message: 'Searching for an available English conversation partner...' });
      }
    });

    socket.on('partner:cancel', () => {
      const idx = matchmakingQueue.findIndex((entry) => entry.socketId === socket.id);
      if (idx !== -1) {
        matchmakingQueue.splice(idx, 1);
        socket.emit('partner:cancelled');
      }
    });

    // 2. DIRECT 1-TO-1 AUDIO CALL RINGING & CONNECT FLOW
    socket.on('call:initiate', (payload = {}) => {
      const targetUserId = payload.toUserId || payload.calleeId;
      const callerUserId = payload.callerId || socketToUser.get(socket.id);
      const recipientSocketId = userToSocket.get(targetUserId);

      if (!recipientSocketId) {
        socket.emit('call:unavailable', {
          error: 'User is currently offline or unavailable for audio call.',
          toUserId: targetUserId
        });
        return;
      }

      const callerUser = store.users.find((u) => u.id === callerUserId) || {
        id: callerUserId,
        name: payload.callerName || payload.callerInfo?.name || 'Speaking Partner',
        country: payload.callerCountry || 'Global',
        level: 'Intermediate'
      };
      const targetUser = store.users.find((u) => u.id === targetUserId) || {
        id: targetUserId,
        name: payload.calleeName || 'Speaking Partner',
        country: 'Global',
        level: 'Intermediate'
      };

      if ((targetUser.blockedUsers || []).includes(callerUserId) || (callerUser.blockedUsers || []).includes(targetUserId)) {
        socket.emit('call:unavailable', {
          error: 'Unable to connect call with this user.',
          toUserId: targetUserId
        });
        return;
      }

      const sessionId = payload.sessionId || `call_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;

      // Send ringing event to caller
      socket.emit('call:ringing', {
        sessionId,
        calleeId: targetUserId,
        partner: {
          id: targetUser.id || targetUserId,
          name: targetUser.alias || targetUser.name || payload.calleeName || 'Speaking Partner',
          country: targetUser.country || 'Global',
          level: targetUser.level || 'Intermediate'
        }
      });

      // Send incoming call alert to recipient
      io.to(recipientSocketId).emit('call:incoming', {
        sessionId,
        callerId: callerUser.id || callerUserId,
        callerName: callerUser.alias || callerUser.name || payload.callerName || payload.callerInfo?.name || 'Speaking Partner',
        callerCountry: callerUser.country || payload.callerCountry || 'Global',
        caller: {
          id: callerUser.id || callerUserId,
          name: callerUser.alias || callerUser.name || payload.callerName || payload.callerInfo?.name || 'Speaking Partner',
          country: callerUser.country || payload.callerCountry || 'Global',
          level: callerUser.level || 'Intermediate'
        }
      });
    });

    socket.on('call:accept', (payload = {}) => {
      const sessionId = payload.sessionId;
      const callerId = payload.callerId;
      const calleeId = payload.calleeId || socketToUser.get(socket.id);
      const callerSocketId = userToSocket.get(callerId);

      const callerUser = store.users.find((u) => u.id === callerId) || { id: callerId, name: payload.callerName || 'Caller' };
      const calleeUser = store.users.find((u) => u.id === calleeId) || { id: calleeId, name: payload.calleeName || 'Receiver' };

      activeSessions.set(sessionId, {
        callerId,
        calleeId,
        callerSocketId,
        calleeSocketId: socket.id,
        startedAt: Date.now()
      });

      // Notify caller that call is connected
      if (callerSocketId) {
        io.to(callerSocketId).emit('call:connected', {
          sessionId,
          role: 'caller',
          callerId,
          calleeId,
          partner: {
            id: calleeUser.id,
            name: calleeUser.alias || calleeUser.name,
            country: calleeUser.country || 'Global',
            level: calleeUser.level || 'Intermediate'
          }
        });
      }

      // Notify callee that call is connected
      socket.emit('call:connected', {
        sessionId,
        role: 'receiver',
        callerId,
        calleeId,
        partner: {
          id: callerUser.id,
          name: callerUser.alias || callerUser.name,
          country: callerUser.country || 'Global',
          level: callerUser.level || 'Intermediate'
        }
      });
    });

    socket.on('call:decline', ({ sessionId, callerId, reason }) => {
      const callerSocketId = userToSocket.get(callerId);
      if (callerSocketId) {
        io.to(callerSocketId).emit('call:declined', {
          sessionId,
          reason: reason || 'Call was declined by partner.'
        });
      }
    });

    socket.on('call:cancel', ({ sessionId, toUserId }) => {
      const recipientSocketId = userToSocket.get(toUserId);
      if (recipientSocketId) {
        io.to(recipientSocketId).emit('call:cancelled', { sessionId });
      }
    });

    // 3. WEBRTC P2P AUDIO SIGNALING RELAY (Section 18 & 20)
    socket.on('call:offer', ({ toUserId, sessionId, offer }) => {
      let recipientSocketId = toUserId ? userToSocket.get(toUserId) : null;
      let session = sessionId ? activeSessions.get(sessionId) : null;
      if (!session) {
        for (const s of activeSessions.values()) {
          if (s.callerSocketId === socket.id || s.calleeSocketId === socket.id) {
            session = s;
            break;
          }
        }
      }
      if (!recipientSocketId && session) {
        recipientSocketId = (session.callerSocketId === socket.id)
          ? session.calleeSocketId
          : session.callerSocketId;
      }
      const fromUserId = socketToUser.get(socket.id) || (session ? session.callerId : null);

      if (recipientSocketId) {
        io.to(recipientSocketId).emit('call:offer', {
          fromUserId,
          sessionId,
          offer
        });
      }
    });

    socket.on('call:answer', ({ toUserId, sessionId, answer }) => {
      let recipientSocketId = toUserId ? userToSocket.get(toUserId) : null;
      let session = sessionId ? activeSessions.get(sessionId) : null;
      if (!session) {
        for (const s of activeSessions.values()) {
          if (s.callerSocketId === socket.id || s.calleeSocketId === socket.id) {
            session = s;
            break;
          }
        }
      }
      if (!recipientSocketId && session) {
        recipientSocketId = (session.calleeSocketId === socket.id)
          ? session.callerSocketId
          : session.calleeSocketId;
      }
      const fromUserId = socketToUser.get(socket.id) || (session ? session.calleeId : null);

      if (recipientSocketId) {
        io.to(recipientSocketId).emit('call:answer', {
          fromUserId,
          sessionId,
          answer
        });
      }
    });

    socket.on('call:ice-candidate', ({ toUserId, sessionId, candidate }) => {
      let recipientSocketId = toUserId ? userToSocket.get(toUserId) : null;
      let session = sessionId ? activeSessions.get(sessionId) : null;
      if (!session) {
        for (const s of activeSessions.values()) {
          if (s.callerSocketId === socket.id || s.calleeSocketId === socket.id) {
            session = s;
            break;
          }
        }
      }
      if (!recipientSocketId && session) {
        recipientSocketId = (session.callerSocketId === socket.id)
          ? session.calleeSocketId
          : session.callerSocketId;
      }
      const fromUserId = socketToUser.get(socket.id);

      if (recipientSocketId) {
        io.to(recipientSocketId).emit('call:ice-candidate', {
          fromUserId,
          sessionId,
          candidate
        });
      }
    });

    // 3.1 HYBRID AUDIO CHUNK STREAM RELAY (Guarantees two-way audio in all NATs)
    socket.on('audio:chunk', ({ toUserId, sessionId, chunk }) => {
      let recipientSocketId = toUserId ? userToSocket.get(toUserId) : null;
      let session = sessionId ? activeSessions.get(sessionId) : null;
      if (!session) {
        for (const s of activeSessions.values()) {
          if (s.callerSocketId === socket.id || s.calleeSocketId === socket.id) {
            session = s;
            break;
          }
        }
      }
      if (!recipientSocketId && session) {
        recipientSocketId = (session.callerSocketId === socket.id)
          ? session.calleeSocketId
          : session.callerSocketId;
      }
      if (recipientSocketId) {
        io.to(recipientSocketId).emit('audio:chunk', { sessionId, chunk });
      }
    });

    socket.on('audio:pcm', ({ toUserId, sessionId, buffer, sampleRate }) => {
      let recipientSocketId = toUserId ? userToSocket.get(toUserId) : null;
      let session = sessionId ? activeSessions.get(sessionId) : null;
      if (!session) {
        for (const s of activeSessions.values()) {
          if (s.callerSocketId === socket.id || s.calleeSocketId === socket.id) {
            session = s;
            break;
          }
        }
      }
      if (!recipientSocketId && session) {
        recipientSocketId = (session.callerSocketId === socket.id)
          ? session.calleeSocketId
          : session.callerSocketId;
      }
      if (!recipientSocketId) {
        const myUserId = socketToUser.get(socket.id);
        for (const s of activeSessions.values()) {
          if (s.callerId === myUserId || s.callerSocketId === socket.id) {
            recipientSocketId = s.calleeSocketId;
            break;
          } else if (s.calleeId === myUserId || s.calleeSocketId === socket.id) {
            recipientSocketId = s.callerSocketId;
            break;
          }
        }
      }
      if (recipientSocketId && recipientSocketId !== socket.id) {
        io.to(recipientSocketId).emit('audio:pcm', { sessionId, buffer, sampleRate });
      }
    });

    // Call End and practice duration recording (Section 14 & 20)
    socket.on('call:end', (payload = {}) => {
      const { peerUserId, targetUserId, partnerId, sessionId, durationSeconds } = payload;
      const myUserId = socketToUser.get(socket.id);

      let targetSession = sessionId ? activeSessions.get(sessionId) : null;
      let targetPeerId = peerUserId || targetUserId || partnerId;

      if (!targetSession) {
        for (const [sId, sess] of activeSessions.entries()) {
          if (sess.callerId === myUserId || sess.calleeId === myUserId || sess.callerSocketId === socket.id || sess.calleeSocketId === socket.id) {
            targetSession = sess;
            activeSessions.delete(sId);
            break;
          }
        }
      } else if (sessionId) {
        activeSessions.delete(sessionId);
      }

      if (!targetPeerId && targetSession) {
        targetPeerId = (targetSession.callerId === myUserId || targetSession.callerSocketId === socket.id)
          ? targetSession.calleeId
          : targetSession.callerId;
      }

      let recipientSocketId = targetPeerId ? userToSocket.get(targetPeerId) : null;
      if (!recipientSocketId && targetSession) {
        recipientSocketId = (targetSession.callerSocketId === socket.id)
          ? targetSession.calleeSocketId
          : targetSession.callerSocketId;
      }

      if (recipientSocketId) {
        io.to(recipientSocketId).emit('call:ended', { sessionId, peerUserId: myUserId, reason: 'Partner ended the call.' });
      }

      // Record practice minutes if call lasted >= 15 seconds
      if (durationSeconds && durationSeconds >= 15) {
        const minutesToAdd = Math.ceil(durationSeconds / 60);

        [myUserId, targetPeerId].forEach((uid) => {
          if (!uid) return;
          const u = store.users.find((x) => x.id === uid);
          if (u) {
            u.minutes = (u.minutes || 0) + minutesToAdd;
          }
        });
        save();
      }
    });

    // 3. LIVE AUDIO ROOMS (Section 8 & 9)
    socket.on('room:join-live', ({ roomId, userId }) => {
      socket.join(`room_${roomId}`);
      // By default, members join as listeners with microphone muted (Section 9)
      io.to(`room_${roomId}`).emit('room:user-joined', {
        roomId,
        userId,
        socketId: socket.id,
        role: 'listener',
        micMuted: true
      });
    });

    socket.on('room:leave-live', ({ roomId, userId }) => {
      socket.leave(`room_${roomId}`);
      io.to(`room_${roomId}`).emit('room:user-left', { roomId, userId });
    });

    socket.on('room:speaker-request', ({ roomId, userId, userName }) => {
      io.to(`room_${roomId}`).emit('room:speaker-request', { roomId, userId, userName });
    });

    socket.on('room:speaker-grant', ({ roomId, targetUserId }) => {
      io.to(`room_${roomId}`).emit('room:speaker-granted', { roomId, targetUserId });
    });

    socket.on('room:mic-toggle', ({ roomId, userId, isMuted }) => {
      io.to(`room_${roomId}`).emit('room:mic-changed', { roomId, userId, isMuted });
    });

    // Cleanup on socket disconnect
    socket.on('disconnect', () => {
      const queueIdx = matchmakingQueue.findIndex((entry) => entry.socketId === socket.id);
      if (queueIdx !== -1) matchmakingQueue.splice(queueIdx, 1);

      const userId = socketToUser.get(socket.id);
      // Automatically disconnect any active audio sessions involving this user or socket
      for (const [sessionId, session] of activeSessions.entries()) {
        if (session.callerId === userId || session.calleeId === userId || session.callerSocketId === socket.id || session.calleeSocketId === socket.id) {
          const peerId = (session.callerId === userId || session.callerSocketId === socket.id)
            ? session.calleeId
            : session.callerId;
          const peerSocketId = (session.callerSocketId === socket.id ? session.calleeSocketId : session.callerSocketId) || (peerId ? userToSocket.get(peerId) : null);
          if (peerSocketId) {
            io.to(peerSocketId).emit('call:ended', { sessionId, peerUserId: userId, reason: 'Partner disconnected.' });
          }
          activeSessions.delete(sessionId);
        }
      }

      if (userId) {

        userToSocket.delete(userId);
        socketToUser.delete(socket.id);

        const user = store.users.find((u) => u.id === userId);
        if (user) {
          user.online = false;
          save();
          io.emit('users:presence', { userId, online: false });
        }
      }
    });
  });

  return {
    matchmakingQueue,
    activeSessions
  };
}
