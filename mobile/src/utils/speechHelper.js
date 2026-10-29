// High-quality Audio & Speech Synthesis Helper for BYTALK
// Supports Web Speech API (Chrome, Safari, Edge, Android WebView, iOS WKWebView)
// with graceful fallback for all environments.

export const speakEnglish = (text, onStart, onEnd) => {
  if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
    try {
      window.speechSynthesis.cancel();
      const cleanText = text.replace(/\[.*?\]/g, '').trim(); // Remove bracket tags
      const utterance = new SpeechSynthesisUtterance(cleanText);
      utterance.lang = 'en-US';
      utterance.rate = 0.88; // Slightly slower, articulate pace for language learners
      utterance.pitch = 1.0;

      if (onStart) utterance.onstart = onStart;
      if (onEnd) utterance.onend = onEnd;

      window.speechSynthesis.speak(utterance);
      return true;
    } catch {
      return false;
    }
  }
  return false;
};

export const stopSpeech = () => {
  if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
    try {
      window.speechSynthesis.cancel();
    } catch {
      // ignore
    }
  }
};

