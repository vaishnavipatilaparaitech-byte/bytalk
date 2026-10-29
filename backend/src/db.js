import 'dotenv/config';
import mongoose from 'mongoose';

let isConnected = false;

export async function connectDB() {
  const uri = process.env.MONGO_URI;

  if (!uri) {
    console.warn('[MongoDB] No MONGO_URI provided in environment variables. Falling back to local file storage only.');
    return false;
  }

  try {
    mongoose.connection.on('connected', () => {
      isConnected = true;
      console.log(`✅ [MongoDB Atlas] Connected successfully to host: ${mongoose.connection.host}, database: ${mongoose.connection.name}`);
    });

    mongoose.connection.on('error', (err) => {
      console.error('[MongoDB] Connection error:', err.message);
    });

    mongoose.connection.on('disconnected', () => {
      isConnected = false;
      console.warn('[MongoDB] Connection lost / disconnected.');
    });

    await mongoose.connect(uri, {
      serverSelectionTimeoutMS: 10000,
    });

    isConnected = true;
    return true;
  } catch (error) {
    console.error('[MongoDB] Initial connection failed:', error.message);
    return false;
  }
}

export function getDbStatus() {
  const stateNames = {
    0: 'disconnected',
    1: 'connected',
    2: 'connecting',
    3: 'disconnecting',
  };

  const state = mongoose.connection.readyState;
  return {
    state: stateNames[state] || 'unknown',
    isConnected: state === 1,
    host: mongoose.connection.host || null,
    dbName: mongoose.connection.name || null,
  };
}

export async function disconnectDB() {
  if (mongoose.connection.readyState !== 0) {
    await mongoose.disconnect();
    isConnected = false;
    console.log('[MongoDB] Disconnected cleanly.');
  }
}
