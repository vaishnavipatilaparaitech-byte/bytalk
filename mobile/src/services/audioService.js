// Universal Audio Service Router for BYTALK
// Seamlessly delegates to audioService.web or audioService.native based on platform

import { Platform } from 'react-native';

let service;
if (Platform.OS === 'web') {
  service = require('./audioService.web').default;
} else {
  service = require('./audioService.native').default;
}

export default service;
