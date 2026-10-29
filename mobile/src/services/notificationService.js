// Universal Notification Service Router for BYTALK
// Seamlessly delegates to notificationService.web or notificationService.native based on platform

import { Platform } from 'react-native';

let service;
if (Platform.OS === 'web') {
  service = require('./notificationService.web').default;
} else {
  service = require('./notificationService.native').default;
}

export default service;
