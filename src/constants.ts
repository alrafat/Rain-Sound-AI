import { CastMember, SavedCharacterPreset, VoiceCharacterOption } from './types';

export const VOICE_CHARACTERS: VoiceCharacterOption[] = [
  // MALE GEMINI VOICES (Default for Raf: Achird)
  {
    id: 'Achird',
    name: 'Achird',
    geminiVoiceName: 'Achird',
    gender: 'male',
    tag: 'Gemini Male · Grounded · Natural',
    description: 'Warm, articulate male voice with calm emotional depth and conversational realism.',
    sampleLine: 'Hey Rain... listen to the rain outside. We have all evening to figure this out together.',
  },
  {
    id: 'Charon',
    name: 'Charon',
    geminiVoiceName: 'Charon',
    gender: 'male',
    tag: 'Gemini Male · Deep · Cinematic',
    description: 'Deep, measured baritone voice for moody late-night scenes and gravitas.',
    sampleLine: 'The street was completely silent when Raf opened the old wooden door.',
  },
  {
    id: 'Fenrir',
    name: 'Fenrir',
    geminiVoiceName: 'Fenrir',
    gender: 'male',
    tag: 'Gemini Male · Bold · Intense',
    description: 'Strong, textured lower male register for dramatic or urgent moments.',
    sampleLine: 'Stay close to me! We only get one chance before the last train leaves the station.',
  },
  {
    id: 'Puck',
    name: 'Puck',
    geminiVoiceName: 'Puck',
    gender: 'male',
    tag: 'Gemini Male · Bright · Expressive',
    description: 'Energetic, lively male tenor suited for witty, fast-paced dialogue.',
    sampleLine: 'Wait a second—did you actually bring the vintage camera with you tonight?',
  },
  {
    id: 'Orus',
    name: 'Orus',
    geminiVoiceName: 'Orus',
    gender: 'male',
    tag: 'Gemini Male · Steady · Resonant',
    description: 'Clear, resonant male voice ideal for narration, monologues, and earnest dialogue.',
    sampleLine: 'Every memory in this room carries a story we have not finished telling yet.',
  },

  // FEMALE GEMINI VOICES (Default for Rain: Autonoe)
  {
    id: 'Autonoe',
    name: 'Autonoe',
    geminiVoiceName: 'Autonoe',
    gender: 'female',
    tag: 'Gemini Female · Warm · Soulful',
    description: 'Rich, expressive female voice with natural warmth and emotional nuance.',
    sampleLine: 'I kept the letter in my coat pocket all winter, waiting for the right moment to tell you, Raf.',
  },
  {
    id: 'Zephyr',
    name: 'Zephyr',
    geminiVoiceName: 'Zephyr',
    gender: 'female',
    tag: 'Gemini Female · Smooth · Airy',
    description: 'Effortless, gentle female voice with soft breath and natural pacing.',
    sampleLine: 'Raf, look at the city lights through the fog... it feels so peaceful up here.',
  },
  {
    id: 'Kore',
    name: 'Kore',
    geminiVoiceName: 'Kore',
    gender: 'female',
    tag: 'Gemini Female · Poised · Clear',
    description: 'Balanced, crystal-clear female mezzo voice for serene or dramatic dialogue.',
    sampleLine: 'The coffee is still warm, Raf, and the rain is just starting to tap against the glass.',
  },
  {
    id: 'Aoede',
    name: 'Aoede',
    geminiVoiceName: 'Aoede',
    gender: 'female',
    tag: 'Gemini Female · Soft · Intimate',
    description: 'Delicate, lyrical close-mic female voice ideal for quiet, emotional scenes.',
    sampleLine: 'Wait... did you hear that echo across the water? Hold my hand for a second.',
  },
  {
    id: 'Leda',
    name: 'Leda',
    geminiVoiceName: 'Leda',
    gender: 'female',
    tag: 'Gemini Female · Bright · Lively',
    description: 'Crisp, expressive female voice with vibrant energy and warmth.',
    sampleLine: 'Come on, Raf! If we run right now we can still catch the sunset from the bridge.',
  },
];

export const DEFAULT_INITIAL_CAST: CastMember[] = [
  {
    id: 'char-raf',
    name: 'Raf',
    gender: 'male',
    voiceId: 'Achird',
    customEmotion: '',
  },
  {
    id: 'char-rain',
    name: 'Rain',
    gender: 'female',
    voiceId: 'Autonoe',
    customEmotion: '',
  },
];

export const DEFAULT_SAVED_CHARACTERS: SavedCharacterPreset[] = [
  {
    id: 'preset-raf',
    name: 'Raf',
    gender: 'male',
    voiceId: 'Achird',
    customEmotion: 'Calm, warm, reflective, speaking with gentle pauses',
  },
  {
    id: 'preset-rain',
    name: 'Rain',
    gender: 'female',
    voiceId: 'Autonoe',
    customEmotion: 'Soft, expressive, intimate, with subtle emotional breath',
  },
  {
    id: 'preset-narrator',
    name: 'Narrator',
    gender: 'male',
    voiceId: 'Charon',
    customEmotion: 'Deep, cinematic, unhurried storytelling cadence',
  },
  {
    id: 'preset-elena',
    name: 'Elena',
    gender: 'female',
    voiceId: 'Zephyr',
    customEmotion: 'Soulful, earnest, emotionally resonant',
  },
];

export const EXPRESSION_TAGS = [
  { tag: '<breath>', label: '<breath>', hint: 'Natural inhale / breath pause' },
  { tag: '<sigh>', label: '<sigh>', hint: 'Soft emotional sigh' },
  { tag: '<laugh>', label: '<laugh>', hint: 'Natural chuckle or laugh' },
  { tag: '<gasp>', label: '<gasp>', hint: 'Sudden intake of breath' },
  { tag: '<whisper>', label: '<whisper>', hint: 'Hushed, close-mic whisper' },
  { tag: '|yeah|', label: '|yeah|', hint: 'Conversational agreement cue' },
  { tag: '|mhm|', label: '|mhm|', hint: 'Soft affirmative cue' },
];
