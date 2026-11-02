export type VoiceGender = 'male' | 'female';

export type TalkingMode = 'single' | 'dual' | 'multi';

export type VoiceCharacterId =
  | 'Achird'
  | 'Charon'
  | 'Fenrir'
  | 'Puck'
  | 'Orus'
  | 'Autonoe'
  | 'Zephyr'
  | 'Kore'
  | 'Aoede'
  | 'Leda';

export interface VoiceCharacterOption {
  id: VoiceCharacterId;
  name: VoiceCharacterId;
  geminiVoiceName: VoiceCharacterId;
  gender: VoiceGender;
  tag: string;
  description: string;
  sampleLine: string;
}

export interface CastMember {
  id: string;
  name: string;
  gender: VoiceGender;
  voiceId: VoiceCharacterId;
  customEmotion: string;
}

export interface SavedCharacterPreset {
  id: string;
  name: string;
  gender: VoiceGender;
  voiceId: VoiceCharacterId;
  customEmotion: string;
}

export interface DialogueLine {
  id: string;
  speaker: string;
  voiceId: VoiceCharacterId;
  emotion: string;
  text: string;
  rawTextWithTags?: string;
}

export interface ConversationTurn {
  id: string;
  userPrompt: string;
  isRevision: boolean;
  sceneTitle: string;
  environmentNote: string;
  talkingMode: TalkingMode;
  castSnapshot: CastMember[];
  lines: DialogueLine[];
  mp3Base64: string;
  wavBase64: string;
  durationSeconds: number;
  fileSizeBytes: number;
  peaks: number[];
  createdAt: string;
}

export interface SceneSession {
  id: string;
  title: string;
  talkingMode: TalkingMode;
  createdAt: string;
  updatedAt: string;
  cast: CastMember[];
  turns: ConversationTurn[];
}
