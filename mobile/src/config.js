import { Platform } from 'react-native';
import Constants from 'expo-constants';

/**
 * Dynamically resolves the backend base URL:
 * - If EXPO_PUBLIC_API_URL is set, uses that.
 * - On Web: uses the browser's current host (e.g., http://localhost:4000 or http://192.168.0.109:4000).
 * - On Native Expo Go: extracts the LAN host IP from Metro packager host.
 * - Fallback: Android emulator loopback (10.0.2.2) or localhost.
 */
export function getApiBaseUrl() {
  if (process.env.EXPO_PUBLIC_API_URL) {
    return process.env.EXPO_PUBLIC_API_URL;
  }

  // 1. Browser (Desktop or Mobile Phone Browser)
  if (typeof window !== 'undefined' && window.location?.hostname) {
    const host = window.location.hostname;
    const protocol = window.location.protocol || 'http:';
    if (host && host !== '') {
      return `${protocol}//${host}:4000`;
    }
  }

  // 2. Physical Phone via Expo Go
  try {
    const hostUri =
      Constants.expoConfig?.hostUri ||
      Constants.manifest2?.extra?.expoGo?.debuggerHost ||
      Constants.manifest?.debuggerHost;

    if (hostUri) {
      const ip = hostUri.split(':')[0];
      if (ip && ip !== 'localhost' && ip !== '127.0.0.1') {
        return `http://${ip}:4000`;
      }
    }
  } catch {}

  // 3. Fallback for Emulators
  if (Platform.OS === 'android') {
    return 'http://10.0.2.2:4000';
  }

  return 'http://localhost:4000';
}

export const API_BASE_URL = getApiBaseUrl();
export default API_BASE_URL;
