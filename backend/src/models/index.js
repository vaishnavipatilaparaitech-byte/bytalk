import mongoose from 'mongoose';

const baseSchemaOptions = {
  timestamps: true,
  strict: false,
  suppressReservedKeysWarning: true,
};

// 1. User Schema
const userSchema = new mongoose.Schema(
  {
    id: { type: String, required: true, unique: true, index: true },
    name: { type: String, required: true },
    alias: String,
    email: { type: String, lowercase: true, trim: true },
    passwordHash: String,
    country: String,
    nativeLanguage: String,
    learningLanguage: String,
    level: String,
    online: { type: Boolean, default: false },
    streak: { type: Number, default: 0 },
    minutes: { type: Number, default: 0 },
    words: { type: Number, default: 0 },
    quizzesCompleted: { type: Number, default: 0 },
    savedPhrases: [String],
    blockedUsers: [String],
    referralCode: String,
    referredCount: { type: Number, default: 0 },
    status: { type: String, default: 'active' },
    falseReportCount: { type: Number, default: 0 },
    goals: String,
    interests: String,
    avatar: String,
    subscription: {
      plan: { type: String, default: 'free' },
      status: { type: String, default: 'active' },
      expiresAt: String,
      startedAt: String,
    },
  },
  baseSchemaOptions
);

// 2. Room Schema
const roomSchema = new mongoose.Schema(
  {
    id: { type: String, required: true, unique: true, index: true },
    name: { type: String, required: true },
    topic: String,
    level: String,
    listeners: { type: Number, default: 0 },
    capacity: { type: Number, default: 50 },
    speakers: [String],
    speakerRequests: [String],
    hostId: String,
    isLive: { type: Boolean, default: true },
    joined: { type: Number, default: 0 },
  },
  baseSchemaOptions
);

// 3. Message Schema
const messageSchema = new mongoose.Schema(
  {
    id: { type: String, required: true, unique: true, index: true },
    from: { type: String, required: true, index: true },
    to: { type: String, required: true, index: true },
    text: { type: String, required: true },
    at: String,
  },
  baseSchemaOptions
);

// 4. Vocabulary Schema
const vocabularySchema = new mongoose.Schema(
  {
    id: { type: String, required: true, unique: true, index: true },
    userId: { type: String, required: true, index: true },
    word: { type: String, required: true },
    category: String,
  },
  baseSchemaOptions
);

// 5. Report Schema (Dedicated collection: bytalk_reports to prevent clash with nexaailab.reports)
const reportSchema = new mongoose.Schema(
  {
    id: { type: String, required: true, unique: true, index: true },
    reporterId: String,
    reportedUserId: String,
    sessionId: String,
    reason: String,
    verificationStatus: String,
    reporterCredibility: String,
    status: { type: String, default: 'open' },
    reviewedAt: String,
    moderatorNotes: String,
    at: String,
  },
  baseSchemaOptions
);

// 6. Audit Log Schema
const auditLogSchema = new mongoose.Schema(
  {
    id: { type: String, required: true, unique: true, index: true },
    actor: String,
    eventType: String,
    target: String,
    timestamp: String,
  },
  baseSchemaOptions
);

// 7. Practice Note Schema
const noteSchema = new mongoose.Schema(
  {
    id: { type: String, required: true, unique: true, index: true },
    userId: { type: String, required: true, index: true },
    title: String,
    content: String,
    partnerAlias: String,
    category: String,
  },
  baseSchemaOptions
);

// 8. Call Feedback Schema
const feedbackSchema = new mongoose.Schema(
  {
    id: { type: String, required: true, unique: true, index: true },
    userId: String,
    sessionId: String,
    partnerId: String,
    rating: Number,
    audioQuality: String,
    tags: [String],
    comment: String,
    submittedAt: String,
  },
  baseSchemaOptions
);

// 9. Meta / Settings Schema (for system state, blocks, notification preferences)
const metaSchema = new mongoose.Schema(
  {
    key: { type: String, required: true, unique: true, index: true },
    data: mongoose.Schema.Types.Mixed,
  },
  baseSchemaOptions
);

// 10. Notification Schema
const notificationSchema = new mongoose.Schema(
  {
    id: { type: String, required: true, unique: true, index: true },
    userId: { type: String, required: true, index: true },
    type: { type: String, default: 'system' }, // streak, message, room, partner, learning, system
    icon: { type: String, default: 'notifications' },
    color: { type: String, default: '#FF6847' },
    bgColor: { type: String, default: '#FFF4EE' },
    title: { type: String, required: true },
    message: { type: String, required: true },
    time: String,
    read: { type: Boolean, default: false },
    data: mongoose.Schema.Types.Mixed,
    createdAt: { type: String, default: () => new Date().toISOString() },
  },
  baseSchemaOptions
);

// Models scoped to BYTALK-prefixed collections
export const BytalkUser = mongoose.models.BytalkUser || mongoose.model('BytalkUser', userSchema, 'bytalk_users');
export const BytalkRoom = mongoose.models.BytalkRoom || mongoose.model('BytalkRoom', roomSchema, 'bytalk_rooms');
export const BytalkMessage = mongoose.models.BytalkMessage || mongoose.model('BytalkMessage', messageSchema, 'bytalk_messages');
export const BytalkVocabulary = mongoose.models.BytalkVocabulary || mongoose.model('BytalkVocabulary', vocabularySchema, 'bytalk_vocabulary');
export const BytalkReport = mongoose.models.BytalkReport || mongoose.model('BytalkReport', reportSchema, 'bytalk_reports');
export const BytalkAuditLog = mongoose.models.BytalkAuditLog || mongoose.model('BytalkAuditLog', auditLogSchema, 'bytalk_audit_logs');
export const BytalkNote = mongoose.models.BytalkNote || mongoose.model('BytalkNote', noteSchema, 'bytalk_notes');
export const BytalkFeedback = mongoose.models.BytalkFeedback || mongoose.model('BytalkFeedback', feedbackSchema, 'bytalk_feedback');
export const BytalkNotification = mongoose.models.BytalkNotification || mongoose.model('BytalkNotification', notificationSchema, 'bytalk_notifications');
export const BytalkMeta = mongoose.models.BytalkMeta || mongoose.model('BytalkMeta', metaSchema, 'bytalk_meta');

/**
 * Synchronize in-memory store with MongoDB Atlas on startup and during mutations
 */
export async function syncStoreWithMongo(store) {
  if (mongoose.connection.readyState !== 1) {
    return;
  }

  try {
    const userCount = await BytalkUser.countDocuments();

    if (userCount === 0 && store.users && store.users.length > 0) {
      console.log('[MongoDB] Seeding initial BYTALK data into MongoDB Atlas...');
      if (store.users?.length) {
        await BytalkUser.bulkWrite(
          store.users.map((u) => ({
            updateOne: { filter: { id: u.id }, update: { $set: u }, upsert: true },
          }))
        );
      }
      if (store.rooms?.length) {
        await BytalkRoom.bulkWrite(
          store.rooms.map((r) => ({
            updateOne: { filter: { id: r.id }, update: { $set: r }, upsert: true },
          }))
        );
      }
      if (store.messages?.length) {
        await BytalkMessage.bulkWrite(
          store.messages.map((m) => ({
            updateOne: { filter: { id: m.id }, update: { $set: m }, upsert: true },
          }))
        );
      }
      if (store.vocabulary?.length) {
        await BytalkVocabulary.bulkWrite(
          store.vocabulary.map((v) => ({
            updateOne: { filter: { id: v.id }, update: { $set: v }, upsert: true },
          }))
        );
      }
      if (store.notifications?.length) {
        await BytalkNotification.bulkWrite(
          store.notifications.map((n) => ({
            updateOne: { filter: { id: n.id }, update: { $set: n }, upsert: true },
          }))
        );
      }
      console.log('[MongoDB] Initial BYTALK dataset successfully seeded into MongoDB Atlas.');
    } else if (userCount > 0) {
      // Load latest persisted state from MongoDB Atlas into store
      console.log('[MongoDB] Loading persisted records from MongoDB Atlas...');
      const [users, rooms, messages, vocab, reports, audit, notes, feedback, notifs, metaBlocks, metaPrefs] = await Promise.all([
        BytalkUser.find().lean(),
        BytalkRoom.find().lean(),
        BytalkMessage.find().lean(),
        BytalkVocabulary.find().lean(),
        BytalkReport.find().lean(),
        BytalkAuditLog.find().lean(),
        BytalkNote.find().lean(),
        BytalkFeedback.find().lean(),
        BytalkNotification.find().lean(),
        BytalkMeta.findOne({ key: 'blocks' }).lean(),
        BytalkMeta.findOne({ key: 'notificationPreferences' }).lean(),
      ]);

      if (users.length) store.users = users.map(({ _id, __v, ...rest }) => rest);
      if (rooms.length) store.rooms = rooms.map(({ _id, __v, ...rest }) => rest);
      if (messages.length) store.messages = messages.map(({ _id, __v, ...rest }) => rest);
      if (vocab.length) store.vocabulary = vocab.map(({ _id, __v, ...rest }) => rest);
      if (reports.length) store.reports = reports.map(({ _id, __v, ...rest }) => rest);
      if (audit.length) store.auditLogs = audit.map(({ _id, __v, ...rest }) => rest);
      if (notes.length) store.notes = notes.map(({ _id, __v, ...rest }) => rest);
      if (feedback.length) store.callFeedback = feedback.map(({ _id, __v, ...rest }) => rest);
      if (notifs.length) {
        store.notifications = notifs.map(({ _id, __v, ...rest }) => rest);
      } else if (store.notifications?.length) {
        // First time adding notifications collection to Atlas
        await BytalkNotification.bulkWrite(
          store.notifications.map((n) => ({
            updateOne: { filter: { id: n.id }, update: { $set: n }, upsert: true },
          }))
        );
      }
      if (metaBlocks?.data) store.blocks = metaBlocks.data;
      if (metaPrefs?.data) store.notificationPreferences = metaPrefs.data;

      console.log(`[MongoDB] Loaded ${users.length} users, ${rooms.length} rooms, ${messages.length} messages, ${(store.notifications || []).length} notifications from Atlas.`);
    }
  } catch (err) {
    console.error('[MongoDB] Initial store synchronization error:', err.message);
  }
}

let syncTimeout = null;
/**
 * Asynchronously persist changes from the in-memory store to MongoDB Atlas
 */
export function queueMongoSync(store) {
  if (mongoose.connection.readyState !== 1) return;

  if (syncTimeout) clearTimeout(syncTimeout);
  syncTimeout = setTimeout(async () => {
    try {
      if (store.users?.length) {
        await BytalkUser.bulkWrite(
          store.users.map((u) => {
            const { _id, __v, ...doc } = u;
            return {
              updateOne: { filter: { id: doc.id }, update: { $set: doc }, upsert: true },
            };
          })
        );
      }

      if (store.rooms?.length) {
        await BytalkRoom.bulkWrite(
          store.rooms.map((r) => {
            const { _id, __v, ...doc } = r;
            return {
              updateOne: { filter: { id: doc.id }, update: { $set: doc }, upsert: true },
            };
          })
        );
      }

      if (store.messages?.length) {
        await BytalkMessage.bulkWrite(
          store.messages.map((m) => {
            const { _id, __v, ...doc } = m;
            return {
              updateOne: { filter: { id: doc.id }, update: { $set: doc }, upsert: true },
            };
          })
        );
      }

      if (store.vocabulary?.length) {
        await BytalkVocabulary.bulkWrite(
          store.vocabulary.map((v) => {
            const { _id, __v, ...doc } = v;
            return {
              updateOne: { filter: { id: doc.id }, update: { $set: doc }, upsert: true },
            };
          })
        );
      }

      if (store.reports?.length) {
        await BytalkReport.bulkWrite(
          store.reports.map((rp) => {
            const { _id, __v, ...doc } = rp;
            return {
              updateOne: { filter: { id: doc.id }, update: { $set: doc }, upsert: true },
            };
          })
        );
      }

      if (store.auditLogs?.length) {
        await BytalkAuditLog.bulkWrite(
          store.auditLogs.map((a) => {
            const { _id, __v, ...doc } = a;
            return {
              updateOne: { filter: { id: doc.id }, update: { $set: doc }, upsert: true },
            };
          })
        );
      }

      if (store.notes?.length) {
        await BytalkNote.bulkWrite(
          store.notes.map((n) => {
            const { _id, __v, ...doc } = n;
            return {
              updateOne: { filter: { id: doc.id }, update: { $set: doc }, upsert: true },
            };
          })
        );
      }

      if (store.callFeedback?.length) {
        await BytalkFeedback.bulkWrite(
          store.callFeedback.map((f) => {
            const { _id, __v, ...doc } = f;
            return {
              updateOne: { filter: { id: doc.id }, update: { $set: doc }, upsert: true },
            };
          })
        );
      }

      if (store.notifications?.length) {
        await BytalkNotification.bulkWrite(
          store.notifications.map((n) => {
            const { _id, __v, ...doc } = n;
            return {
              updateOne: { filter: { id: doc.id }, update: { $set: doc }, upsert: true },
            };
          })
        );
      }

      await BytalkMeta.updateOne(
        { key: 'blocks' },
        { $set: { key: 'blocks', data: store.blocks || [] } },
        { upsert: true }
      );

      await BytalkMeta.updateOne(
        { key: 'notificationPreferences' },
        { $set: { key: 'notificationPreferences', data: store.notificationPreferences || {} } },
        { upsert: true }
      );
    } catch (err) {
      console.error('[MongoDB] Error updating records in Atlas:', err.message);
    }
  }, 100);
}
