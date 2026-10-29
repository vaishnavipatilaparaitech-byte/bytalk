// Learning, Word Games and Vocabulary Module for BYTALK
// Conforming to Aparaitech Software BYTALK Specification (Sections 10, 11, 14, 19, 20)

export const COMMON_PHRASES = [
  // 1. Greetings
  {
    id: 'phr_greet_1',
    category: 'greetings',
    phrase: 'Good morning, how are things going with you today?',
    meaning: 'A warm, polite morning greeting to enquire about someone’s day.',
    usage: 'Casual or workplace greetings.',
    example: 'Good morning, how are things going with you today? I hope you had a good weekend.'
  },
  {
    id: 'phr_greet_2',
    category: 'greetings',
    phrase: 'Pleasure to meet you, looking forward to our chat!',
    meaning: 'Friendly expression when connecting with someone for the first time.',
    usage: 'At the start of a random language exchange call.',
    example: 'Hi there, pleasure to meet you, looking forward to our chat!'
  },

  // 2. Introductions
  {
    id: 'phr_intro_1',
    category: 'introductions',
    phrase: 'Allow me to introduce myself, my name is...',
    meaning: 'A structured, professional way to state your name and background.',
    usage: 'First-time meetups or group rooms.',
    example: 'Allow me to introduce myself, my name is Alex and I am learning English for my career.'
  },
  {
    id: 'phr_intro_2',
    category: 'introductions',
    phrase: 'I am originally from India, currently practicing spoken fluency.',
    meaning: 'Shares your home country and language goals concisely.',
    usage: 'Conversation icebreaker.',
    example: 'I am originally from India, currently practicing spoken fluency with partners worldwide.'
  },

  // 3. Shopping
  {
    id: 'phr_shop_1',
    category: 'shopping',
    phrase: 'Do you happen to have this in a different size or color?',
    meaning: 'Inquiring politely about product variations in store.',
    usage: 'Retail or online customer support.',
    example: 'Excuse me, do you happen to have this sweater in a different size or color?'
  },
  {
    id: 'phr_shop_2',
    category: 'shopping',
    phrase: 'Could I get a receipt for this purchase, please?',
    meaning: 'Requesting proof of transaction.',
    usage: 'Checkouts and billing counters.',
    example: 'Thank you! Could I get a receipt for this purchase, please?'
  },

  // 4. Travel
  {
    id: 'phr_trav_1',
    category: 'travel',
    phrase: 'Could you please point me toward the nearest subway entrance?',
    meaning: 'Asking for directions in an unfamiliar city.',
    usage: 'Public navigation and commuting.',
    example: 'Excuse me, could you please point me toward the nearest subway entrance?'
  },
  {
    id: 'phr_trav_2',
    category: 'travel',
    phrase: 'Is there a direct shuttle to the terminal, or must I transfer?',
    meaning: 'Checking transit connection details.',
    usage: 'Airport or hotel travel desks.',
    example: 'Is there a direct shuttle to the terminal, or must I transfer buses?'
  },

  // 5. Work
  {
    id: 'phr_work_1',
    category: 'work',
    phrase: 'Could you please elaborate on that point during our sync?',
    meaning: 'Asking for more detail or clarity on a proposal.',
    usage: 'Meetings and collaborative projects.',
    example: 'Could you please elaborate on that point during our sync so everyone is aligned?'
  },
  {
    id: 'phr_work_2',
    category: 'work',
    phrase: "Let's touch base next week to review progress.",
    meaning: 'Scheduling a brief future check-in.',
    usage: 'Project status wrap-ups.',
    example: "We have made great headway; let's touch base next week to review progress."
  },

  // 6. Interviews
  {
    id: 'phr_int_1',
    category: 'interviews',
    phrase: 'My key strength lies in analytical thinking and clear communication.',
    meaning: 'Articulating core skills with confidence.',
    usage: 'Answering common interview questions.',
    example: 'Throughout my internships, my key strength lies in analytical thinking and clear communication.'
  },
  {
    id: 'phr_int_2',
    category: 'interviews',
    phrase: 'I look forward to contributing to your team goals and culture.',
    meaning: 'Polite and enthusiastic interview closing statement.',
    usage: 'Concluding a formal job interview.',
    example: 'Thank you for this opportunity; I look forward to contributing to your team goals.'
  },

  // 7. Education
  {
    id: 'phr_edu_1',
    category: 'education',
    phrase: 'Could you please speak a little slower so I can catch the pronunciation?',
    meaning: 'Respectful request to assist language learners with pacing.',
    usage: 'Live voice chats and audio rooms.',
    example: 'Could you please speak a little slower so I can catch the pronunciation of that word?'
  },
  {
    id: 'phr_edu_2',
    category: 'education',
    phrase: 'What is the contextual difference between these two expressions?',
    meaning: 'Asking a teacher or peer for grammatical or idiomatic clarity.',
    usage: 'Language discussions and grammar study.',
    example: 'Could you tell me what the contextual difference is between these two expressions?'
  },

  // 8. Everyday Conversation
  {
    id: 'phr_every_1',
    category: 'everyday conversation',
    phrase: 'How have you been holding up with everything lately?',
    meaning: 'An empathetic, friendly inquiry about life and well-being.',
    usage: 'Catching up with peers or partners.',
    example: 'Hey there! How have you been holding up with everything lately?'
  },
  {
    id: 'phr_every_2',
    category: 'everyday conversation',
    phrase: 'That makes total sense to me.',
    meaning: 'Validating the speaker and confirming complete comprehension.',
    usage: 'Active listening during conversations.',
    example: 'Ah, you prefer learning via voice calls over textbooks? That makes total sense to me.'
  }
];

// Vocabulary Word Game Bank across all 5 specified game types (Section 10)
export const WORD_GAME_BANK = [
  // Type 1: Word Meaning
  {
    id: 'gm_wm_1',
    type: 'Word Meaning',
    prompt: 'What is the definition of the word "Persuasive"?',
    options: [
      'Able to convince others through sound reasoning',
      'Easily distracted by external noises',
      'Speaking in an aggressive or loud tone',
      'Reluctant to share one’s thoughts'
    ],
    answer: 0,
    explanation: '"Persuasive" means having the ability to cause someone to do or believe something through argument or reasoning.',
    difficulty: 'Intermediate'
  },
  {
    id: 'gm_wm_2',
    type: 'Word Meaning',
    prompt: 'What is the meaning of "Articulate"?',
    options: [
      'Running very fast under pressure',
      'Able to express thoughts and ideas clearly and effectively',
      'Confused about grammar rules',
      'Speaking very quietly'
    ],
    answer: 1,
    explanation: '"Articulate" describes someone who speaks clearly, coherently, and persuasively.',
    difficulty: 'Beginner'
  },

  // Type 2: Fill in the Blank
  {
    id: 'gm_fb_1',
    type: 'Fill in the Blank',
    prompt: 'During the meeting, she made a very ______ argument that convinced everyone.',
    options: ['compelling', 'hesitant', 'distracted', 'fragile'],
    answer: 0,
    explanation: '"Compelling" means evoking interest, attention, or admiration in a powerfully irresistible way.',
    difficulty: 'Intermediate'
  },
  {
    id: 'gm_fb_2',
    type: 'Fill in the Blank',
    prompt: 'Practicing English daily will help you overcome your ______ when speaking to foreigners.',
    options: ['fluency', 'hesitation', 'vocabulary', 'confidence'],
    answer: 1,
    explanation: '"Hesitation" is the pause or reluctance before saying or doing something due to uncertainty.',
    difficulty: 'Beginner'
  },

  // Type 3: Synonym / Antonym
  {
    id: 'gm_sa_1',
    type: 'Synonym / Antonym',
    prompt: 'Which word is the closest SYNONYM for "Eloquent"?',
    options: ['Fluent and expressive', 'Awkward and clumsy', 'Silent and shy', 'Harsh and abrasive'],
    answer: 0,
    explanation: '"Eloquent" means fluent or persuasive in speaking or writing.',
    difficulty: 'Intermediate'
  },
  {
    id: 'gm_sa_2',
    type: 'Synonym / Antonym',
    prompt: 'Which word is the ANTONYM (opposite) of "Hesitant"?',
    options: ['Reluctant', 'Confident', 'Timid', 'Doubtful'],
    answer: 1,
    explanation: '"Confident" is the direct opposite of "Hesitant" (uncertain or timid).',
    difficulty: 'Beginner'
  },

  // Type 4: Word Formation
  {
    id: 'gm_wf_1',
    type: 'Word Formation',
    prompt: 'Rearrange these scrambled letters to form an English word meaning "to talk together": N E V O C R A T I S O N',
    options: ['CONVERSATION', 'CONSERVATION', 'CONVENTIONAL', 'CONVERSION'],
    answer: 0,
    explanation: 'The letters scramble to form "CONVERSATION".',
    difficulty: 'Beginner'
  },
  {
    id: 'gm_wf_2',
    type: 'Word Formation',
    prompt: 'Rearrange the letters to form a word meaning "ability to speak easily and smoothly": N E C F Y U L',
    options: ['FLUENCY', 'FLUENZA', 'FACILITY', 'FOCUSED'],
    answer: 0,
    explanation: 'The letters scramble to form "FLUENCY".',
    difficulty: 'Intermediate'
  },

  // Type 5: Daily Challenge
  {
    id: 'gm_dc_1',
    type: 'Daily Challenge',
    prompt: 'What does the idiom "break the ice" mean in social conversation?',
    options: [
      'To end a conversation abruptly',
      'To make people feel more relaxed and initiate friendly conversation',
      'To cool down a beverage with ice cubes',
      'To argue intensely about a controversial topic'
    ],
    answer: 1,
    explanation: '"Break the ice" means to do or say something that relieves tension and makes strangers comfortable.',
    difficulty: 'All levels'
  }
];

export const DAILY_CHALLENGE = {
  id: 'daily_chal_today',
  date: new Date().toISOString().slice(0, 10),
  theme: 'Idioms, Fluency & Active Vocabulary',
  wordOfTheDay: {
    word: 'Articulate',
    phonetic: '/ɑːrˈtɪk.jə.lət/',
    partOfSpeech: 'adjective / verb',
    definition: 'Able to express thoughts, ideas, and feelings clearly and effectively in speech.',
    exampleSentence: 'She gave an articulate and persuasive presentation during the conference.',
    synonyms: ['expressive', 'eloquent', 'lucid', 'fluent']
  },
  questions: WORD_GAME_BANK.slice(0, 3)
};

/**
 * Evaluates a set of submitted game answers and updates user progress.
 */
export function evaluateGameAttempt(user, answers) {
  let correctCount = 0;
  const review = [];

  const questionIds = Object.keys(answers || {});
  const questionsToEvaluate = WORD_GAME_BANK.filter((q) => questionIds.includes(q.id));

  // If no specific IDs match, fallback to evaluating all provided
  const targetList = questionsToEvaluate.length > 0 ? questionsToEvaluate : WORD_GAME_BANK.slice(0, 3);

  targetList.forEach((q) => {
    const userAnswer = answers[q.id] !== undefined ? Number(answers[q.id]) : -1;
    const isCorrect = userAnswer === q.answer;
    if (isCorrect) correctCount++;

    review.push({
      questionId: q.id,
      prompt: q.prompt,
      userAnswer,
      correctAnswer: q.answer,
      isCorrect,
      explanation: q.explanation
    });
  });

  const total = targetList.length || 1;
  const score = Math.round((correctCount / total) * 100);

  // Update User Learning Progress and Streak (Section 14)
  const todayStr = new Date().toISOString().slice(0, 10);
  if (!user.lastPracticeDate) {
    user.streak = (user.streak || 0) + 1;
    user.lastPracticeDate = todayStr;
  } else if (user.lastPracticeDate !== todayStr) {
    const lastDate = new Date(user.lastPracticeDate);
    const today = new Date(todayStr);
    const diffDays = Math.round((today - lastDate) / (1000 * 60 * 60 * 24));

    if (diffDays === 1) {
      user.streak = (user.streak || 0) + 1;
    } else if (diffDays > 1) {
      user.streak = 1;
    }
    user.lastPracticeDate = todayStr;
  }

  user.quizzesCompleted = (user.quizzesCompleted || 0) + 1;
  user.words = (user.words || 0) + correctCount;

  return {
    score,
    totalQuestions: total,
    correctCount,
    streak: user.streak,
    review
  };
}
