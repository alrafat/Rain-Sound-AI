import { CastMember, SavedCharacterPreset, VoiceCharacterOption } from './types';

export const VOICE_CHARACTERS: VoiceCharacterOption[] = [
  // MALE VOICES (For Raf & Male Characters)
  {
    id: 'Akid',
    name: 'Akid',
    gender: 'male',
    tag: 'Male · Grounded · Resonant',
    description: 'Calm, articulate baritone register with warm confidence and depth.',
    sampleLine: 'Hey Rain... listen to the rain outside. We have all evening to figure this out together.',
  },
  {
    id: 'Remy',
    name: 'Remy',
    gender: 'male',
    tag: 'Male · Intimate · Conversational',
    description: 'Close-mic natural male tenor with reflective warmth and quick inflection.',
    sampleLine: 'Haha, I knew you were going to say that the moment we walked in here, Rain.',
  },
  {
    id: 'Charon',
    name: 'Charon',
    gender: 'male',
    tag: 'Male · Deep · Cinematic',
    description: 'Deep, measured baritone voice for moody late-night scenes and gravitas.',
    sampleLine: 'The street was completely silent when Raf opened the old wooden door.',
  },
  {
    id: 'Fenrir',
    name: 'Fenrir',
    gender: 'male',
    tag: 'Male · Bold · Intense',
    description: 'Strong, textured lower male register for dramatic or urgent moments.',
    sampleLine: 'Stay close to me! We only get one chance before the last train leaves the station.',
  },
  {
    id: 'Puck',
    name: 'Puck',
    gender: 'male',
    tag: 'Male · Bright · Expressive',
    description: 'Energetic, lively male tenor suited for witty, fast-paced dialogue.',
    sampleLine: 'Wait a second—did you actually bring the vintage camera with you tonight?',
  },

  // FEMALE VOICES (For Rain & Female Characters)
  {
    id: 'Zephyr',
    name: 'Zephyr',
    gender: 'female',
    tag: 'Female · Smooth · Airy',
    description: 'Effortless, gentle female voice with soft breath and natural pacing.',
    sampleLine: 'Raf, look at the city lights through the fog... it feels so peaceful up here.',
  },
  {
    id: 'Fola',
    name: 'Fola',
    gender: 'female',
    tag: 'Female · Warm · Soulful',
    description: 'Rich, empathetic female storytelling voice with deep emotional warmth.',
    sampleLine: 'I kept the letter in my coat pocket all winter, waiting for the right moment to tell you, Raf.',
  },
  {
    id: 'Kore',
    name: 'Kore',
    gender: 'female',
    tag: 'Female · Poised · Clear',
    description: 'Balanced, crystal-clear female mezzo voice for serene or dramatic dialogue.',
    sampleLine: 'The coffee is still warm, Raf, and the rain is just starting to tap against the glass.',
  },
  {
    id: 'Aria',
    name: 'Aria',
    gender: 'female',
    tag: 'Female · Soft · Intimate',
    description: 'Delicate, close-mic female voice ideal for quiet, emotional scenes.',
    sampleLine: 'Wait... did you hear that echo across the water? Hold my hand for a second.',
  },
  {
    id: 'Sora',
    name: 'Sora',
    gender: 'female',
    tag: 'Female · Bright · Lively',
    description: 'Crisp, expressive female voice with cheerful energy and warmth.',
    sampleLine: 'Come on, Raf! If we run right now we can still catch the sunset from the bridge.',
  },
];

export const DEFAULT_INITIAL_CAST: CastMember[] = [
  {
    id: 'char-raf',
    name: 'Raf',
    gender: 'male',
    voiceId: 'Akid',
    customEmotion: '',
  },
  {
    id: 'char-rain',
    name: 'Rain',
    gender: 'female',
    voiceId: 'Zephyr',
    customEmotion: '',
  },
];

export const DEFAULT_SAVED_CHARACTERS: SavedCharacterPreset[] = [
  {
    id: 'preset-raf',
    name: 'Raf',
    gender: 'male',
    voiceId: 'Akid',
    customEmotion: 'Calm, warm, reflective, speaking with gentle pauses',
  },
  {
    id: 'preset-rain',
    name: 'Rain',
    gender: 'female',
    voiceId: 'Zephyr',
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
    voiceId: 'Fola',
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
