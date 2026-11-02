import React, { useState, useRef, useEffect } from 'react';
import {
  Play,
  Pause,
  Download,
  Volume2,
  Sparkles,
  Send,
  Plus,
  Trash2,
  Edit3,
  Check,
  Loader2,
  AlertCircle,
  Menu,
  X,
  UserPlus,
  Bookmark,
  RotateCcw,
  Sliders,
  ArrowRight,
  Mic,
  Users,
  User,
} from 'lucide-react';
import {
  CastMember,
  ConversationTurn,
  DialogueLine,
  SavedCharacterPreset,
  SceneSession,
  TalkingMode,
  VoiceGender,
} from './types';
import {
  DEFAULT_INITIAL_CAST,
  DEFAULT_SAVED_CHARACTERS,
  EXPRESSION_TAGS,
  VOICE_CHARACTERS,
} from './constants';

const SCENES_STORAGE_KEY = 'rain_sound_scenes_v4';
const CHARS_STORAGE_KEY = 'rain_sound_saved_chars_v4';

function normalizeVoiceId(rawVoiceId: any, gender: VoiceGender): any {
  const legacyMap: Record<string, string> = {
    Akid: 'Achird',
    Remy: 'Puck',
    Fola: 'Autonoe',
    Aria: 'Aoede',
    Sora: 'Leda',
  };
  const mapped = legacyMap[String(rawVoiceId || '')] || String(rawVoiceId || '');
  if (VOICE_CHARACTERS.some((v) => v.id === mapped)) {
    return mapped;
  }
  return gender === 'female' ? 'Autonoe' : 'Achird';
}

function formatTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return '00:00';
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

function formatBytes(bytes: number): string {
  if (!bytes || bytes <= 0) return '0 KB';
  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(0)} KB`;
  }
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

function base64ToBlobUrl(base64: string, mimeType: string): string {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  const blob = new Blob([bytes], { type: mimeType });
  return URL.createObjectURL(blob);
}

function buildInitialCastForMode(mode: TalkingMode): CastMember[] {
  if (mode === 'single') {
    return [{ ...DEFAULT_INITIAL_CAST[0], customEmotion: '' }];
  }
  if (mode === 'multi') {
    return [
      { ...DEFAULT_INITIAL_CAST[0], customEmotion: '' },
      { ...DEFAULT_INITIAL_CAST[1], customEmotion: '' },
      {
        id: `char-${Date.now()}-3`,
        name: 'Victor',
        gender: 'male',
        voiceId: 'Charon',
        customEmotion: '',
      },
    ];
  }
  return DEFAULT_INITIAL_CAST.map((c) => ({ ...c, customEmotion: '' }));
}

function createFreshScene(sceneNumber: number, mode: TalkingMode = 'dual'): SceneSession {
  const now = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  const initialCast = buildInitialCastForMode(mode);
  return {
    id: `scene-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    title: `Scene 0${sceneNumber} · ${initialCast.map((c) => c.name).join(' & ')}`,
    talkingMode: mode,
    createdAt: now,
    updatedAt: now,
    cast: initialCast,
    turns: [],
  };
}

/**
 * Renders spoken dialogue text while styling inline cues like <breath>, <laugh>, <sigh>
 * as clean minimalist tags.
 */
function renderScriptTextWithCues(rawText: string) {
  const parts = rawText.split(/(<[^>]+>|\|[^|]+\|)/g);
  return parts.map((part, idx) => {
    if (/^<[^>]+>$/.test(part) || /^\|[^|]+\|$/.test(part)) {
      return (
        <span
          key={idx}
          className="inline-block mx-1 px-1.5 py-0.5 text-[11px] font-mono-num bg-[#111110]/10 text-[#111110] rounded-xs align-baseline"
        >
          {part}
        </span>
      );
    }
    return <React.Fragment key={idx}>{part}</React.Fragment>;
  });
}

/**
 * Bespoke Out-of-the-Box Geometric Soundwave Logo for "Rain sound"
 */
function RainSoundLogo({ large = false }: { large?: boolean }) {
  return (
    <div className="inline-flex items-center gap-3 select-none">
      {/* Geometric Architectural Acoustic Emblem */}
      <div
        className={`relative flex items-center justify-center bg-[#111110] text-[#F7F5EE] ${
          large ? 'w-12 h-12 rounded-xl' : 'w-9 h-9 rounded-lg'
        }`}
      >
        <svg
          viewBox="0 0 36 36"
          fill="none"
          className={large ? 'w-7 h-7' : 'w-5 h-5'}
          aria-hidden="true"
        >
          {/* Outer minimal corner dots */}
          <circle cx="6" cy="6" r="1.3" fill="#F7F5EE" fillOpacity="0.45" />
          <circle cx="30" cy="6" r="1.3" fill="#F7F5EE" fillOpacity="0.45" />
          <circle cx="6" cy="30" r="1.3" fill="#F7F5EE" fillOpacity="0.45" />
          <circle cx="30" cy="30" r="1.3" fill="#D92B2B" />
          {/* Geometric staggered rain-wave bars */}
          <rect x="8.5" y="14" width="2.5" height="8" rx="1.25" fill="#F7F5EE" />
          <rect x="13" y="9" width="2.5" height="18" rx="1.25" fill="#F7F5EE" />
          <rect x="17.5" y="5" width="2.5" height="26" rx="1.25" fill="#F7F5EE" />
          <rect x="22" y="11" width="2.5" height="14" rx="1.25" fill="#F7F5EE" />
          <rect x="26.5" y="15.5" width="2.5" height="5" rx="1.25" fill="#D92B2B" />
        </svg>
      </div>

      {/* Architectural Typography + Dot-Matrix Accent */}
      <div className="flex flex-col leading-none">
        <div className="flex items-center gap-1.5">
          <span
            className={`font-logo font-bold tracking-tight text-[#111110] ${
              large ? 'text-2xl sm:text-3xl' : 'text-lg'
            }`}
          >
            RAIN
          </span>
          <span
            className={`font-figtree font-light tracking-tight text-[#111110] ${
              large ? 'text-2xl sm:text-3xl' : 'text-lg'
            }`}
          >
            sound
          </span>
          <span className="inline-flex items-center gap-0.5 ml-1">
            <span className="w-1 h-1 rounded-full bg-[#111110]" />
            <span className="w-1 h-1 rounded-full bg-[#111110]/50" />
            <span className="w-1 h-1 rounded-full bg-[#D92B2B]" />
          </span>
        </div>
        {large && (
          <span className="font-dot text-[10px] uppercase tracking-[0.2em] text-[#6E6C65] mt-1">
            ACOUSTIC VOICE STUDIO
          </span>
        )}
      </div>
    </div>
  );
}

export default function App() {
  // View state: Starts on minimalist 'landing' view so previous scenes never clutter the first page
  const [viewMode, setViewMode] = useState<'landing' | 'studio'>('landing');
  const [landingModeChoice, setLandingModeChoice] = useState<TalkingMode>('dual');

  // Slide-out sidebar drawer state (opened only when needed)
  const [isDrawerOpen, setIsDrawerOpen] = useState<boolean>(false);
  const [drawerTab, setDrawerTab] = useState<'scenes' | 'characters'>('scenes');

  // Saved Scenes State
  const [scenes, setScenes] = useState<SceneSession[]>(() => {
    try {
      const raw = localStorage.getItem(SCENES_STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed) && parsed.length > 0) {
          return parsed.map((s: any, idx: number) => ({
            id: s.id || `scene-${Date.now()}-${idx}`,
            title: s.title || `Scene 0${idx + 1}`,
            talkingMode:
              s.talkingMode === 'single' || s.talkingMode === 'multi'
                ? s.talkingMode
                : 'dual',
            createdAt: s.createdAt || 'Just now',
            updatedAt: s.updatedAt || 'Just now',
            cast:
              Array.isArray(s.cast) && s.cast.length > 0
                ? s.cast.map((c: any, cIdx: number) => {
                    const g: VoiceGender =
                      c.gender === 'female' ? 'female' : 'male';
                    return {
                      id: c.id || `char-${cIdx + 1}`,
                      name: c.name || `Character ${cIdx + 1}`,
                      gender: g,
                      voiceId: normalizeVoiceId(c.voiceId, g),
                      customEmotion:
                        typeof c.customEmotion === 'string' ? c.customEmotion : '',
                    };
                  })
                : buildInitialCastForMode('dual'),
            turns: Array.isArray(s.turns)
              ? s.turns.map((t: any, tIdx: number) => ({
                  ...t,
                  id: t.id || `turn-${tIdx + 1}`,
                  castSnapshot: Array.isArray(t.castSnapshot) ? t.castSnapshot : [],
                  lines: Array.isArray(t.lines) ? t.lines : [],
                  peaks:
                    Array.isArray(t.peaks) && t.peaks.length > 0
                      ? t.peaks
                      : Array(64).fill(0.3),
                  wavBase64: t.wavBase64 || t.mp3Base64 || '',
                  mp3Base64: t.mp3Base64 || '',
                }))
              : [],
          }));
        }
      }
    } catch {
      // Ignore storage errors
    }
    return [createFreshScene(1, 'dual')];
  });

  // Saved Characters Library State
  const [savedCharacters, setSavedCharacters] = useState<SavedCharacterPreset[]>(() => {
    try {
      const raw = localStorage.getItem(CHARS_STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed) && parsed.length > 0) {
          return parsed.map((p: any) => {
            const g: VoiceGender = p.gender === 'female' ? 'female' : 'male';
            return {
              ...p,
              gender: g,
              voiceId: normalizeVoiceId(p.voiceId, g),
            };
          });
        }
      }
    } catch {
      // Ignore
    }
    return DEFAULT_SAVED_CHARACTERS;
  });

  const [activeSceneId, setActiveSceneId] = useState<string>(() => scenes[0]?.id || '');
  const [statusToast, setStatusToast] = useState<string | null>(null);
  const [storageWarning, setStorageWarning] = useState<string | null>(null);

  const activeScene = scenes.find((s) => s.id === activeSceneId) || scenes[0];

  useEffect(() => {
    try {
      localStorage.setItem(SCENES_STORAGE_KEY, JSON.stringify(scenes));
      setStorageWarning(null);
    } catch {
      setStorageWarning(
        'Browser storage is full: Your latest audio is ready to play and download right now, but older audio files cannot fit in browser storage. Please download your MP3/WAV files or delete older scenes from Saved Scenes.'
      );
      try {
        // Save scenes with script metadata intact while keeping only the latest scene's audio payload
        const compactScenes = scenes.map((s, sIdx) => ({
          ...s,
          turns: s.turns.map((t, tIdx) =>
            sIdx === 0 && tIdx === s.turns.length - 1
              ? { ...t, wavBase64: '' }
              : { ...t, mp3Base64: '', wavBase64: '' }
          ),
        }));
        localStorage.setItem(SCENES_STORAGE_KEY, JSON.stringify(compactScenes));
      } catch {
        // Even compact storage exceeded browser quota; warning banner is already active
      }
    }
  }, [scenes]);

  useEffect(() => {
    try {
      localStorage.setItem(CHARS_STORAGE_KEY, JSON.stringify(savedCharacters));
    } catch {
      setStorageWarning(
        'Browser storage is full: Could not persist character presets to localStorage.'
      );
    }
  }, [savedCharacters]);

  // Prompt Box & Studio UI states
  const [promptInput, setPromptInput] = useState<string>('');
  const [isGeneratingTurn, setIsGeneratingTurn] = useState<boolean>(false);
  const [isGeneratingPromptIdea, setIsGeneratingPromptIdea] = useState<boolean>(false);
  const [auditioningKey, setAuditioningKey] = useState<string | null>(null);
  const [resynthesizingTurnId, setResynthesizingTurnId] = useState<string | null>(null);
  const [editingTurnId, setEditingTurnId] = useState<string | null>(null);
  const [editedLines, setEditedLines] = useState<DialogueLine[]>([]);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Audio playback state
  const [playingTurnId, setPlayingTurnId] = useState<string | null>(null);
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [currentTime, setCurrentTime] = useState<number>(0);
  const [duration, setDuration] = useState<number>(0);
  const [playbackRate, setPlaybackRate] = useState<number>(1);

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const previewAudioRef = useRef<HTMLAudioElement | null>(null);
  const activeBlobUrlRef = useRef<string | null>(null);
  const promptInputRef = useRef<HTMLTextAreaElement | null>(null);
  const feedBottomRef = useRef<HTMLDivElement | null>(null);

  const cast = activeScene.cast;
  const turns = activeScene.turns;
  const talkingMode: TalkingMode = activeScene.talkingMode || 'dual';
  const latestTurn = turns[turns.length - 1] || null;

  const showToast = (msg: string) => {
    setStatusToast(msg);
    setTimeout(() => setStatusToast(null), 3500);
  };

  const updateActiveScene = (updater: (scene: SceneSession) => SceneSession) => {
    setScenes((prev) =>
      prev.map((s) => (s.id === activeScene.id ? updater(s) : s))
    );
  };

  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.playbackRate = playbackRate;
    }
  }, [playbackRate]);

  useEffect(() => {
    return () => {
      if (activeBlobUrlRef.current) {
        URL.revokeObjectURL(activeBlobUrlRef.current);
      }
    };
  }, []);

  const loadAndPlayTurnAudio = (turn: ConversationTurn) => {
    if (activeBlobUrlRef.current) {
      URL.revokeObjectURL(activeBlobUrlRef.current);
    }
    const url = base64ToBlobUrl(turn.mp3Base64, 'audio/mpeg');
    activeBlobUrlRef.current = url;
    setPlayingTurnId(turn.id);
    setCurrentTime(0);
    setDuration(turn.durationSeconds);

    if (audioRef.current) {
      audioRef.current.src = url;
      audioRef.current.playbackRate = playbackRate;
      audioRef.current
        .play()
        .then(() => setIsPlaying(true))
        .catch(() => setIsPlaying(false));
    }
  };

  // Start a New Scene -> Transitions from Landing to Studio (or resets studio with a new scene)
  const handleStartNewScene = (modeOverride?: TalkingMode) => {
    if (audioRef.current) {
      audioRef.current.pause();
    }
    setIsPlaying(false);
    setPlayingTurnId(null);
    setEditingTurnId(null);
    setErrorMessage(null);
    setPromptInput('');
    setIsDrawerOpen(false);

    const chosenMode = modeOverride || landingModeChoice || 'dual';

    // If the current first scene is completely empty (0 turns), reuse and configure it cleanly
    if (scenes.length === 1 && scenes[0].turns.length === 0) {
      const fresh = createFreshScene(1, chosenMode);
      setScenes([fresh]);
      setActiveSceneId(fresh.id);
    } else {
      const nextNum = scenes.length + 1;
      const fresh = createFreshScene(nextNum, chosenMode);
      setScenes((prev) => [fresh, ...prev]);
      setActiveSceneId(fresh.id);
    }

    setViewMode('studio');
    setTimeout(() => promptInputRef.current?.focus(), 100);
  };

  // Switch Talking Mode (Single / Dual / Multi) inside the active scene
  const handleChangeTalkingMode = (newMode: TalkingMode) => {
    updateActiveScene((scene) => {
      let nextCast = [...scene.cast];
      if (newMode === 'single') {
        nextCast = [nextCast[0] || { ...DEFAULT_INITIAL_CAST[0], customEmotion: '' }];
      } else if (newMode === 'dual') {
        if (nextCast.length === 1) {
          nextCast.push({ ...DEFAULT_INITIAL_CAST[1], customEmotion: '' });
        } else if (nextCast.length > 2) {
          nextCast = nextCast.slice(0, 2);
        }
      } else if (newMode === 'multi') {
        if (nextCast.length === 1) {
          nextCast.push({ ...DEFAULT_INITIAL_CAST[1], customEmotion: '' });
        }
        if (nextCast.length === 2) {
          nextCast.push({
            id: `char-${Date.now()}-3`,
            name: 'Victor',
            gender: 'male',
            voiceId: 'Charon',
            customEmotion: '',
          });
        }
      }

      return {
        ...scene,
        talkingMode: newMode,
        cast: nextCast,
      };
    });
  };

  const handleSelectSavedScene = (sceneId: string) => {
    if (audioRef.current) {
      audioRef.current.pause();
    }
    setIsPlaying(false);
    setPlayingTurnId(null);
    setEditingTurnId(null);
    setErrorMessage(null);
    setActiveSceneId(sceneId);
    setViewMode('studio');
    setIsDrawerOpen(false);
  };

  const handleDeleteScene = (sceneId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (scenes.length <= 1) {
      const fresh = createFreshScene(1, 'dual');
      setScenes([fresh]);
      setActiveSceneId(fresh.id);
      return;
    }
    const remaining = scenes.filter((s) => s.id !== sceneId);
    setScenes(remaining);
    if (activeScene.id === sceneId) {
      setActiveSceneId(remaining[0].id);
    }
  };

  // Character CRUD & Emotion Updates
  const handleUpdateCharacter = (charId: string, patch: Partial<CastMember>) => {
    updateActiveScene((scene) => {
      const nextCast = scene.cast.map((c) => {
        if (c.id !== charId) return c;
        const updated = { ...c, ...patch };
        if (patch.gender) {
          const currentVoiceMeta = VOICE_CHARACTERS.find((v) => v.id === updated.voiceId);
          if (!currentVoiceMeta || currentVoiceMeta.gender !== patch.gender) {
            const firstMatching = VOICE_CHARACTERS.find((v) => v.gender === patch.gender);
            if (firstMatching) updated.voiceId = firstMatching.id;
          }
        }
        return updated;
      });

      const titlePrefix = scene.title.split('·')[0]?.trim() || 'Scene';
      const nextTitle =
        scene.turns.length === 0
          ? `${titlePrefix} · ${nextCast.map((c) => c.name || 'Character').join(' & ')}`
          : scene.title;

      return {
        ...scene,
        title: nextTitle,
        cast: nextCast,
      };
    });
  };

  const handleAddCharacter = () => {
    updateActiveScene((scene) => {
      const idx = scene.cast.length + 1;
      const nextGender: VoiceGender = idx % 2 === 1 ? 'male' : 'female';
      const genderVoices = VOICE_CHARACTERS.filter((v) => v.gender === nextGender);
      const usedVoices = new Set(scene.cast.map((c) => c.voiceId));
      const pickedVoice =
        genderVoices.find((v) => !usedVoices.has(v.id))?.id || genderVoices[0].id;

      const newChar: CastMember = {
        id: `char-${Date.now()}-${idx}`,
        name: `Character ${idx}`,
        gender: nextGender,
        voiceId: pickedVoice,
        customEmotion: '',
      };

      const nextCast = [...scene.cast, newChar];
      const nextMode: TalkingMode =
        nextCast.length === 1 ? 'single' : nextCast.length === 2 ? 'dual' : 'multi';

      return {
        ...scene,
        talkingMode: nextMode,
        cast: nextCast,
      };
    });
  };

  const handleRemoveCharacter = (charId: string) => {
    if (cast.length <= 1) return;
    updateActiveScene((scene) => {
      const nextCast = scene.cast.filter((c) => c.id !== charId);
      const nextMode: TalkingMode =
        nextCast.length === 1 ? 'single' : nextCast.length === 2 ? 'dual' : 'multi';
      return {
        ...scene,
        talkingMode: nextMode,
        cast: nextCast,
      };
    });
  };

  // Save a character to the Saved Characters drawer library
  const handleSaveCharacterToLibrary = (member: CastMember) => {
    const newPreset: SavedCharacterPreset = {
      id: `preset-${Date.now()}`,
      name: member.name.trim() || 'Custom Character',
      gender: member.gender,
      voiceId: member.voiceId,
      customEmotion: member.customEmotion.trim(),
    };
    setSavedCharacters((prev) => {
      const existingIdx = prev.findIndex(
        (p) => p.name.toLowerCase() === newPreset.name.toLowerCase()
      );
      if (existingIdx >= 0) {
        const copy = [...prev];
        copy[existingIdx] = newPreset;
        return copy;
      }
      return [newPreset, ...prev];
    });
    showToast(`Saved "${newPreset.name}" to your Saved Characters drawer.`);
  };

  // Load a saved character preset from the drawer into the active scene
  const handleLoadSavedCharacterIntoScene = (preset: SavedCharacterPreset) => {
    updateActiveScene((scene) => {
      const existingIdx = scene.cast.findIndex(
        (c) => c.name.toLowerCase() === preset.name.toLowerCase()
      );
      let nextCast = [...scene.cast];
      if (existingIdx >= 0) {
        nextCast[existingIdx] = {
          ...nextCast[existingIdx],
          name: preset.name,
          gender: preset.gender,
          voiceId: preset.voiceId,
          customEmotion: preset.customEmotion,
        };
      } else {
        nextCast.push({
          id: `char-${Date.now()}`,
          name: preset.name,
          gender: preset.gender,
          voiceId: preset.voiceId,
          customEmotion: preset.customEmotion,
        });
      }
      const nextMode: TalkingMode =
        nextCast.length === 1 ? 'single' : nextCast.length === 2 ? 'dual' : 'multi';
      return {
        ...scene,
        talkingMode: nextMode,
        cast: nextCast,
      };
    });
    setViewMode('studio');
    setIsDrawerOpen(false);
    showToast(`Loaded "${preset.name}" into current scene.`);
  };

  const handleDeleteSavedCharacter = (presetId: string) => {
    setSavedCharacters((prev) => prev.filter((p) => p.id !== presetId));
  };

  // Insert <breath>, <laugh>, <gasp>, etc. into the prompt box
  const handleInsertExpressionTag = (tag: string) => {
    setPromptInput((prev) => {
      const trimmed = prev.trimEnd();
      const spacer = trimmed.length > 0 ? ' ' : '';
      return `${trimmed}${spacer}${tag} `;
    });
    promptInputRef.current?.focus();
  };

  // Audition Male or Female Sample Voice (includes member.customEmotion!)
  const handleAuditionVoice = async (char: CastMember) => {
    setErrorMessage(null);
    const key = `${char.id}-${char.voiceId}`;
    setAuditioningKey(key);
    try {
      const voiceMeta = VOICE_CHARACTERS.find((v) => v.id === char.voiceId);
      const res = await fetch('/api/tts/audition', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          voiceId: char.voiceId,
          characterName: char.name,
          sampleText: voiceMeta?.sampleLine,
          customEmotion: char.customEmotion,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Could not preview voice sample.');

      const url = base64ToBlobUrl(data.mp3Base64, 'audio/mpeg');
      if (!previewAudioRef.current) {
        previewAudioRef.current = new Audio();
      }
      previewAudioRef.current.src = url;
      await previewAudioRef.current.play();
    } catch (err: any) {
      setErrorMessage(err?.message || 'Voice preview failed.');
    } finally {
      setAuditioningKey(null);
    }
  };

  // Auto-generate AI Scene Prompt
  const handleGenerateAiPrompt = async () => {
    setErrorMessage(null);
    setIsGeneratingPromptIdea(true);
    try {
      const res = await fetch('/api/session/generate-prompt', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          seedIdea: promptInput,
          cast,
          talkingMode,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Could not generate prompt.');
      setPromptInput(data.prompt);
    } catch (err: any) {
      setErrorMessage(err?.message || 'Failed to generate AI prompt.');
    } finally {
      setIsGeneratingPromptIdea(false);
    }
  };

  const [generationProgressText, setGenerationProgressText] = useState<string>(
    'Rendering Expressive Audio (MP3 & WAV)...'
  );

  // Helper to synthesize any array of script lines in safe chunks of up to 10 lines and return final WAV + MP3
  const synthesizeLinesInChunks = async (
    linesToRender: DialogueLine[],
    castToUse: CastMember[],
    onProgress?: (msg: string) => void
  ) => {
    const chunkSize = 10;
    const totalChunks = Math.max(1, Math.ceil(linesToRender.length / chunkSize));
    const pcmChunksBase64: string[] = [];

    for (let i = 0; i < linesToRender.length; i += chunkSize) {
      const chunkIdx = Math.floor(i / chunkSize) + 1;
      onProgress?.(
        totalChunks > 1
          ? `Synthesizing Voice Batch ${chunkIdx} of ${totalChunks}...`
          : 'Synthesizing Studio Voice Audio...'
      );

      const chunkLines = linesToRender.slice(i, i + chunkSize);
      const chunkRes = await fetch('/api/session/synthesize-chunk', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          lines: chunkLines,
          cast: castToUse,
        }),
      });
      const chunkData = await chunkRes.json();
      if (!chunkRes.ok) {
        throw new Error(chunkData.error || 'Failed to synthesize voice batch.');
      }
      if (chunkData.pcmBase64) {
        pcmChunksBase64.push(chunkData.pcmBase64);
      }
    }

    onProgress?.('Encoding Master MP3 & WAV...');
    const finalRes = await fetch('/api/session/finalize-audio', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pcmChunksBase64 }),
    });
    const finalData = await finalRes.json();
    if (!finalRes.ok) {
      throw new Error(finalData.error || 'Failed to encode master audio.');
    }
    return finalData;
  };

  // Submit Prompt or Re-Prompt -> Generates Script + Chunked MP3 & WAV
  const handleSubmitPrompt = async () => {
    const textToSend = promptInput.trim();
    if (!textToSend || isGeneratingTurn) return;

    setErrorMessage(null);
    setIsGeneratingTurn(true);
    setGenerationProgressText('Directing Script & Emotional Cues...');

    try {
      const previousScript = latestTurn ? latestTurn.lines : null;
      const scriptRes = await fetch('/api/session/script', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userPrompt: textToSend,
          talkingMode,
          cast,
          previousScript,
        }),
      });

      const scriptData = await scriptRes.json();
      if (!scriptRes.ok) {
        throw new Error(scriptData.error || 'Failed to prepare script.');
      }

      const updatedCast: CastMember[] =
        Array.isArray(scriptData.updatedCast) && scriptData.updatedCast.length > 0
          ? scriptData.updatedCast
          : cast;

      const audioMaster = await synthesizeLinesInChunks(
        scriptData.lines,
        updatedCast,
        (msg) => setGenerationProgressText(msg)
      );

      const nowStr = new Date().toLocaleTimeString([], {
        hour: '2-digit',
        minute: '2-digit',
      });

      const newTurn: ConversationTurn = {
        id: `turn-${Date.now()}`,
        userPrompt: textToSend,
        isRevision: Boolean(previousScript),
        sceneTitle: scriptData.sceneTitle,
        environmentNote: scriptData.environmentNote,
        talkingMode,
        castSnapshot: updatedCast,
        lines: scriptData.lines,
        mp3Base64: audioMaster.mp3Base64,
        wavBase64: audioMaster.wavBase64,
        durationSeconds: audioMaster.durationSeconds,
        fileSizeBytes: audioMaster.fileSizeBytes,
        peaks: audioMaster.peaks || Array(64).fill(0.3),
        createdAt: nowStr,
      };

      updateActiveScene((scene) => ({
        ...scene,
        title: scriptData.sceneTitle || scene.title,
        updatedAt: nowStr,
        cast: updatedCast,
        turns: [...scene.turns, newTurn],
      }));

      setPromptInput('');
      loadAndPlayTurnAudio(newTurn);

      setTimeout(() => {
        feedBottomRef.current?.scrollIntoView({ behavior: 'smooth' });
      }, 120);
    } catch (err: any) {
      setErrorMessage(err?.message || 'Could not generate audio.');
    } finally {
      setIsGeneratingTurn(false);
    }
  };

  // Save directly edited script lines and re-render MP3 & WAV
  const handleSaveEditedLinesAndResynthesize = async (turn: ConversationTurn) => {
    setErrorMessage(null);
    setResynthesizingTurnId(turn.id);
    try {
      const audioMaster = await synthesizeLinesInChunks(editedLines, cast);

      const updatedTurn: ConversationTurn = {
        ...turn,
        castSnapshot: cast,
        lines: editedLines,
        mp3Base64: audioMaster.mp3Base64,
        wavBase64: audioMaster.wavBase64,
        durationSeconds: audioMaster.durationSeconds,
        fileSizeBytes: audioMaster.fileSizeBytes,
        peaks: audioMaster.peaks || turn.peaks,
      };

      updateActiveScene((scene) => ({
        ...scene,
        turns: scene.turns.map((t) => (t.id === turn.id ? updatedTurn : t)),
      }));
      setEditingTurnId(null);
      loadAndPlayTurnAudio(updatedTurn);
    } catch (err: any) {
      setErrorMessage(err?.message || 'Failed to update audio.');
    } finally {
      setResynthesizingTurnId(null);
    }
  };

  const handleTogglePlay = (turn: ConversationTurn) => {
    if (playingTurnId !== turn.id) {
      loadAndPlayTurnAudio(turn);
      return;
    }
    if (!audioRef.current) return;
    if (isPlaying) {
      audioRef.current.pause();
      setIsPlaying(false);
    } else {
      audioRef.current
        .play()
        .then(() => setIsPlaying(true))
        .catch(() => setIsPlaying(false));
    }
  };

  const handleSeek = (turn: ConversationTurn, ratio: number) => {
    if (playingTurnId !== turn.id) {
      loadAndPlayTurnAudio(turn);
      return;
    }
    if (!audioRef.current || !duration) return;
    const nextTime = Math.max(0, Math.min(duration, ratio * duration));
    audioRef.current.currentTime = nextTime;
    setCurrentTime(nextTime);
  };

  const handleDownload = (turn: ConversationTurn, format: 'mp3' | 'wav') => {
    const base64 = format === 'mp3' ? turn.mp3Base64 : turn.wavBase64;
    const mime = format === 'mp3' ? 'audio/mpeg' : 'audio/wav';
    const url = base64ToBlobUrl(base64, mime);
    const slug =
      turn.sceneTitle
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '') || 'rain-sound';

    const a = document.createElement('a');
    a.href = url;
    a.download = `${slug}.${format}`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 3000);
  };

  // Calculate prompt word count and estimated spoken length
  const promptWordCount = promptInput.trim()
    ? promptInput.trim().split(/\s+/).length
    : 0;
  const estMinutes = Math.floor(promptWordCount / 140);
  const estSeconds = Math.round(((promptWordCount % 140) / 140) * 60);

  return (
    <div className="min-h-screen bg-[#F7F5EE] text-[#111110] font-figtree flex flex-col selection:bg-[#111110] selection:text-[#F7F5EE]">
      {/* Hidden Audio Element */}
      <audio
        ref={audioRef}
        onTimeUpdate={() => {
          if (audioRef.current) setCurrentTime(audioRef.current.currentTime);
        }}
        onLoadedMetadata={() => {
          if (audioRef.current && Number.isFinite(audioRef.current.duration)) {
            setDuration(audioRef.current.duration);
          }
        }}
        onEnded={() => setIsPlaying(false)}
        onPause={() => setIsPlaying(false)}
        onPlay={() => setIsPlaying(true)}
      />

      {/* Top Navigation Bar (Strict 3-Zone Contract) */}
      <header className="flex items-center justify-between gap-8 px-6 py-4 border-b border-[#111110]/15 bg-[#F7F5EE]/95 sticky top-0 z-30 backdrop-blur-xs">
        {/* Zone 1: Brand Logo */}
        <button
          onClick={() => setViewMode('landing')}
          className="text-left focus:outline-none cursor-pointer shrink-0"
        >
          <RainSoundLogo />
        </button>

        {/* Zone 2: Minimalist Navigation Links */}
        <nav className="hidden md:flex items-center gap-6 text-sm font-medium text-[#6E6C65]">
          <button
            onClick={() => {
              setDrawerTab('scenes');
              setIsDrawerOpen(true);
            }}
            className="hover:text-[#111110] transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            Saved Scenes ({scenes.filter((s) => s.turns.length > 0).length || scenes.length})
          </button>
          <button
            onClick={() => {
              setDrawerTab('characters');
              setIsDrawerOpen(true);
            }}
            className="hover:text-[#111110] transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            Saved Characters ({savedCharacters.length})
          </button>
          {viewMode === 'studio' && (
            <a
              href="#prompt-studio"
              className="hover:text-[#111110] transition-colors whitespace-nowrap shrink-0"
            >
              Prompt &amp; Script Box
            </a>
          )}
        </nav>

        {/* Zone 3: Drawer Toggle & Primary New Scene CTA */}
        <div className="flex items-center gap-2.5 shrink-0">
          <button
            onClick={() => setIsDrawerOpen(true)}
            aria-label="Open saved scenes and characters menu"
            className="px-3.5 py-2 text-xs font-medium text-[#111110] bg-[#EFECE3] hover:bg-[#111110]/10 border border-[#111110]/20 rounded-lg transition-colors flex items-center gap-2 whitespace-nowrap shrink-0 cursor-pointer"
          >
            <Menu className="w-4 h-4" />
            <span>Menu</span>
          </button>

          <button
            onClick={() => handleStartNewScene()}
            className="px-4 py-2 text-xs font-semibold text-[#F7F5EE] bg-[#111110] hover:bg-[#2A2A28] rounded-lg transition-colors flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>New Scene</span>
          </button>
        </div>
      </header>

      {/* Slide-Out Sidebar Drawer (Hidden by default; opened when needed) */}
      {isDrawerOpen && (
        <div className="fixed inset-0 z-50 flex">
          {/* Backdrop */}
          <div
            onClick={() => setIsDrawerOpen(false)}
            className="fixed inset-0 bg-[#111110]/30 backdrop-blur-[1px] transition-opacity"
          />

          {/* Slide-Out Panel */}
          <aside className="relative z-10 w-full max-w-md bg-[#F7F5EE] border-r border-[#111110]/20 h-full flex flex-col justify-between p-6 shadow-2xl">
            <div className="space-y-5 overflow-y-auto pr-1">
              <div className="flex items-center justify-between border-b border-[#111110]/15 pb-4">
                <RainSoundLogo />
                <button
                  onClick={() => setIsDrawerOpen(false)}
                  aria-label="Close sidebar menu"
                  className="p-2 rounded-lg text-[#6E6C65] hover:text-[#111110] hover:bg-[#EFECE3] transition-colors cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* Segmented Drawer Tabs: Saved Scenes | Saved Characters */}
              <div className="grid grid-cols-2 gap-1 p-1 bg-[#EFECE3] rounded-lg border border-[#111110]/15">
                <button
                  onClick={() => setDrawerTab('scenes')}
                  className={`py-2 px-3 text-xs font-semibold rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                    drawerTab === 'scenes'
                      ? 'bg-[#111110] text-[#F7F5EE]'
                      : 'text-[#6E6C65] hover:text-[#111110]'
                  }`}
                >
                  Saved Scenes ({scenes.length})
                </button>
                <button
                  onClick={() => setDrawerTab('characters')}
                  className={`py-2 px-3 text-xs font-semibold rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                    drawerTab === 'characters'
                      ? 'bg-[#111110] text-[#F7F5EE]'
                      : 'text-[#6E6C65] hover:text-[#111110]'
                  }`}
                >
                  Saved Characters ({savedCharacters.length})
                </button>
              </div>

              {/* TAB 1: SAVED SCENES */}
              {drawerTab === 'scenes' ? (
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-medium text-[#6E6C65]">
                      Select any scene to open its audio &amp; script
                    </span>
                    <button
                      onClick={() => handleStartNewScene()}
                      className="text-xs font-semibold text-[#111110] hover:underline flex items-center gap-1 cursor-pointer"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      <span>New Scene</span>
                    </button>
                  </div>

                  <div className="space-y-2">
                    {scenes.map((scene, idx) => {
                      const isCurrent =
                        viewMode === 'studio' && scene.id === activeScene.id;
                      const castLabel = scene.cast.map((c) => c.name).join(', ');
                      return (
                        <div
                          key={scene.id}
                          onClick={() => handleSelectSavedScene(scene.id)}
                          className={`p-4 rounded-xl border transition-colors cursor-pointer flex items-start justify-between gap-3 ${
                            isCurrent
                              ? 'bg-[#111110] text-[#F7F5EE] border-[#111110]'
                              : 'bg-[#EFECE3] text-[#111110] border-[#111110]/15 hover:border-[#111110]/50'
                          }`}
                        >
                          <div className="min-w-0 space-y-1">
                            <div className="font-semibold text-sm truncate">
                              {scene.title || `Scene 0${scenes.length - idx}`}
                            </div>
                            <div
                              className={`text-xs truncate ${
                                isCurrent ? 'text-[#F7F5EE]/75' : 'text-[#6E6C65]'
                              }`}
                            >
                              {scene.talkingMode === 'single'
                                ? 'Single Speaker'
                                : scene.talkingMode === 'multi'
                                ? 'Multi-Speaker'
                                : 'Dual Speaker'}{' '}
                              · {castLabel}
                            </div>
                            <div
                              className={`text-[11px] font-mono-num ${
                                isCurrent ? 'text-[#F7F5EE]/60' : 'text-[#6E6C65]'
                              }`}
                            >
                              {scene.turns.length}{' '}
                              {scene.turns.length === 1 ? 'audio take' : 'audio takes'} ·{' '}
                              {scene.updatedAt}
                            </div>
                          </div>

                          <button
                            onClick={(e) => handleDeleteScene(scene.id, e)}
                            title="Delete scene"
                            className={`p-1.5 rounded-md transition-colors shrink-0 cursor-pointer ${
                              isCurrent
                                ? 'text-[#F7F5EE]/60 hover:text-[#F7F5EE]'
                                : 'text-[#6E6C65] hover:text-[#111110]'
                            }`}
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ) : (
                /* TAB 2: SAVED CHARACTERS */
                <div className="space-y-3">
                  <p className="text-xs text-[#6E6C65] leading-relaxed">
                    Reusable character presets with their voice and emotional direction. Click{' '}
                    <strong>Use in Scene</strong> to add them to your active studio.
                  </p>

                  <div className="space-y-2.5">
                    {savedCharacters.map((preset) => (
                      <div
                        key={preset.id}
                        className="p-4 rounded-xl bg-[#EFECE3] border border-[#111110]/15 space-y-2.5"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <div>
                            <div className="font-semibold text-sm text-[#111110]">
                              {preset.name}
                            </div>
                            <div className="text-xs text-[#6E6C65]">
                              {preset.gender === 'male' ? 'Male' : 'Female'} · Voice:{' '}
                              <span className="font-medium text-[#111110]">
                                {preset.voiceId}
                              </span>
                            </div>
                          </div>

                          <div className="flex items-center gap-1.5">
                            <button
                              onClick={() => handleLoadSavedCharacterIntoScene(preset)}
                              className="px-3 py-1.5 text-xs font-semibold bg-[#111110] text-[#F7F5EE] rounded-lg hover:bg-[#2A2A28] transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                            >
                              Use in Scene
                            </button>
                            <button
                              onClick={() => handleDeleteSavedCharacter(preset.id)}
                              title="Remove preset"
                              className="p-1.5 text-[#6E6C65] hover:text-[#111110] cursor-pointer"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>

                        {preset.customEmotion && (
                          <div className="text-xs italic text-[#6E6C65] bg-[#F7F5EE] px-3 py-2 rounded-lg border border-[#111110]/10">
                            Emotion: “{preset.customEmotion}”
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <div className="pt-4 border-t border-[#111110]/15 flex items-center justify-between text-xs text-[#6E6C65]">
              <span>Rain sound Studio</span>
              <button
                onClick={() => setIsDrawerOpen(false)}
                className="font-semibold text-[#111110] hover:underline cursor-pointer"
              >
                Close Drawer
              </button>
            </div>
          </aside>
        </div>
      )}

      {/* Toast Notification */}
      {statusToast && (
        <div className="fixed bottom-5 right-5 z-40 px-4 py-3 rounded-xl bg-[#111110] text-[#F7F5EE] text-xs font-medium shadow-lg flex items-center gap-3">
          <span>{statusToast}</span>
        </div>
      )}

      {/* VIEW 1: MINIMALIST ZERO-STATE LANDING PAGE */}
      {viewMode === 'landing' ? (
        <main className="flex-1 flex flex-col items-center justify-center px-6 py-16 dot-surface">
          <div className="max-w-2xl w-full bg-[#F7F5EE] border border-[#111110]/20 rounded-2xl p-8 sm:p-12 shadow-xs text-center space-y-8">
            <div className="flex justify-center">
              <RainSoundLogo large />
            </div>

            <div className="space-y-3 max-w-lg mx-auto">
              <h1 className="text-2xl sm:text-4xl font-bold tracking-tight text-[#111110] text-balance">
                Direct expressive voice scenes, monologues &amp; stories.
              </h1>
              <p className="text-sm sm:text-base text-[#6E6C65] leading-relaxed">
                Choose Single, Dual, or Multi-character voice casting, define how each character speaks emotionally, and export studio-grade <strong>MP3</strong> and <strong>WAV</strong> audio up to 10 minutes long.
              </p>
            </div>

            {/* Mode Selection Before Starting New Scene */}
            <div className="space-y-2.5 max-w-md mx-auto">
              <span className="text-xs font-medium text-[#6E6C65] block">
                Select Conversation Format for Your New Scene
              </span>
              <div className="grid grid-cols-3 gap-2 p-1.5 bg-[#EFECE3] rounded-xl border border-[#111110]/15">
                <button
                  onClick={() => setLandingModeChoice('single')}
                  className={`py-2.5 px-3 rounded-lg text-xs font-semibold transition-colors flex flex-col items-center gap-1 cursor-pointer ${
                    landingModeChoice === 'single'
                      ? 'bg-[#111110] text-[#F7F5EE]'
                      : 'text-[#6E6C65] hover:text-[#111110]'
                  }`}
                >
                  <User className="w-4 h-4" />
                  <span>Single (1 Voice)</span>
                </button>
                <button
                  onClick={() => setLandingModeChoice('dual')}
                  className={`py-2.5 px-3 rounded-lg text-xs font-semibold transition-colors flex flex-col items-center gap-1 cursor-pointer ${
                    landingModeChoice === 'dual'
                      ? 'bg-[#111110] text-[#F7F5EE]'
                      : 'text-[#6E6C65] hover:text-[#111110]'
                  }`}
                >
                  <Users className="w-4 h-4" />
                  <span>Dual (Raf &amp; Rain)</span>
                </button>
                <button
                  onClick={() => setLandingModeChoice('multi')}
                  className={`py-2.5 px-3 rounded-lg text-xs font-semibold transition-colors flex flex-col items-center gap-1 cursor-pointer ${
                    landingModeChoice === 'multi'
                      ? 'bg-[#111110] text-[#F7F5EE]'
                      : 'text-[#6E6C65] hover:text-[#111110]'
                  }`}
                >
                  <Mic className="w-4 h-4" />
                  <span>Multi (3+ Voices)</span>
                </button>
              </div>
            </div>

            {/* Primary CTA: Start New Scene */}
            <div className="flex flex-col sm:flex-row items-center justify-center gap-3 pt-2">
              <button
                onClick={() => handleStartNewScene(landingModeChoice)}
                className="w-full sm:w-auto px-7 py-3.5 text-sm font-semibold text-[#F7F5EE] bg-[#111110] hover:bg-[#2A2A28] rounded-xl transition-colors flex items-center justify-center gap-2 cursor-pointer"
              >
                <Plus className="w-4 h-4" />
                <span>Start New Scene</span>
                <ArrowRight className="w-4 h-4" />
              </button>

              <button
                onClick={() => {
                  setDrawerTab('scenes');
                  setIsDrawerOpen(true);
                }}
                className="w-full sm:w-auto px-6 py-3.5 text-sm font-medium text-[#111110] bg-[#EFECE3] hover:bg-[#111110]/10 border border-[#111110]/20 rounded-xl transition-colors cursor-pointer"
              >
                Open Saved Scenes &amp; Characters
              </button>
            </div>
          </div>
        </main>
      ) : (
        /* VIEW 2: ACTIVE NEW SCENE STUDIO WORKSPACE */
        <main className="flex-1 max-w-5xl w-full mx-auto px-6 py-8 space-y-8">
          {/* Error Banner */}
          {errorMessage && (
            <div className="p-4 rounded-xl bg-[#EFECE3] border border-[#D92B2B] flex items-center justify-between gap-4 text-sm">
              <div className="flex items-center gap-2.5">
                <AlertCircle className="w-4 h-4 text-[#D92B2B] shrink-0" />
                <span>{errorMessage}</span>
              </div>
              <button
                onClick={() => setErrorMessage(null)}
                className="text-xs font-semibold underline cursor-pointer"
              >
                Dismiss
              </button>
            </div>
          )}

          {/* Browser Storage Full Warning Banner */}
          {storageWarning && (
            <div className="p-4 rounded-xl bg-[#EFECE3] border border-[#111110] flex items-center justify-between gap-4 text-xs sm:text-sm">
              <div className="flex items-center gap-2.5">
                <AlertCircle className="w-4 h-4 text-[#D92B2B] shrink-0" />
                <span>{storageWarning}</span>
              </div>
              <button
                onClick={() => setStorageWarning(null)}
                className="text-xs font-semibold underline shrink-0 cursor-pointer"
              >
                Dismiss
              </button>
            </div>
          )}

          {/* Studio Top Control Bar: Talking Mode Selector (Single | Dual | Multi) */}
          <section className="p-5 rounded-2xl bg-[#EFECE3] border border-[#111110]/15 flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
              <div className="text-xs font-medium text-[#6E6C65]">
                Active Scene Workspace · Supports Short Takes &amp; 2–10 Min Long-Form Audio
              </div>
              <h1 className="text-xl font-bold text-[#111110] mt-0.5">
                {activeScene.title}
              </h1>
            </div>

            {/* Single | Dual | Multi Mode Switcher */}
            <div className="flex flex-wrap items-center gap-2">
              <div className="flex items-center gap-1 p-1 bg-[#F7F5EE] rounded-xl border border-[#111110]/15">
                <button
                  onClick={() => handleChangeTalkingMode('single')}
                  className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                    talkingMode === 'single'
                      ? 'bg-[#111110] text-[#F7F5EE]'
                      : 'text-[#6E6C65] hover:text-[#111110]'
                  }`}
                >
                  Single (1 Voice)
                </button>
                <button
                  onClick={() => handleChangeTalkingMode('dual')}
                  className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                    talkingMode === 'dual'
                      ? 'bg-[#111110] text-[#F7F5EE]'
                      : 'text-[#6E6C65] hover:text-[#111110]'
                  }`}
                >
                  Dual (2 Voices)
                </button>
                <button
                  onClick={() => handleChangeTalkingMode('multi')}
                  className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                    talkingMode === 'multi'
                      ? 'bg-[#111110] text-[#F7F5EE]'
                      : 'text-[#6E6C65] hover:text-[#111110]'
                  }`}
                >
                  Multi (3+ Voices)
                </button>
              </div>

              {talkingMode !== 'single' && (
                <button
                  onClick={handleAddCharacter}
                  className="px-3.5 py-2 text-xs font-semibold text-[#111110] bg-[#F7F5EE] hover:bg-[#111110] hover:text-[#F7F5EE] border border-[#111110]/20 rounded-xl transition-colors flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer"
                >
                  <UserPlus className="w-3.5 h-3.5" />
                  <span>+ Add Character</span>
                </button>
              )}
            </div>
          </section>

          {/* Character Cards with Male/Female Voice Samples + Blank Emotional Direction Input */}
          <section className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              {cast.map((member, index) => {
                const genderVoices = VOICE_CHARACTERS.filter(
                  (v) => v.gender === member.gender
                );
                const selectedVoiceMeta =
                  VOICE_CHARACTERS.find((v) => v.id === member.voiceId) ||
                  genderVoices[0];
                const isAuditioning =
                  auditioningKey === `${member.id}-${member.voiceId}`;

                return (
                  <div
                    key={member.id}
                    className="p-5 rounded-2xl bg-[#EFECE3] border border-[#111110]/15 space-y-4"
                  >
                    {/* Header: Character Name + Male/Female Switch + Save Preset */}
                    <div className="flex items-start justify-between gap-3 border-b border-[#111110]/10 pb-3">
                      <div className="flex-1 min-w-0">
                        <span className="text-[11px] font-medium uppercase tracking-wider text-[#6E6C65] block">
                          Character 0{index + 1}
                        </span>
                        <input
                          type="text"
                          value={member.name}
                          onChange={(e) =>
                            handleUpdateCharacter(member.id, { name: e.target.value })
                          }
                          placeholder={`Character ${index + 1} Name`}
                          className="text-lg font-bold text-[#111110] bg-transparent border-b border-transparent focus:border-[#111110] focus:outline-none w-full mt-0.5"
                        />
                      </div>

                      <div className="flex items-center gap-1.5 shrink-0">
                        <div className="flex p-0.5 bg-[#F7F5EE] rounded-lg border border-[#111110]/15">
                          <button
                            onClick={() =>
                              handleUpdateCharacter(member.id, { gender: 'male' })
                            }
                            className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                              member.gender === 'male'
                                ? 'bg-[#111110] text-[#F7F5EE]'
                                : 'text-[#6E6C65] hover:text-[#111110]'
                            }`}
                          >
                            Male
                          </button>
                          <button
                            onClick={() =>
                              handleUpdateCharacter(member.id, { gender: 'female' })
                            }
                            className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                              member.gender === 'female'
                                ? 'bg-[#111110] text-[#F7F5EE]'
                                : 'text-[#6E6C65] hover:text-[#111110]'
                            }`}
                          >
                            Female
                          </button>
                        </div>

                        <button
                          onClick={() => handleSaveCharacterToLibrary(member)}
                          title="Save character to sidebar library"
                          className="p-1.5 text-[#6E6C65] hover:text-[#111110] rounded-lg hover:bg-[#F7F5EE] transition-colors cursor-pointer"
                        >
                          <Bookmark className="w-4 h-4" />
                        </button>

                        {cast.length > 1 && (
                          <button
                            onClick={() => handleRemoveCharacter(member.id)}
                            title="Remove character from scene"
                            className="p-1.5 text-[#6E6C65] hover:text-[#D92B2B] rounded-lg hover:bg-[#F7F5EE] transition-colors cursor-pointer"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                    </div>

                    {/* Voice Character Picker + Preview Button */}
                    <div className="space-y-2.5">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-medium text-[#6E6C65]">
                          {member.gender === 'male'
                            ? 'Gemini Male Voices'
                            : 'Gemini Female Voices'}{' '}
                          ·{' '}
                          <span className="text-[#111110] font-semibold">
                            {selectedVoiceMeta.geminiVoiceName}
                          </span>
                        </span>

                        <button
                          onClick={() => handleAuditionVoice(member)}
                          disabled={isAuditioning}
                          className="px-3 py-1 text-xs font-semibold bg-[#F7F5EE] hover:bg-[#111110] hover:text-[#F7F5EE] border border-[#111110]/20 rounded-lg transition-colors flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer"
                        >
                          {isAuditioning ? (
                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          ) : (
                            <Volume2 className="w-3.5 h-3.5" />
                          )}
                          <span>Hear Sample</span>
                        </button>
                      </div>

                      <div className="grid grid-cols-5 gap-1.5">
                        {genderVoices.map((v) => {
                          const active = member.voiceId === v.id;
                          return (
                            <button
                              key={v.id}
                              onClick={() =>
                                handleUpdateCharacter(member.id, { voiceId: v.id })
                              }
                              className={`py-2 px-2 text-xs font-medium rounded-lg border transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                                active
                                  ? 'bg-[#111110] text-[#F7F5EE] border-[#111110]'
                                  : 'bg-[#F7F5EE] text-[#111110] border-[#111110]/15 hover:border-[#111110]/50'
                              }`}
                            >
                              {v.name}
                            </button>
                          );
                        })}
                      </div>

                      <p className="text-xs text-[#6E6C65]">
                        {selectedVoiceMeta.tag} — {selectedVoiceMeta.description}
                      </p>
                    </div>

                    {/* Blank Emotional Direction Input Under Each Character */}
                    <div className="pt-2 border-t border-[#111110]/10 space-y-1.5">
                      <label className="block text-xs font-semibold text-[#111110]">
                        How should {member.name || 'this character'} talk emotionally?
                      </label>
                      <input
                        type="text"
                        value={member.customEmotion}
                        onChange={(e) =>
                          handleUpdateCharacter(member.id, {
                            customEmotion: e.target.value,
                          })
                        }
                        placeholder="Write emotional tone (e.g. calm & melancholic, breathless whisper, warm & excited)..."
                        className="w-full px-3 py-2 text-xs rounded-lg bg-[#F7F5EE] border border-[#111110]/20 text-[#111110] placeholder:text-[#6E6C65]/70 focus:outline-none focus:border-[#111110]"
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </section>

          {/* Generated Audio Master Takes (Hear Before Download +WAV/+MP3 + Script + Re-Prompting) */}
          {turns.length > 0 && (
            <section className="space-y-6">
              {turns.map((turn, idx) => {
                const isThisTurnPlaying = playingTurnId === turn.id && isPlaying;
                const isThisTurnActive = playingTurnId === turn.id;
                const isEditing = editingTurnId === turn.id;

                return (
                  <div
                    key={turn.id}
                    className="p-6 rounded-2xl bg-[#EFECE3] border border-[#111110]/20 space-y-6"
                  >
                    {/* Top Row: Scene Title + Pre-Download MP3 & WAV Export Buttons */}
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-[#111110]/15 pb-4">
                      <div>
                        <div className="text-xs font-medium text-[#6E6C65]">
                          Take 0{idx + 1} ·{' '}
                          {turn.castSnapshot
                            .map((c) => `${c.name} (${c.voiceId})`)
                            .join(' · ')}{' '}
                          · {formatTime(turn.durationSeconds)} ·{' '}
                          {formatBytes(turn.fileSizeBytes)}
                        </div>
                        <h2 className="text-xl font-bold text-[#111110] mt-0.5">
                          {turn.sceneTitle}
                        </h2>
                        <p className="text-xs text-[#6E6C65] mt-0.5">
                          {turn.environmentNote}
                        </p>
                      </div>

                      <div className="flex flex-wrap items-center gap-2 shrink-0">
                        <button
                          onClick={() => handleDownload(turn, 'mp3')}
                          disabled={!turn.mp3Base64}
                          className="px-4 py-2.5 text-xs font-semibold bg-[#111110] text-[#F7F5EE] hover:bg-[#2A2A28] disabled:opacity-40 rounded-xl transition-colors flex items-center gap-2 whitespace-nowrap shrink-0 cursor-pointer"
                        >
                          <Download className="w-4 h-4" />
                          <span>Download MP3</span>
                        </button>
                        <button
                          onClick={() => handleDownload(turn, 'wav')}
                          disabled={!turn.wavBase64 && !turn.mp3Base64}
                          className="px-4 py-2.5 text-xs font-semibold bg-[#F7F5EE] text-[#111110] border border-[#111110]/25 hover:bg-[#111110] hover:text-[#F7F5EE] disabled:opacity-40 rounded-xl transition-colors flex items-center gap-2 whitespace-nowrap shrink-0 cursor-pointer"
                        >
                          <Download className="w-4 h-4" />
                          <span>Download WAV</span>
                        </button>
                        <button
                          onClick={() => handleStartNewScene(talkingMode)}
                          className="px-4 py-2.5 text-xs font-semibold bg-[#F7F5EE] text-[#111110] border border-[#111110]/25 hover:bg-[#111110] hover:text-[#F7F5EE] rounded-xl transition-colors flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer"
                        >
                          <Plus className="w-3.5 h-3.5" />
                          <span>Start New Scene</span>
                        </button>
                      </div>
                    </div>

                    {/* 1. Pre-Download Audio Player with Waveform Scrubber & Speed Control */}
                    <div className="p-4 rounded-xl bg-[#F7F5EE] border border-[#111110]/15 flex flex-col sm:flex-row items-center gap-4">
                      <button
                        onClick={() => handleTogglePlay(turn)}
                        aria-label={isThisTurnPlaying ? 'Pause audio' : 'Play audio'}
                        className="w-12 h-12 rounded-xl bg-[#111110] text-[#F7F5EE] hover:bg-[#2A2A28] flex items-center justify-center shrink-0 transition-colors cursor-pointer"
                      >
                        {isThisTurnPlaying ? (
                          <Pause className="w-5 h-5 fill-current" />
                        ) : (
                          <Play className="w-5 h-5 fill-current ml-0.5" />
                        )}
                      </button>

                      <div className="flex-1 w-full space-y-2">
                        <div
                          className="h-12 w-full flex items-end gap-[3px] cursor-pointer py-1"
                          onClick={(e) => {
                            const rect = e.currentTarget.getBoundingClientRect();
                            const ratio = (e.clientX - rect.left) / rect.width;
                            handleSeek(turn, ratio);
                          }}
                        >
                          {turn.peaks.map((peak, barIdx) => {
                            const progressRatio =
                              isThisTurnActive && duration > 0
                                ? currentTime / duration
                                : 0;
                            const barRatio = barIdx / turn.peaks.length;
                            const isPlayed = isThisTurnActive && barRatio <= progressRatio;
                            return (
                              <div
                                key={barIdx}
                                className="flex-1 flex flex-col justify-end h-full"
                              >
                                <div
                                  className={`w-full rounded-full transition-colors ${
                                    isPlayed
                                      ? 'bg-[#D92B2B]'
                                      : 'bg-[#111110]/75 hover:bg-[#111110]'
                                  }`}
                                  style={{
                                    height: `${Math.max(14, Math.round(peak * 100))}%`,
                                  }}
                                />
                              </div>
                            );
                          })}
                        </div>

                        <div className="flex items-center justify-between text-xs font-mono-num text-[#6E6C65]">
                          <span>
                            {isThisTurnActive ? formatTime(currentTime) : '00:00'}
                          </span>
                          <span>{formatTime(turn.durationSeconds)}</span>
                        </div>
                      </div>

                      {/* Speed Selector */}
                      <div className="flex items-center gap-1 bg-[#EFECE3] p-1 rounded-lg border border-[#111110]/10 shrink-0">
                        {[0.85, 1, 1.15, 1.25].map((rate) => (
                          <button
                            key={rate}
                            onClick={() => setPlaybackRate(rate)}
                            className={`px-2 py-1 text-[11px] font-mono-num rounded-md transition-colors cursor-pointer ${
                              playbackRate === rate
                                ? 'bg-[#111110] text-[#F7F5EE] font-semibold'
                                : 'text-[#6E6C65] hover:text-[#111110]'
                            }`}
                          >
                            {rate}x
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* 2. Spoken Script Viewer & Inline Editor */}
                    <div className="space-y-3">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-semibold text-[#6E6C65]">
                          Spoken Script ({turn.lines.length}{' '}
                          {turn.lines.length === 1 ? 'segment' : 'segments'})
                        </span>

                        {!isEditing ? (
                          <button
                            onClick={() => {
                              setEditingTurnId(turn.id);
                              setEditedLines(turn.lines.map((l) => ({ ...l })));
                            }}
                            className="text-xs font-semibold text-[#111110] hover:underline flex items-center gap-1 cursor-pointer"
                          >
                            <Edit3 className="w-3.5 h-3.5" />
                            <span>Edit Script &amp; Emotions Directly</span>
                          </button>
                        ) : (
                          <div className="flex items-center gap-2">
                            <button
                              onClick={() => setEditingTurnId(null)}
                              className="px-3 py-1 text-xs font-medium border border-[#111110]/25 rounded-lg cursor-pointer"
                            >
                              Cancel
                            </button>
                            <button
                              onClick={() => handleSaveEditedLinesAndResynthesize(turn)}
                              disabled={resynthesizingTurnId === turn.id}
                              className="px-3.5 py-1 text-xs font-semibold bg-[#111110] text-[#F7F5EE] rounded-lg flex items-center gap-1.5 cursor-pointer"
                            >
                              {resynthesizingTurnId === turn.id ? (
                                <Loader2 className="w-3 h-3 animate-spin" />
                              ) : (
                                <Check className="w-3 h-3" />
                              )}
                              <span>Re-Render Audio</span>
                            </button>
                          </div>
                        )}
                      </div>

                      <div className="divide-y divide-[#111110]/10 border border-[#111110]/15 rounded-xl bg-[#F7F5EE] overflow-hidden">
                        {(isEditing ? editedLines : turn.lines).map((line, lIdx) => (
                          <div key={line.id || lIdx} className="p-4 space-y-2">
                            <div className="flex flex-wrap items-center justify-between gap-2">
                              <span className="text-xs font-bold text-[#111110]">
                                {line.speaker}{' '}
                                <span className="font-normal text-[#6E6C65]">
                                  ({line.voiceId})
                                </span>
                              </span>

                              {isEditing ? (
                                <input
                                  type="text"
                                  value={line.emotion}
                                  onChange={(e) => {
                                    const val = e.target.value;
                                    setEditedLines((prev) =>
                                      prev.map((item, i) =>
                                        i === lIdx ? { ...item, emotion: val } : item
                                      )
                                    );
                                  }}
                                  placeholder="Emotional delivery..."
                                  className="px-2.5 py-1 bg-[#EFECE3] border border-[#111110]/20 rounded-md text-xs text-[#111110] w-64 focus:outline-none"
                                />
                              ) : (
                                <span className="text-xs italic text-[#6E6C65]">
                                  {line.emotion}
                                </span>
                              )}
                            </div>

                            {isEditing ? (
                              <textarea
                                value={line.rawTextWithTags ?? line.text}
                                onChange={(e) => {
                                  const val = e.target.value;
                                  setEditedLines((prev) =>
                                    prev.map((item, i) =>
                                      i === lIdx
                                        ? { ...item, text: val, rawTextWithTags: val }
                                        : item
                                    )
                                  );
                                }}
                                rows={2}
                                className="w-full p-2.5 bg-[#EFECE3] border border-[#111110]/20 rounded-lg text-sm focus:outline-none"
                              />
                            ) : (
                              <p className="text-sm sm:text-base text-[#111110] leading-relaxed">
                                “{renderScriptTextWithCues(line.rawTextWithTags || line.text)}”
                              </p>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                );
              })}
            </section>
          )}
          <div ref={feedBottomRef} />

          {/* Environment, Theme & Script Prompt / Re-Prompt Box */}
          <section
            id="prompt-studio"
            className="p-6 rounded-2xl bg-[#EFECE3] border border-[#111110]/20 space-y-4"
          >
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div>
                <label
                  htmlFor="scene-prompt-input"
                  className="text-sm font-bold text-[#111110] block"
                >
                  {turns.length === 0
                    ? 'Environment, Theme & Script Box'
                    : 'Re-Prompt & Fix Audio (or Add Next Scene Part)'}
                </label>
                <p className="text-xs text-[#6E6C65]">
                  {turns.length === 0
                    ? 'Describe the situation, environment, and emotions, or paste a full 2–10 minute script. Use <breath> or <laugh> tags anywhere.'
                    : 'Listened to the audio above? Tell me what to adjust in emotion, pacing, or dialogue and I will deliver a fixed take.'}
                </p>
              </div>

              <button
                onClick={handleGenerateAiPrompt}
                disabled={isGeneratingPromptIdea || isGeneratingTurn}
                className="px-3.5 py-1.5 text-xs font-semibold bg-[#F7F5EE] hover:bg-[#111110] hover:text-[#F7F5EE] border border-[#111110]/20 rounded-xl transition-colors flex items-center gap-1.5 self-start sm:self-auto whitespace-nowrap shrink-0 cursor-pointer"
              >
                {isGeneratingPromptIdea ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Sparkles className="w-3.5 h-3.5" />
                )}
                <span>Draft AI Scene Prompt</span>
              </button>
            </div>

            {/* Inline Expression Cues Bar (<breath>, <sigh>, <laugh>, <gasp>, <whisper>) */}
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-xs text-[#6E6C65] mr-1">
                Insert emotion cue:
              </span>
              {EXPRESSION_TAGS.map((item) => (
                <button
                  key={item.tag}
                  type="button"
                  onClick={() => handleInsertExpressionTag(item.tag)}
                  title={item.hint}
                  className="px-2.5 py-1 text-xs font-mono-num bg-[#F7F5EE] hover:bg-[#111110] hover:text-[#F7F5EE] border border-[#111110]/15 rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                >
                  {item.label}
                </button>
              ))}
            </div>

            <textarea
              ref={promptInputRef}
              id="scene-prompt-input"
              value={promptInput}
              onChange={(e) => setPromptInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                  e.preventDefault();
                  handleSubmitPrompt();
                }
              }}
              rows={5}
              placeholder={
                turns.length === 0
                  ? `Describe the environment, theme, and situation for ${cast
                      .map((c) => c.name)
                      .join(' & ')}, or paste a script of any length (up to 10 minutes).\nExample: Rain taps on the window. ${
                      cast[0]?.name || 'Raf'
                    } <breath> speaks softly about the letter he found...`
                  : 'Describe what to fix or change in the audio (e.g. "Make Rain sound warmer and slower in line 2, and add a <sigh> before Raf replies")...'
              }
              className="w-full p-4 rounded-xl bg-[#F7F5EE] border border-[#111110]/20 text-sm text-[#111110] placeholder:text-[#6E6C65]/70 focus:outline-none focus:border-[#111110] leading-relaxed"
            />

            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="text-xs text-[#6E6C65] font-mono-num">
                {promptWordCount} words
                {promptWordCount > 0 && (
                  <span>
                    {' '}
                    · Est. script length:{' '}
                    {estMinutes > 0 ? `${estMinutes}m ${estSeconds}s` : `${estSeconds}s`}
                  </span>
                )}
              </div>

              <button
                onClick={handleSubmitPrompt}
                disabled={isGeneratingTurn || !promptInput.trim()}
                className="px-6 py-3 text-xs font-semibold bg-[#111110] text-[#F7F5EE] hover:bg-[#2A2A28] disabled:opacity-40 rounded-xl transition-colors flex items-center justify-center gap-2 whitespace-nowrap shrink-0 cursor-pointer"
              >
                {isGeneratingTurn ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>{generationProgressText}</span>
                  </>
                ) : (
                  <>
                    <Send className="w-3.5 h-3.5" />
                    <span>
                      {turns.length === 0
                        ? 'Generate Audio (MP3 & WAV)'
                        : 'Re-Prompt & Update Audio'}
                    </span>
                  </>
                )}
              </button>
            </div>
          </section>
        </main>
      )}

      {/* Minimalist Footer */}
      <footer className="border-t border-[#111110]/15 py-4 px-6 text-xs text-[#6E6C65] flex items-center justify-between max-w-5xl w-full mx-auto">
        <span>Rain sound · Voice Production Studio</span>
        <span>Single, Dual &amp; Multi-Speaker · WAV &amp; MP3 Export</span>
      </footer>
    </div>
  );
}
