import express from 'express';
import { createServer as createViteServer } from 'vite';
import { GoogleGenAI, Modality, Type } from '@google/genai';
import ffmpegPath from 'ffmpeg-static';
import { spawn } from 'child_process';
import path from 'path';
import dotenv from 'dotenv';

dotenv.config();

const app = express();
const PORT = 3000;

app.use(express.json({ limit: '50mb' }));

function getGeminiClient() {
  return new GoogleGenAI({
    apiKey: process.env.GEMINI_API_KEY,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

type PrebuiltBaseVoice = 'Puck' | 'Charon' | 'Kore' | 'Fenrir' | 'Zephyr';

interface VoiceMappingSpec {
  gender: 'male' | 'female';
  primaryBase: PrebuiltBaseVoice;
  alternateBase: PrebuiltBaseVoice;
  personaPrompt: string;
}

const VOICE_CHARACTER_MAP: Record<string, VoiceMappingSpec> = {
  // MALE VOICES
  Akid: {
    gender: 'male',
    primaryBase: 'Charon',
    alternateBase: 'Fenrir',
    personaPrompt:
      'Grounded, resonant, natural male baritone voice with warm emotional depth and calm confidence',
  },
  Remy: {
    gender: 'male',
    primaryBase: 'Puck',
    alternateBase: 'Charon',
    personaPrompt:
      'Intimate, conversational, natural male tenor voice with close-mic warmth and expressive nuance',
  },
  Charon: {
    gender: 'male',
    primaryBase: 'Charon',
    alternateBase: 'Fenrir',
    personaPrompt:
      'Deep, measured, cinematic male baritone voice with rich gravitas and emotional weight',
  },
  Fenrir: {
    gender: 'male',
    primaryBase: 'Fenrir',
    alternateBase: 'Charon',
    personaPrompt:
      'Bold, intense, commanding lower-register male voice with raw dramatic presence',
  },
  Puck: {
    gender: 'male',
    primaryBase: 'Puck',
    alternateBase: 'Charon',
    personaPrompt:
      'Bright, energetic, expressive male tenor voice with lively natural inflection',
  },

  // FEMALE VOICES
  Zephyr: {
    gender: 'female',
    primaryBase: 'Zephyr',
    alternateBase: 'Kore',
    personaPrompt:
      'Smooth, airy, gentle female voice with effortless natural pacing and emotional warmth',
  },
  Fola: {
    gender: 'female',
    primaryBase: 'Kore',
    alternateBase: 'Zephyr',
    personaPrompt:
      'Warm, soulful, deeply expressive female storytelling voice with rich emotional resonance',
  },
  Kore: {
    gender: 'female',
    primaryBase: 'Kore',
    alternateBase: 'Zephyr',
    personaPrompt:
      'Poised, clear, articulate female mezzo voice with natural studio warmth',
  },
  Aria: {
    gender: 'female',
    primaryBase: 'Zephyr',
    alternateBase: 'Kore',
    personaPrompt:
      'Soft, intimate, delicate close-mic female voice with gentle breath and tender emotion',
  },
  Sora: {
    gender: 'female',
    primaryBase: 'Kore',
    alternateBase: 'Zephyr',
    personaPrompt:
      'Bright, lively, expressive female voice with warm, vibrant energy',
  },
};

const auditionMp3Cache = new Map<string, string>();

// Circuit-breaker memory so quota-exhausted unary TTS models are skipped immediately (0ms)
const ttsModelCooldownUntil = new Map<string, number>();

function isModelAvailable(modelName: string): boolean {
  const until = ttsModelCooldownUntil.get(modelName);
  if (!until) return true;
  if (Date.now() >= until) {
    ttsModelCooldownUntil.delete(modelName);
    return true;
  }
  return false;
}

function recordModelQuotaError(modelName: string, err: any) {
  const status = err?.status || err?.code;
  const msg = String(err?.message || '');
  if (status === 429 || msg.includes('429') || msg.includes('RESOURCE_EXHAUSTED')) {
    // Cooldown for 10 minutes on 429 quota exhaustion
    ttsModelCooldownUntil.set(modelName, Date.now() + 10 * 60 * 1000);
  }
}

function getVoiceSpec(
  voiceId?: string,
  fallbackGender: 'male' | 'female' = 'male'
): VoiceMappingSpec {
  if (voiceId && VOICE_CHARACTER_MAP[voiceId]) {
    return VOICE_CHARACTER_MAP[voiceId];
  }
  return fallbackGender === 'female'
    ? VOICE_CHARACTER_MAP.Zephyr
    : VOICE_CHARACTER_MAP.Akid;
}

/**
 * Parses inline <breath>, <laugh>, <gasp>, <sigh>, <whisper>, |yeah|, |mhm| cues from the script
 * so the voice engine understands the exact emotional/breathing situation without ever speaking
 * "less than" or "greater than" aloud.
 */
function sanitizeSpokenTextAndExtractCues(
  rawText: string,
  rawEmotion: string,
  characterCustomEmotion?: string
): {
  cleanText: string;
  flashTtsText: string;
  rawTextWithTags: string;
  enhancedEmotion: string;
} {
  const extractedCues: string[] = [];
  const rawTextWithTags = (rawText || '').trim();
  let text = rawTextWithTags;
  let flashTtsText = rawTextWithTags;

  // For flashTtsText, keep only official Gemini 3.8 Flash TTS vocal tags (<breath>, <laugh>, <gasp>, |yeah|, |mhm|)
  // and convert any other <...> tags (like <sigh>, <whisper>) into natural ellipses so '<' is never spoken.
  flashTtsText = flashTtsText.replace(/<\s*([^>]+)\s*>/g, (_m, inner) => {
    const cue = String(inner).trim().toLowerCase();
    if (cue === 'breath' || cue === 'laugh' || cue === 'gasp') {
      return `<${cue}>`;
    }
    return ' ... ';
  });

  // Extract all <...> situational & emotional cues for cleanText and enhancedEmotion
  text = text.replace(/<\s*([^>]+)\s*>/g, (_match, inner) => {
    const cue = String(inner).trim().toLowerCase();
    if (cue === 'breath' || cue === 'breathe') {
      extractedCues.push('taking an audible natural breath pause');
    } else if (cue === 'sigh' || cue === 'sighs') {
      extractedCues.push('letting out a soft emotional sigh');
    } else if (cue === 'laugh' || cue === 'chuckle' || cue === 'laughs') {
      extractedCues.push('with a genuine natural laugh/chuckle');
    } else if (cue === 'gasp' || cue === 'gasps') {
      extractedCues.push('with a sudden emotional intake of breath');
    } else if (cue === 'whisper' || cue === 'whispering') {
      extractedCues.push('speaking in a hushed, intimate close-mic whisper');
    } else if (cue === 'pause' || cue === 'beat') {
      extractedCues.push('with a thoughtful dramatic pause');
    } else {
      extractedCues.push(`expressing "${cue}"`);
    }
    return ' ... ';
  });

  // Extract [...] stage directions
  text = text.replace(/\[\s*([^\]]+)\s*\]/g, (_match, inner) => {
    extractedCues.push(String(inner).trim());
    return ' ';
  });
  flashTtsText = flashTtsText.replace(/\[\s*([^\]]+)\s*\]/g, ' ');

  // Convert |yeah| or |mhm| into natural spoken words for cleanText
  text = text.replace(/\|\s*([^|]+)\s*\|/g, (_match, inner) => {
    return `${String(inner).trim()}, `;
  });

  // Strip any stray <, >, | symbols from cleanText
  text = text.replace(/[<>|]/g, '').replace(/\s+/g, ' ').trim();
  flashTtsText = flashTtsText.replace(/\s+/g, ' ').trim();

  const enhancedEmotion = [
    characterCustomEmotion?.trim(),
    rawEmotion?.trim(),
    ...extractedCues,
  ]
    .filter(Boolean)
    .join(', ');

  return {
    cleanText: text || 'Hello.',
    flashTtsText: flashTtsText || text || 'Hello.',
    rawTextWithTags,
    enhancedEmotion:
      enhancedEmotion || 'Natural, emotionally expressive human delivery',
  };
}

function splitLongTextIntoBreathSegments(text: string, maxChars = 380): string[] {
  const trimmed = text.trim();
  if (trimmed.length <= maxChars) return [trimmed];

  const sentences = trimmed.match(/[^.!?]+[.!?]+|\s*[^.!?]+$/g) || [trimmed];
  const segments: string[] = [];
  let current = '';

  for (const s of sentences) {
    const piece = s.trim();
    if (!piece) continue;
    if ((current + ' ' + piece).trim().length > maxChars && current.length > 0) {
      segments.push(current.trim());
      current = piece;
    } else {
      current = current ? `${current} ${piece}` : piece;
    }
  }
  if (current.trim()) {
    segments.push(current.trim());
  }
  return segments.length > 0 ? segments : [trimmed];
}

function extractPcmFromWav(buf: Buffer): Buffer {
  if (buf.length < 44) return buf;
  const riff = buf.subarray(0, 4).toString('ascii');
  const wave = buf.subarray(8, 12).toString('ascii');
  if (riff !== 'RIFF' || wave !== 'WAVE') {
    return buf;
  }

  let offset = 12;
  while (offset + 8 <= buf.length) {
    const chunkId = buf.subarray(offset, offset + 4).toString('ascii');
    const chunkSize = buf.readUInt32LE(offset + 4);
    if (chunkId === 'data') {
      const dataStart = offset + 8;
      const dataEnd = Math.min(dataStart + chunkSize, buf.length);
      return buf.subarray(dataStart, dataEnd);
    }
    offset += 8 + chunkSize + (chunkSize % 2);
  }

  return buf.subarray(44);
}

function buildWavFromPcm(pcmBuffer: Buffer, sampleRate = 24000): Buffer {
  const numChannels = 1;
  const bitsPerSample = 16;
  const byteRate = (sampleRate * numChannels * bitsPerSample) / 8;
  const blockAlign = (numChannels * bitsPerSample) / 8;
  const dataSize = pcmBuffer.length;
  const header = Buffer.alloc(44);

  header.write('RIFF', 0);
  header.writeUInt32LE(36 + dataSize, 4);
  header.write('WAVE', 8);
  header.write('fmt ', 12);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(numChannels, 22);
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(byteRate, 28);
  header.writeUInt16LE(blockAlign, 32);
  header.writeUInt16LE(bitsPerSample, 34);
  header.write('data', 36);
  header.writeUInt32LE(dataSize, 40);

  return Buffer.concat([header, pcmBuffer]);
}

function computeWaveformPeaks(pcmBuffer: Buffer, numBars = 64): number[] {
  const totalSamples = Math.floor(pcmBuffer.length / 2);
  if (totalSamples === 0) {
    return Array(numBars).fill(0.15);
  }
  const samplesPerBar = Math.max(1, Math.floor(totalSamples / numBars));
  const rawPeaks: number[] = [];

  for (let i = 0; i < numBars; i++) {
    const startSample = i * samplesPerBar;
    const endSample = Math.min(totalSamples, startSample + samplesPerBar);
    let sumSq = 0;
    let count = 0;
    for (
      let s = startSample;
      s < endSample;
      s += Math.max(1, Math.floor(samplesPerBar / 64))
    ) {
      const byteIdx = s * 2;
      if (byteIdx + 1 < pcmBuffer.length) {
        const sample = pcmBuffer.readInt16LE(byteIdx) / 32768;
        sumSq += sample * sample;
        count++;
      }
    }
    const rms = count > 0 ? Math.sqrt(sumSq / count) : 0;
    rawPeaks.push(rms);
  }

  const maxPeak = Math.max(...rawPeaks, 0.01);
  return rawPeaks.map((p) => {
    const normalized = p / maxPeak;
    return Number(
      Math.max(0.12, Math.min(1, Math.pow(normalized, 0.75))).toFixed(3)
    );
  });
}

function encodeWavToMp3(wavBuffer: Buffer): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    if (!ffmpegPath) {
      return reject(new Error('FFmpeg binary not available for MP3 encoding.'));
    }

    const ffmpeg = spawn(ffmpegPath, [
      '-y',
      '-f',
      'wav',
      '-i',
      'pipe:0',
      '-codec:a',
      'libmp3lame',
      '-b:a',
      '192k',
      '-ar',
      '24000',
      '-ac',
      '1',
      '-f',
      'mp3',
      'pipe:1',
    ]);

    const stdoutChunks: Buffer[] = [];
    const stderrChunks: Buffer[] = [];

    ffmpeg.stdout.on('data', (chunk: Buffer) => stdoutChunks.push(chunk));
    ffmpeg.stderr.on('data', (chunk: Buffer) => stderrChunks.push(chunk));
    ffmpeg.on('error', (err) => reject(err));
    ffmpeg.on('close', (code) => {
      if (code === 0 && stdoutChunks.length > 0) {
        resolve(Buffer.concat(stdoutChunks));
      } else {
        const errMsg = Buffer.concat(stderrChunks).toString('utf8');
        reject(new Error(`FFmpeg MP3 encoding failed (code ${code}): ${errMsg}`));
      }
    });

    ffmpeg.stdin.write(wavBuffer);
    ffmpeg.stdin.end();
  });
}

interface SynthLineItem {
  speaker: string;
  voiceId: string;
  emotion: string;
  text: string;
  flashTtsText?: string;
  rawTextWithTags?: string;
}

/**
 * Reused Single-Connection WebSocket Pool for Gemini Live Native Audio.
 * Instead of opening a new WebSocket for every line (which triggers WebSocket resets/errors),
 * this pool maintains at most ONE WebSocket per base voice (`Charon`, `Zephyr`, etc.)
 * and streams turns sequentially over that connection.
 */
class LiveVoiceSessionPool {
  private ai: GoogleGenAI;
  private sessions = new Map<
    string,
    {
      session: any;
      isClosed: boolean;
      currentChunks: Buffer[];
      resolveTurn: ((buf: Buffer) => void) | null;
      rejectTurn: ((err: any) => void) | null;
      idleTimer: ReturnType<typeof setTimeout> | null;
      hardTimer: ReturnType<typeof setTimeout> | null;
    }
  >();

  constructor(ai: GoogleGenAI) {
    this.ai = ai;
  }

  private async getOrCreateVoiceSession(
    voiceName: PrebuiltBaseVoice,
    personaPrompt: string,
    liveModel: string
  ) {
    const key = `${liveModel}::${voiceName}`;
    const existing = this.sessions.get(key);
    if (existing && !existing.isClosed) {
      return existing;
    }

    const state = {
      session: null as any,
      isClosed: false,
      currentChunks: [] as Buffer[],
      resolveTurn: null as ((buf: Buffer) => void) | null,
      rejectTurn: null as ((err: any) => void) | null,
      idleTimer: null as ReturnType<typeof setTimeout> | null,
      hardTimer: null as ReturnType<typeof setTimeout> | null,
    };

    const completeCurrentTurn = () => {
      if (state.idleTimer) {
        clearTimeout(state.idleTimer);
        state.idleTimer = null;
      }
      if (state.hardTimer) {
        clearTimeout(state.hardTimer);
        state.hardTimer = null;
      }
      if (state.resolveTurn) {
        const fn = state.resolveTurn;
        state.resolveTurn = null;
        state.rejectTurn = null;
        const out = Buffer.concat(state.currentChunks);
        state.currentChunks = [];
        fn(out);
      }
    };

    const session = await this.ai.live.connect({
      model: liveModel,
      config: {
        responseModalities: [Modality.AUDIO],
        speechConfig: {
          voiceConfig: {
            prebuiltVoiceConfig: { voiceName },
          },
        },
        systemInstruction: {
          parts: [
            {
              text: `You are a professional studio voice actor.
Your vocal persona: ${personaPrompt}.
STRICT RULES:
1. Perform ONLY the exact words inside the quotation marks with the requested emotional tone and natural human breathing.
2. Never add conversational replies, introductions, or commentary.
3. Read the quoted line verbatim as the character.`,
            },
          ],
        },
      },
      callbacks: {
        onmessage: (msg: any) => {
          const parts = msg.serverContent?.modelTurn?.parts || [];
          for (const p of parts) {
            if (p.inlineData?.data) {
              state.currentChunks.push(Buffer.from(p.inlineData.data, 'base64'));
              if (state.idleTimer) clearTimeout(state.idleTimer);
              state.idleTimer = setTimeout(() => {
                completeCurrentTurn();
              }, 900);
            }
          }
          if (msg.serverContent?.turnComplete) {
            completeCurrentTurn();
          }
        },
        onerror: (err: any) => {
          state.isClosed = true;
          if (state.currentChunks.length > 0) {
            completeCurrentTurn();
          } else if (state.rejectTurn) {
            const rj = state.rejectTurn;
            state.resolveTurn = null;
            state.rejectTurn = null;
            rj(new Error(err?.message || 'Live audio stream interrupted'));
          }
        },
        onclose: () => {
          state.isClosed = true;
          if (state.currentChunks.length > 0) {
            completeCurrentTurn();
          } else if (state.rejectTurn) {
            const rj = state.rejectTurn;
            state.resolveTurn = null;
            state.rejectTurn = null;
            rj(new Error('Live audio connection closed early'));
          }
        },
      },
    });

    state.session = session;
    this.sessions.set(key, state);
    return state;
  }

  async synthesizeTurn(
    speaker: string,
    voiceName: PrebuiltBaseVoice,
    personaPrompt: string,
    cleanText: string,
    enhancedEmotion: string
  ): Promise<Buffer> {
    const liveModels = [
      'gemini-3.8-live',
      'gemini-2.5-flash-native-audio-preview-12-2025',
    ];

    for (const liveModel of liveModels) {
      for (let attempt = 1; attempt <= 2; attempt++) {
        try {
          const state = await this.getOrCreateVoiceSession(
            voiceName,
            personaPrompt,
            liveModel
          );

          const pcm = await new Promise<Buffer>((resolve, reject) => {
            state.currentChunks = [];
            state.resolveTurn = resolve;
            state.rejectTurn = reject;

            state.hardTimer = setTimeout(() => {
              if (state.currentChunks.length > 0) {
                const out = Buffer.concat(state.currentChunks);
                state.currentChunks = [];
                state.resolveTurn = null;
                state.rejectTurn = null;
                resolve(out);
              } else {
                state.isClosed = true;
                state.resolveTurn = null;
                state.rejectTurn = null;
                reject(new Error('Live audio turn timed out'));
              }
            }, 14000);

            state.session.sendClientContent({
              turns: [
                {
                  role: 'user',
                  parts: [
                    {
                      text: `As ${speaker}, speak verbatim with ${enhancedEmotion}:\n"${cleanText}"`,
                    },
                  ],
                },
              ],
              turnComplete: true,
            });
          });

          if (pcm.length > 0) {
            return pcm;
          }
        } catch (err: any) {
          console.warn(
            `LiveVoiceSessionPool (${liveModel}, attempt ${attempt}) notice:`,
            err?.message
          );
          const key = `${liveModel}::${voiceName}`;
          const broken = this.sessions.get(key);
          if (broken) {
            broken.isClosed = true;
            try {
              broken.session?.close();
            } catch {
              // Ignore
            }
            this.sessions.delete(key);
          }
        }
      }
    }

    throw new Error(
      `Audio synthesis temporarily busy for "${speaker}". Please click Generate again.`
    );
  }

  closeAll() {
    for (const state of this.sessions.values()) {
      state.isClosed = true;
      if (state.idleTimer) clearTimeout(state.idleTimer);
      if (state.hardTimer) clearTimeout(state.hardTimer);
      try {
        state.session?.close();
      } catch {
        // Ignore close errors
      }
    }
    this.sessions.clear();
  }
}

/**
 * Synthesizes a single spoken segment using:
 * 1. Available Unary Gemini TTS models (`gemini-3.8-flash-tts`, `gemini-3.8-flash-lite-tts`, `gemini-2.5-flash-preview-tts`)
 * 2. Reused Single-Connection WebSocket Pool (`LiveVoiceSessionPool`)
 */
async function synthesizeSegmentResilient(
  ai: GoogleGenAI,
  livePool: LiveVoiceSessionPool,
  speaker: string,
  voiceId: string,
  cleanText: string,
  flashTtsText: string,
  enhancedEmotion: string,
  baseVoiceOverride?: PrebuiltBaseVoice
): Promise<Buffer> {
  const spec = getVoiceSpec(voiceId);
  const voiceName = baseVoiceOverride || spec.primaryBase;
  const fullStyle = [spec.personaPrompt, enhancedEmotion].filter(Boolean).join('. ');

  const ttsModels: (
    | 'gemini-3.8-flash-tts'
    | 'gemini-3.8-flash-lite-tts'
    | 'gemini-2.5-flash-preview-tts'
  )[] = [
    'gemini-3.8-flash-tts',
    'gemini-3.8-flash-lite-tts',
    'gemini-2.5-flash-preview-tts',
  ];

  for (const modelName of ttsModels) {
    if (!isModelAvailable(modelName)) continue;

    try {
      const partPayload =
        modelName === 'gemini-2.5-flash-preview-tts'
          ? {
              text: `Say in a ${enhancedEmotion} tone: "${cleanText}"`,
            }
          : {
              text:
                modelName === 'gemini-3.8-flash-tts'
                  ? flashTtsText || cleanText
                  : cleanText,
              speechMetadata: {
                style: fullStyle,
              },
            };

      const response = await ai.models.generateContent({
        model: modelName,
        contents: [
          {
            role: 'user',
            parts: [partPayload],
          },
        ],
        config: {
          responseModalities: ['AUDIO'],
          speechConfig: {
            voiceConfig: {
              prebuiltVoiceConfig: { voiceName },
            },
          },
        },
      });

      const base64Audio =
        response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
      if (base64Audio) {
        const pcm = extractPcmFromWav(Buffer.from(base64Audio, 'base64'));
        if (pcm.length > 0) {
          return pcm;
        }
      }
    } catch (err: any) {
      recordModelQuotaError(modelName, err);
      console.warn(
        `Unary TTS (${modelName}) fallback notice:`,
        err?.status || err?.message
      );
    }
  }

  // Fallback to Reused Single-Connection WebSocket Pool
  return livePool.synthesizeTurn(
    speaker,
    voiceName,
    spec.personaPrompt,
    cleanText,
    enhancedEmotion
  );
}

/**
 * Synthesizes a single-speaker or multi-speaker script into 24kHz 16-bit PCM.
 * Uses smart batching on unary TTS models first, and falls back to a sequential
 * reused WebSocket pool so multiple WebSockets are never opened simultaneously.
 */
async function synthesizeMultiCharacterScript(
  ai: GoogleGenAI,
  lines: SynthLineItem[]
): Promise<Buffer> {
  const validLines = lines.filter((l) => l.text && l.text.trim());
  if (validLines.length === 0) {
    throw new Error('No dialogue lines to synthesize.');
  }

  // Assign distinct base voices if two characters of the same gender share a primary base
  const speakerBaseMap = new Map<string, PrebuiltBaseVoice>();
  const usedBasesByGender = {
    male: new Set<PrebuiltBaseVoice>(),
    female: new Set<PrebuiltBaseVoice>(),
  };

  for (const line of validLines) {
    const key = line.speaker.toLowerCase();
    if (!speakerBaseMap.has(key)) {
      const spec = getVoiceSpec(line.voiceId);
      const genderSet = usedBasesByGender[spec.gender];
      let chosenBase = spec.primaryBase;
      if (genderSet.has(chosenBase)) {
        chosenBase = spec.alternateBase;
      }
      genderSet.add(chosenBase);
      speakerBaseMap.set(key, chosenBase);
    }
  }

  const pauseBuffer = Buffer.alloc(Math.floor(24000 * 0.18) * 2, 0);

  // FAST PATH A: Single-Speaker Batching via unary `gemini-3.8-flash-tts` / `gemini-3.8-flash-lite-tts`
  // Groups up to 8 paragraphs per unary call so a solo monologue uses minimal quota and zero WebSockets!
  if (speakerBaseMap.size === 1) {
    const singleBase = Array.from(speakerBaseMap.values())[0];
    const batchSize = 6;
    const batchBuffers: Buffer[] = [];
    let allBatchesSucceeded = true;

    for (let i = 0; i < validLines.length; i += batchSize) {
      const slice = validLines.slice(i, i + batchSize);
      let slicePcm: Buffer | null = null;

      for (const modelName of [
        'gemini-3.8-flash-tts',
        'gemini-3.8-flash-lite-tts',
      ] as const) {
        if (!isModelAvailable(modelName)) continue;
        try {
          const response = await ai.models.generateContent({
            model: modelName,
            contents: [
              {
                role: 'user',
                parts: slice.map((l) => {
                  const spec = getVoiceSpec(l.voiceId);
                  const fullStyle = [spec.personaPrompt, l.emotion]
                    .filter(Boolean)
                    .join('. ');
                  return {
                    text:
                      modelName === 'gemini-3.8-flash-tts'
                        ? l.flashTtsText || l.text
                        : l.text,
                    speechMetadata: {
                      style: fullStyle,
                    },
                  };
                }),
              },
            ],
            config: {
              responseModalities: ['AUDIO'],
              speechConfig: {
                voiceConfig: {
                  prebuiltVoiceConfig: { voiceName: singleBase },
                },
              },
            },
          });

          const base64Audio =
            response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
          if (base64Audio) {
            const pcm = extractPcmFromWav(Buffer.from(base64Audio, 'base64'));
            if (pcm.length > 0) {
              slicePcm = pcm;
              break;
            }
          }
        } catch (err: any) {
          recordModelQuotaError(modelName, err);
          console.warn(
            `Single-speaker batch (${modelName}) notice:`,
            err?.status || err?.message
          );
        }
      }

      if (slicePcm) {
        batchBuffers.push(slicePcm);
      } else {
        allBatchesSucceeded = false;
        break;
      }
    }

    if (allBatchesSucceeded && batchBuffers.length > 0) {
      const joined: Buffer[] = [];
      for (let i = 0; i < batchBuffers.length; i++) {
        joined.push(batchBuffers[i]);
        if (i < batchBuffers.length - 1) joined.push(pauseBuffer);
      }
      return Buffer.concat(joined);
    }
  }

  // FAST PATH B: Dual-Speaker Batching via `multiSpeakerVoiceConfig` (chunks of up to 10 lines)
  if (speakerBaseMap.size === 2) {
    const speakersArr = Array.from(speakerBaseMap.entries());
    const spkAName = validLines.find(
      (l) => l.speaker.toLowerCase() === speakersArr[0][0]
    )!.speaker;
    const spkBName = validLines.find(
      (l) => l.speaker.toLowerCase() === speakersArr[1][0]
    )!.speaker;
    const baseA = speakersArr[0][1];
    const baseB = speakersArr[1][1];

    const chunkSize = 10;
    const chunkBuffers: Buffer[] = [];
    let allChunksSucceeded = true;

    for (let i = 0; i < validLines.length; i += chunkSize) {
      const slice = validLines.slice(i, i + chunkSize);
      let slicePcm: Buffer | null = null;

      for (const modelName of [
        'gemini-3.8-flash-tts',
        'gemini-3.8-flash-lite-tts',
      ] as const) {
        if (!isModelAvailable(modelName)) continue;
        try {
          const response = await ai.models.generateContent({
            model: modelName,
            contents: [
              {
                role: 'user',
                parts: slice.map((l) => {
                  const spec = getVoiceSpec(l.voiceId);
                  const fullStyle = [spec.personaPrompt, l.emotion]
                    .filter(Boolean)
                    .join('. ');
                  const lineText =
                    modelName === 'gemini-3.8-flash-tts'
                      ? l.flashTtsText || l.text
                      : l.text;
                  return {
                    text: `${l.speaker}: ${lineText}`,
                    speechMetadata: {
                      speaker: l.speaker,
                      style: fullStyle,
                    },
                  };
                }),
              },
            ],
            config: {
              responseModalities: ['AUDIO'],
              speechConfig: {
                multiSpeakerVoiceConfig: {
                  speakerVoiceConfigs: [
                    {
                      speaker: spkAName,
                      voiceConfig: { prebuiltVoiceConfig: { voiceName: baseA } },
                    },
                    {
                      speaker: spkBName,
                      voiceConfig: { prebuiltVoiceConfig: { voiceName: baseB } },
                    },
                  ],
                },
              },
            },
          });

          const base64Audio =
            response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
          if (base64Audio) {
            const pcm = extractPcmFromWav(Buffer.from(base64Audio, 'base64'));
            if (pcm.length > 0) {
              slicePcm = pcm;
              break;
            }
          }
        } catch (err: any) {
          recordModelQuotaError(modelName, err);
          console.warn(
            `Dual-speaker batch (${modelName}) notice:`,
            err?.status || err?.message
          );
        }
      }

      if (slicePcm) {
        chunkBuffers.push(slicePcm);
      } else {
        allChunksSucceeded = false;
        break;
      }
    }

    if (allChunksSucceeded && chunkBuffers.length > 0) {
      const joined: Buffer[] = [];
      for (let i = 0; i < chunkBuffers.length; i++) {
        joined.push(chunkBuffers[i]);
        if (i < chunkBuffers.length - 1) joined.push(pauseBuffer);
      }
      return Buffer.concat(joined);
    }
  }

  // FALLBACK / MULTI-SPEAKER PATH:
  // Expand long paragraphs into breath-aligned segments and synthesize sequentially
  // using the Reused Single-Connection WebSocket Pool (`LiveVoiceSessionPool`)
  const expandedTasks: {
    speaker: string;
    voiceId: string;
    cleanText: string;
    flashTtsText: string;
    emotion: string;
    baseVoice?: PrebuiltBaseVoice;
  }[] = [];

  for (const line of validLines) {
    const baseVoice = speakerBaseMap.get(line.speaker.toLowerCase());
    const subSegments = splitLongTextIntoBreathSegments(line.text, 380);
    for (let idx = 0; idx < subSegments.length; idx++) {
      const segText = subSegments[idx];
      expandedTasks.push({
        speaker: line.speaker,
        voiceId: line.voiceId,
        cleanText: segText,
        flashTtsText:
          subSegments.length === 1 ? line.flashTtsText || segText : segText,
        emotion: line.emotion,
        baseVoice,
      });
    }
  }

  const livePool = new LiveVoiceSessionPool(ai);
  const segmentBuffers: Buffer[] = [];

  try {
    for (const task of expandedTasks) {
      const buf = await synthesizeSegmentResilient(
        ai,
        livePool,
        task.speaker,
        task.voiceId,
        task.cleanText,
        task.flashTtsText,
        task.emotion,
        task.baseVoice
      );
      segmentBuffers.push(buf);
    }
  } finally {
    livePool.closeAll();
  }

  const finalSegments: Buffer[] = [];
  for (let i = 0; i < segmentBuffers.length; i++) {
    finalSegments.push(segmentBuffers[i]);
    if (i < segmentBuffers.length - 1) {
      finalSegments.push(pauseBuffer);
    }
  }

  return Buffer.concat(finalSegments);
}

async function generateTextWithFallback(
  ai: GoogleGenAI,
  contents: string,
  config?: Record<string, any>
): Promise<string> {
  const textModels = [
    'gemini-2.5-flash',
    'gemini-3-flash-preview',
    'gemini-3.1-flash-lite-preview',
    'gemini-flash-latest',
  ];
  let lastError: any = null;

  for (const model of textModels) {
    try {
      const response: any = await Promise.race([
        ai.models.generateContent({
          model,
          contents,
          config,
        }),
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error(`Model ${model} timed out`)), 12000)
        ),
      ]);
      if (response?.text) {
        return response.text;
      }
    } catch (err: any) {
      lastError = err;
      console.warn(
        `Text model ${model} fallback notice:`,
        err?.status || err?.message
      );
    }
  }
  throw lastError || new Error('Text generation failed across fallback models.');
}

/**
 * POST /api/tts/audition
 * Plays authentic Gemini male or female voice sample, incorporating
 * the character's customEmotion if the user wrote one.
 */
app.post('/api/tts/audition', async (req, res) => {
  const ai = getGeminiClient();
  const livePool = new LiveVoiceSessionPool(ai);
  try {
    const {
      voiceId = 'Akid',
      characterName,
      sampleText,
      customEmotion = '',
    } = req.body;
    const spec = getVoiceSpec(voiceId);
    const rawText =
      sampleText?.trim() ||
      `Hello, I am ${characterName || voiceId}, speaking with the ${voiceId} ${spec.gender} voice.`;

    const { cleanText, flashTtsText, enhancedEmotion } =
      sanitizeSpokenTextAndExtractCues(
        rawText,
        'Warm, expressive, natural human emotion',
        customEmotion
      );
    const cacheKey = `v5::${voiceId}::${enhancedEmotion}::${cleanText}`;

    if (auditionMp3Cache.has(cacheKey)) {
      return res.json({
        mp3Base64: auditionMp3Cache.get(cacheKey),
        cached: true,
      });
    }

    const pcm = await synthesizeSegmentResilient(
      ai,
      livePool,
      characterName || voiceId,
      voiceId,
      cleanText,
      flashTtsText,
      enhancedEmotion
    );

    const wavBuffer = buildWavFromPcm(pcm, 24000);
    const mp3Buffer = await encodeWavToMp3(wavBuffer);
    const mp3Base64 = mp3Buffer.toString('base64');

    auditionMp3Cache.set(cacheKey, mp3Base64);

    res.json({
      mp3Base64,
    });
  } catch (error: any) {
    console.error('Audition error:', error);
    res
      .status(500)
      .json({ error: error?.message || 'Could not preview voice.' });
  } finally {
    livePool.closeAll();
  }
});

/**
 * POST /api/session/generate-prompt
 * Generates an AI scene prompt tailored to Single, Dual, or Multi talking mode.
 */
app.post('/api/session/generate-prompt', async (req, res) => {
  try {
    const { seedIdea, cast = [], talkingMode = 'dual' } = req.body;
    const ai = getGeminiClient();
    const castSummary =
      Array.isArray(cast) && cast.length > 0
        ? cast
            .map(
              (c: any) =>
                `${c.name} (${c.gender}${
                  c.customEmotion ? `, emotion: ${c.customEmotion}` : ''
                })`
            )
            .join(', ')
        : 'Raf (male) and Rain (female)';

    const modeDesc =
      talkingMode === 'single'
        ? 'a single-speaker monologue or immersive storytelling narration'
        : talkingMode === 'multi'
        ? 'a multi-character ensemble conversation'
        : 'an intimate two-character conversation';

    let promptText = '';
    try {
      promptText = await generateTextWithFallback(
        ai,
        `Create a vivid, concise scene direction prompt (3-4 sentences) for ${modeDesc} featuring: ${castSummary}.
Include:
1. Theme & topic
2. The physical environment & atmosphere
3. The specific emotional arc and natural inline cues like <breath>, <sigh>, or <laugh>.
${
  seedIdea?.trim()
    ? `Base it on this user idea: "${seedIdea.trim()}"`
    : 'Make it atmospheric, cinematic, and emotionally engaging.'
}
Return ONLY the plain text prompt ready to use in a prompt box, with no quotes or markdown prefixes.`
      );
    } catch {
      promptText = `Theme: A quiet midnight reflection <breath> as rain patters on the windowpane. Environment: A warm dimly lit studio. Emotions: ${castSummary} speak with deep warmth, honest vulnerability, and <sigh> gentle relief.`;
    }

    res.json({
      prompt: promptText.trim(),
    });
  } catch (error: any) {
    console.error('Generate prompt error:', error);
    res
      .status(500)
      .json({ error: error?.message || 'Failed to generate scene prompt.' });
  }
});

/**
 * Helper to generate or parse structured script lines from the user's prompt.
 */
async function generateStructuredScriptFromPrompt(
  ai: GoogleGenAI,
  userPrompt: string,
  talkingMode: string,
  cast: any[],
  previousScript: any[] | null
) {
  const activeCast: {
    id: string;
    name: string;
    gender: 'male' | 'female';
    voiceId: string;
    customEmotion?: string;
  }[] =
    Array.isArray(cast) && cast.length > 0
      ? cast
      : [
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

  const castListDescription = activeCast
    .map(
      (c, idx) =>
        `Character ${idx + 1}: "${c.name}" (${c.gender}, TTS Voice: ${
          c.voiceId
        }, User-Specified Emotional Style: "${
          c.customEmotion?.trim() || 'Natural expressive delivery'
        }")`
    )
    .join('\n');

  const modeInstruction =
    talkingMode === 'single'
      ? `SINGLE-SPEAKER MODE: Only "${
          activeCast[0]?.name || 'Raf'
        }" speaks in this scene (a solo monologue, narration, or story). Break long speeches into natural paragraph-sized spoken turns so pacing and breathing flow organically.`
      : talkingMode === 'multi'
      ? `MULTI-SPEAKER MODE: Include all configured characters (${activeCast
          .map((c) => c.name)
          .join(', ')}) or any characters named in the user's prompt.`
      : `DUAL-SPEAKER MODE: A conversation between ${activeCast
          .slice(0, 2)
          .map((c) => c.name)
          .join(' and ')} (unless the user explicitly names different characters).`;

  const isRevision = Array.isArray(previousScript) && previousScript.length > 0;

  const systemContext = isRevision
    ? `You are the script director for "Rain sound", a minimalist voice production studio.
${modeInstruction}
Current Cast & Their Emotional Personas:
${castListDescription}

Previous script that was synthesized:
${JSON.stringify(previousScript, null, 2)}

The user has listened to the audio and provided this re-prompt / fix request:
"${userPrompt.trim()}"

Revise or rewrite the script to fulfill the user's exact request.
CRITICAL RULES:
- Honor each character's User-Specified Emotional Style and any inline tags like <breath>, <sigh>, <laugh>, <gasp>, or <whisper> that the user included.
- If the user wrote or requested a long script, preserve or generate the requested length.
- You may include inline cues like <breath>, <sigh>, <laugh>, <gasp>, <whisper> in "text" where appropriate.`
    : `You are the script director for "Rain sound", a minimalist voice production studio.
${modeInstruction}
Current Cast & Their Emotional Personas:
${castListDescription}

The user has provided the theme, environment, emotions, inline <breath> cues, or full script below:
"${userPrompt.trim()}"

Write or format the spoken script based on the user's input.
CRITICAL RULES:
- If the user pasted a full script or monologue, preserve all of their spoken text faithfully without shortening it.
- If the user described a theme/environment/situation, write a natural, emotionally rich script matching the requested mode (${talkingMode}).
- Honor each character's User-Specified Emotional Style in the "emotion" field of every line they speak.
- You may preserve or include natural inline cues like <breath>, <sigh>, <laugh>, <gasp>, <whisper> in the "text" field to mark emotional moments.`;

  let parsed: any = null;
  try {
    const jsonText = await generateTextWithFallback(ai, systemContext, {
      responseMimeType: 'application/json',
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          sceneTitle: {
            type: Type.STRING,
            description: 'Short poetic title for this scene.',
          },
          environmentNote: {
            type: Type.STRING,
            description: '1-line summary of the environment & mood.',
          },
          detectedCast: {
            type: Type.ARRAY,
            description:
              'The characters speaking in this scene and their assigned voices.',
            items: {
              type: Type.OBJECT,
              properties: {
                name: { type: Type.STRING },
                gender: { type: Type.STRING, description: '"male" or "female"' },
                voiceId: {
                  type: Type.STRING,
                  description:
                    'One of: Akid, Remy, Charon, Fenrir, Puck, Zephyr, Fola, Kore, Aria, Sora',
                },
              },
              required: ['name', 'gender', 'voiceId'],
            },
          },
          lines: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                speaker: {
                  type: Type.STRING,
                  description: 'Character name speaking this line.',
                },
                emotion: {
                  type: Type.STRING,
                  description: 'Rich emotional acting direction for this line.',
                },
                text: {
                  type: Type.STRING,
                  description:
                    'Spoken dialogue words (may contain <breath>, <sigh>, <laugh>, <gasp>, <whisper> cues).',
                },
              },
              required: ['speaker', 'emotion', 'text'],
            },
          },
        },
        required: ['sceneTitle', 'environmentNote', 'detectedCast', 'lines'],
      },
    });
    parsed = JSON.parse(jsonText.trim() || '{}');
  } catch (parseErr) {
    console.warn('Direct script parser fallback activated:', parseErr);
    const rawParagraphs = userPrompt
      .split(/\r?\n+/)
      .map((s) => s.trim())
      .filter(Boolean);
    parsed = {
      sceneTitle: `${activeCast.map((c) => c.name).join(' & ')} Scene`,
      environmentNote: 'Studio Recording',
      detectedCast: activeCast,
      lines: rawParagraphs.map((p, idx) => {
        const colonMatch = p.match(/^([^:]{1,28}):\s*(.+)$/);
        if (colonMatch && talkingMode !== 'single') {
          return {
            speaker: colonMatch[1].trim(),
            emotion: 'Expressive studio delivery',
            text: colonMatch[2].trim(),
          };
        }
        const member =
          talkingMode === 'single'
            ? activeCast[0]
            : activeCast[idx % activeCast.length];
        return {
          speaker: member.name,
          emotion: member.customEmotion || 'Expressive studio delivery',
          text: p,
        };
      }),
    };
  }

  // Merge user's configured cast with any prompt-detected characters
  const resolvedCastMap = new Map<
    string,
    {
      id: string;
      name: string;
      gender: 'male' | 'female';
      voiceId: string;
      customEmotion: string;
    }
  >();

  for (const c of activeCast) {
    resolvedCastMap.set(c.name.toLowerCase(), {
      ...c,
      customEmotion: c.customEmotion || '',
    });
  }

  if (talkingMode !== 'single' && Array.isArray(parsed.detectedCast)) {
    parsed.detectedCast.forEach((dc: any, idx: number) => {
      const key = String(dc.name || '')
        .trim()
        .toLowerCase();
      if (!key) return;
      if (!resolvedCastMap.has(key)) {
        const gender: 'male' | 'female' =
          String(dc.gender || '').toLowerCase() === 'female' ? 'female' : 'male';
        const spec = getVoiceSpec(dc.voiceId, gender);
        const validVoiceId = VOICE_CHARACTER_MAP[dc.voiceId]
          ? dc.voiceId
          : gender === 'female'
          ? 'Zephyr'
          : 'Akid';
        resolvedCastMap.set(key, {
          id: `char-${Date.now()}-${idx}`,
          name: String(dc.name).trim(),
          gender: spec.gender,
          voiceId: validVoiceId,
          customEmotion: '',
        });
      }
    });
  }

  const finalCastList = Array.from(resolvedCastMap.values());

  const normalizedLines: SynthLineItem[] = (parsed.lines || [])
    .map((l: any, idx: number) => {
      const rawSpeaker = String(l.speaker || '').trim();
      const matchedMember =
        talkingMode === 'single'
          ? finalCastList[0]
          : resolvedCastMap.get(rawSpeaker.toLowerCase()) ||
            finalCastList[idx % finalCastList.length];

      const { cleanText, flashTtsText, rawTextWithTags, enhancedEmotion } =
        sanitizeSpokenTextAndExtractCues(
          String(l.text || ''),
          String(l.emotion || 'Natural, expressive delivery'),
          matchedMember.customEmotion
        );

      return {
        speaker: matchedMember.name,
        voiceId: matchedMember.voiceId,
        emotion: enhancedEmotion,
        text: cleanText,
        flashTtsText,
        rawTextWithTags,
      };
    })
    .filter((l: SynthLineItem) => l.text.length > 0 && l.text !== '...');

  if (normalizedLines.length === 0) {
    throw new Error('Could not generate script lines from the prompt.');
  }

  return {
    sceneTitle: parsed.sceneTitle || 'Untitled Scene',
    environmentNote: parsed.environmentNote || 'Studio Environment',
    updatedCast: finalCastList,
    normalizedLines,
  };
}

/**
 * POST /api/session/script
 * Step 1 of progressive studio rendering: generates or revises the structured script
 * so the UI can display progress and synthesize long scripts in reliable chunks.
 */
app.post('/api/session/script', async (req, res) => {
  try {
    const {
      userPrompt,
      talkingMode = 'dual',
      cast = [],
      previousScript = null,
    } = req.body;

    if (!userPrompt || typeof userPrompt !== 'string' || !userPrompt.trim()) {
      return res.status(400).json({ error: 'Please enter your prompt or script.' });
    }

    const ai = getGeminiClient();
    const { sceneTitle, environmentNote, updatedCast, normalizedLines } =
      await generateStructuredScriptFromPrompt(
        ai,
        userPrompt,
        talkingMode,
        cast,
        previousScript
      );

    res.json({
      sceneTitle,
      environmentNote,
      updatedCast,
      lines: normalizedLines.map((l, idx) => ({
        id: `line-${Date.now()}-${idx}`,
        speaker: l.speaker,
        voiceId: l.voiceId,
        emotion: l.emotion,
        text: l.text,
        flashTtsText: l.flashTtsText,
        rawTextWithTags: l.rawTextWithTags,
      })),
    });
  } catch (error: any) {
    console.error('Session script error:', error);
    res.status(500).json({
      error: error?.message || 'Failed to prepare script.',
    });
  }
});

/**
 * POST /api/session/synthesize-chunk
 * Synthesizes a batch of lines and returns raw 24kHz 16-bit PCM base64,
 * allowing long 2-10 minute scripts to be synthesized with live progress and zero timeouts.
 */
app.post('/api/session/synthesize-chunk', async (req, res) => {
  try {
    const { lines = [], cast = [] } = req.body;
    if (!Array.isArray(lines) || lines.length === 0) {
      return res.status(400).json({ error: 'No lines provided for chunk.' });
    }

    const castMap = new Map<string, { voiceId: string; customEmotion: string }>();
    for (const c of cast) {
      if (c.name && c.voiceId) {
        castMap.set(String(c.name).toLowerCase(), {
          voiceId: c.voiceId,
          customEmotion: c.customEmotion || '',
        });
      }
    }

    const synthLines: SynthLineItem[] = lines.map((l: any) => {
      const charInfo = castMap.get(String(l.speaker || '').toLowerCase());
      const sourceText = String(l.rawTextWithTags ?? l.text ?? '');
      const { cleanText, flashTtsText, rawTextWithTags, enhancedEmotion } =
        sanitizeSpokenTextAndExtractCues(
          sourceText,
          String(l.emotion || 'Natural emotional delivery'),
          charInfo?.customEmotion
        );
      return {
        speaker: l.speaker,
        voiceId: charInfo?.voiceId || l.voiceId || 'Akid',
        emotion: enhancedEmotion,
        text: cleanText,
        flashTtsText,
        rawTextWithTags,
      };
    });

    const ai = getGeminiClient();
    const chunkPcm = await synthesizeMultiCharacterScript(ai, synthLines);

    res.json({
      pcmBase64: chunkPcm.toString('base64'),
    });
  } catch (error: any) {
    console.error('Synthesize chunk error:', error);
    res.status(500).json({
      error: error?.message || 'Failed to synthesize audio chunk.',
    });
  }
});

/**
 * POST /api/session/finalize-audio
 * Combines synthesized PCM chunks into final master WAV and MP3 files with waveform peaks.
 */
app.post('/api/session/finalize-audio', async (req, res) => {
  try {
    const { pcmChunksBase64 = [] } = req.body;
    if (!Array.isArray(pcmChunksBase64) || pcmChunksBase64.length === 0) {
      return res.status(400).json({ error: 'No audio chunks to finalize.' });
    }

    const pauseBuffer = Buffer.alloc(Math.floor(24000 * 0.18) * 2, 0);
    const buffers: Buffer[] = [];

    for (let i = 0; i < pcmChunksBase64.length; i++) {
      const buf = Buffer.from(pcmChunksBase64[i], 'base64');
      if (buf.length > 0) {
        buffers.push(buf);
        if (i < pcmChunksBase64.length - 1) {
          buffers.push(pauseBuffer);
        }
      }
    }

    const fullPcm = Buffer.concat(buffers);
    const wavBuffer = buildWavFromPcm(fullPcm, 24000);
    const mp3Buffer = await encodeWavToMp3(wavBuffer);
    const peaks = computeWaveformPeaks(fullPcm, 64);
    const durationSeconds = Number((fullPcm.length / (24000 * 2)).toFixed(2));

    res.json({
      mp3Base64: mp3Buffer.toString('base64'),
      wavBase64: wavBuffer.toString('base64'),
      durationSeconds,
      fileSizeBytes: mp3Buffer.length,
      peaks,
    });
  } catch (error: any) {
    console.error('Finalize audio error:', error);
    res.status(500).json({
      error: error?.message || 'Failed to encode master MP3 and WAV.',
    });
  }
});

/**
 * POST /api/session/turn
 * Full single-request script + audio endpoint (kept for direct API compatibility).
 */
app.post('/api/session/turn', async (req, res) => {
  try {
    const {
      userPrompt,
      talkingMode = 'dual',
      cast = [],
      previousScript = null,
    } = req.body;

    if (!userPrompt || typeof userPrompt !== 'string' || !userPrompt.trim()) {
      return res.status(400).json({ error: 'Please enter your prompt or script.' });
    }

    const ai = getGeminiClient();
    const { sceneTitle, environmentNote, updatedCast, normalizedLines } =
      await generateStructuredScriptFromPrompt(
        ai,
        userPrompt,
        talkingMode,
        cast,
        previousScript
      );

    const fullPcm = await synthesizeMultiCharacterScript(ai, normalizedLines);
    const wavBuffer = buildWavFromPcm(fullPcm, 24000);
    const mp3Buffer = await encodeWavToMp3(wavBuffer);
    const peaks = computeWaveformPeaks(fullPcm, 64);
    const durationSeconds = Number((fullPcm.length / (24000 * 2)).toFixed(2));

    res.json({
      sceneTitle,
      environmentNote,
      updatedCast,
      lines: normalizedLines.map((l, idx) => ({
        id: `line-${Date.now()}-${idx}`,
        speaker: l.speaker,
        voiceId: l.voiceId,
        emotion: l.emotion,
        text: l.text,
        rawTextWithTags: l.rawTextWithTags,
      })),
      mp3Base64: mp3Buffer.toString('base64'),
      wavBase64: wavBuffer.toString('base64'),
      durationSeconds,
      fileSizeBytes: mp3Buffer.length,
      peaks,
    });
  } catch (error: any) {
    console.error('Session turn error:', error);
    res.status(500).json({
      error: error?.message || 'Failed to generate script and audio.',
    });
  }
});

/**
 * POST /api/session/resynthesize
 * Re-renders the MP3 & WAV directly when the user manually edits lines or character emotions.
 */
app.post('/api/session/resynthesize', async (req, res) => {
  try {
    const { lines = [], cast = [] } = req.body;
    if (!Array.isArray(lines) || lines.length === 0) {
      return res.status(400).json({ error: 'No script lines provided.' });
    }

    const castMap = new Map<string, { voiceId: string; customEmotion: string }>();
    for (const c of cast) {
      if (c.name && c.voiceId) {
        castMap.set(String(c.name).toLowerCase(), {
          voiceId: c.voiceId,
          customEmotion: c.customEmotion || '',
        });
      }
    }

    const synthLines: SynthLineItem[] = lines.map((l: any) => {
      const charInfo = castMap.get(String(l.speaker || '').toLowerCase());
      const sourceText = String(l.rawTextWithTags ?? l.text ?? '');
      const { cleanText, flashTtsText, rawTextWithTags, enhancedEmotion } =
        sanitizeSpokenTextAndExtractCues(
          sourceText,
          String(l.emotion || 'Natural emotional delivery'),
          charInfo?.customEmotion
        );
      return {
        speaker: l.speaker,
        voiceId: charInfo?.voiceId || l.voiceId || 'Akid',
        emotion: enhancedEmotion,
        text: cleanText,
        flashTtsText,
        rawTextWithTags,
      };
    });

    const ai = getGeminiClient();
    const fullPcm = await synthesizeMultiCharacterScript(ai, synthLines);
    const wavBuffer = buildWavFromPcm(fullPcm, 24000);
    const mp3Buffer = await encodeWavToMp3(wavBuffer);
    const peaks = computeWaveformPeaks(fullPcm, 64);
    const durationSeconds = Number((fullPcm.length / (24000 * 2)).toFixed(2));

    res.json({
      lines: synthLines.map((l, idx) => ({
        id: lines[idx]?.id || `line-${Date.now()}-${idx}`,
        speaker: l.speaker,
        voiceId: l.voiceId,
        emotion: l.emotion,
        text: l.text,
        rawTextWithTags: l.rawTextWithTags,
      })),
      mp3Base64: mp3Buffer.toString('base64'),
      wavBase64: wavBuffer.toString('base64'),
      durationSeconds,
      fileSizeBytes: mp3Buffer.length,
      peaks,
    });
  } catch (error: any) {
    console.error('Resynthesize error:', error);
    res.status(500).json({
      error: error?.message || 'Failed to re-synthesize audio.',
    });
  }
});

async function startServer() {
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true, hmr: false },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Rain sound TTS server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
