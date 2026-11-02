import express from 'express';
import { createServer as createViteServer } from 'vite';
import { GoogleGenAI, Type } from '@google/genai';
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

type PrebuiltBaseVoice =
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

interface VoiceMappingSpec {
  gender: 'male' | 'female';
  primaryBase: PrebuiltBaseVoice;
  alternateBase: PrebuiltBaseVoice;
  personaPrompt: string;
}

const VOICE_CHARACTER_MAP: Record<string, VoiceMappingSpec> = {
  // REAL GEMINI MALE VOICES (Default for Raf: Achird)
  Achird: {
    gender: 'male',
    primaryBase: 'Achird',
    alternateBase: 'Charon',
    personaPrompt:
      'Grounded, resonant, natural male voice with warm emotional depth and calm confidence',
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
    alternateBase: 'Orus',
    personaPrompt:
      'Bright, energetic, expressive male tenor voice with lively natural inflection',
  },
  Orus: {
    gender: 'male',
    primaryBase: 'Orus',
    alternateBase: 'Achird',
    personaPrompt:
      'Steady, resonant, articulate male voice with natural storytelling warmth',
  },

  // REAL GEMINI FEMALE VOICES (Default for Rain: Autonoe)
  Autonoe: {
    gender: 'female',
    primaryBase: 'Autonoe',
    alternateBase: 'Zephyr',
    personaPrompt:
      'Warm, soulful, deeply expressive female voice with rich emotional nuance',
  },
  Zephyr: {
    gender: 'female',
    primaryBase: 'Zephyr',
    alternateBase: 'Kore',
    personaPrompt:
      'Smooth, airy, gentle female voice with effortless natural pacing and emotional warmth',
  },
  Kore: {
    gender: 'female',
    primaryBase: 'Kore',
    alternateBase: 'Autonoe',
    personaPrompt:
      'Poised, clear, articulate female mezzo voice with natural studio warmth',
  },
  Aoede: {
    gender: 'female',
    primaryBase: 'Aoede',
    alternateBase: 'Zephyr',
    personaPrompt:
      'Soft, intimate, delicate close-mic female voice with gentle breath and tender emotion',
  },
  Leda: {
    gender: 'female',
    primaryBase: 'Leda',
    alternateBase: 'Kore',
    personaPrompt:
      'Bright, lively, expressive female voice with warm, vibrant energy',
  },

  // Legacy alias compatibility mapping to real Gemini voices
  Akid: {
    gender: 'male',
    primaryBase: 'Achird',
    alternateBase: 'Charon',
    personaPrompt:
      'Grounded, resonant, natural male voice with warm emotional depth and calm confidence',
  },
  Remy: {
    gender: 'male',
    primaryBase: 'Puck',
    alternateBase: 'Orus',
    personaPrompt:
      'Intimate, conversational, natural male tenor voice with close-mic warmth',
  },
  Fola: {
    gender: 'female',
    primaryBase: 'Autonoe',
    alternateBase: 'Kore',
    personaPrompt:
      'Warm, soulful, deeply expressive female storytelling voice with rich emotional resonance',
  },
  Aria: {
    gender: 'female',
    primaryBase: 'Aoede',
    alternateBase: 'Zephyr',
    personaPrompt:
      'Soft, intimate, delicate close-mic female voice with gentle breath',
  },
  Sora: {
    gender: 'female',
    primaryBase: 'Leda',
    alternateBase: 'Kore',
    personaPrompt:
      'Bright, lively, expressive female voice with warm, vibrant energy',
  },
};

const auditionMp3Cache = new Map<string, string>();

function getVoiceSpec(
  voiceId?: string,
  fallbackGender: 'male' | 'female' = 'male'
): VoiceMappingSpec {
  if (voiceId && VOICE_CHARACTER_MAP[voiceId]) {
    return VOICE_CHARACTER_MAP[voiceId];
  }
  return fallbackGender === 'female'
    ? VOICE_CHARACTER_MAP.Autonoe
    : VOICE_CHARACTER_MAP.Achird;
}

function isQuotaError(err: any): boolean {
  const status = err?.status || err?.code;
  const msg = String(err?.message || '');
  return (
    status === 429 ||
    msg.includes('429') ||
    msg.includes('RESOURCE_EXHAUSTED') ||
    msg.toLowerCase().includes('quota')
  );
}

function createClearQuotaError(lastErr?: any): Error {
  const rawMsg = String(lastErr?.message || '');
  const retryMatch = rawMsg.match(/retry in ([0-9hms.]+)/i);
  const retryHint = retryMatch ? ` (Retry available in ${retryMatch[1]})` : '';
  const error: any = new Error(
    `Gemini TTS quota limit reached (429 RESOURCE_EXHAUSTED)${retryHint}. Audio synthesis stopped instead of switching models—please wait for quota reset or check your Gemini API plan and billing details.`
  );
  error.status = 429;
  return error;
}

/**
 * Parses inline <breath>, <laugh>, <gasp>, <sigh>, <whisper>, |yeah|, |mhm| cues from the script
 * so the voice engine understands the exact emotional/breathing situation without ever speaking
 * "less than" or "greater than" or speaker names aloud.
 * If a line has only a stage direction and no spoken words, returns empty cleanText ('') so it is skipped.
 */
function sanitizeSpokenTextAndExtractCues(
  rawText: string,
  rawEmotion: string,
  characterCustomEmotion?: string,
  speakerName?: string
): {
  cleanText: string;
  flashTtsText: string;
  rawTextWithTags: string;
  enhancedEmotion: string;
} {
  const extractedCues: string[] = [];
  let rawTextWithTags = (rawText || '').trim();

  // Strip any accidental leading "SpeakerName:" prefix so names are never read aloud
  if (speakerName && speakerName.trim()) {
    const escapedSpeaker = speakerName
      .trim()
      .replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const speakerPrefixRegex = new RegExp(`^${escapedSpeaker}\\s*[:：-]\\s*`, 'i');
    rawTextWithTags = rawTextWithTags.replace(speakerPrefixRegex, '').trim();
  }

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
    return ' ';
  });

  // Extract [...] and (...) stage directions if the whole line or bracket is a stage direction
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

  // Check if there are actual spoken letters/numbers in any script (including Bangla, Latin, etc.)
  // If a line only had stage directions (e.g. "<breath>" or "[sighs]"), return empty string so it is skipped!
  const hasSpokenWords = /[\p{L}\p{N}]/u.test(text);

  const enhancedEmotion = [
    characterCustomEmotion?.trim(),
    rawEmotion?.trim(),
    ...extractedCues,
  ]
    .filter(Boolean)
    .join(', ');

  return {
    cleanText: hasSpokenWords ? text : '',
    flashTtsText: hasSpokenWords ? flashTtsText || text : '',
    rawTextWithTags,
    enhancedEmotion:
      enhancedEmotion || 'Natural, emotionally expressive human delivery',
  };
}

/**
 * Splits long text into breath-aligned segments at '.', '!', '?', and Bangla '।' / '॥'.
 */
function splitLongTextIntoBreathSegments(text: string, maxChars = 380): string[] {
  const trimmed = text.trim();
  if (!trimmed) return [];
  if (trimmed.length <= maxChars) return [trimmed];

  const sentences =
    trimmed.match(/[^.!?।॥]+[.!?।॥]+|\s*[^.!?।॥]+$/g) || [trimmed];
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
 * Synthesizes a single spoken segment using ONLY Gemini TTS models
 * (`gemini-3.8-flash-tts`, `gemini-3.8-flash-lite-tts`).
 * Never switches to Live models—if TTS models hit their quota, stops and throws a clear message.
 */
async function synthesizeSegmentTtsOnly(
  ai: GoogleGenAI,
  voiceId: string,
  cleanText: string,
  flashTtsText: string,
  enhancedEmotion: string,
  baseVoiceOverride?: PrebuiltBaseVoice
): Promise<Buffer> {
  const spec = getVoiceSpec(voiceId);
  const voiceName = baseVoiceOverride || spec.primaryBase;
  const fullStyle = [spec.personaPrompt, enhancedEmotion].filter(Boolean).join('. ');

  const ttsModels: ('gemini-3.8-flash-tts' | 'gemini-3.8-flash-lite-tts')[] = [
    'gemini-3.8-flash-tts',
    'gemini-3.8-flash-lite-tts',
  ];

  let sawQuotaError = false;
  let lastError: any = null;

  for (const modelName of ttsModels) {
    try {
      const response = await ai.models.generateContent({
        model: modelName,
        contents: [
          {
            role: 'user',
            parts: [
              {
                text:
                  modelName === 'gemini-3.8-flash-tts'
                    ? flashTtsText || cleanText
                    : cleanText,
                speechMetadata: {
                  style: fullStyle,
                },
              },
            ],
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
      lastError = err;
      if (isQuotaError(err)) {
        sawQuotaError = true;
      }
      console.warn(
        `Gemini TTS (${modelName}) error:`,
        err?.status || err?.message
      );
    }
  }

  if (sawQuotaError) {
    throw createClearQuotaError(lastError);
  }

  throw new Error(
    lastError?.message || 'Gemini TTS model could not synthesize the audio line.'
  );
}

/**
 * Synthesizes a single-speaker, dual-speaker, or multi-speaker script into 24kHz 16-bit PCM
 * using ONLY Gemini TTS models.
 * - In two-speaker synthesis, sends ONLY the line text (`lineText`) without any `"Speaker:"` prefix,
 *   because `speechMetadata.speaker` already sets the speaker.
 * - If TTS models hit their quota, stops immediately and throws a clear quota message.
 */
async function synthesizeMultiCharacterScript(
  ai: GoogleGenAI,
  lines: SynthLineItem[]
): Promise<Buffer> {
  // Skip any line that has no actual spoken words (e.g. stage-direction-only lines)
  const validLines = lines.filter(
    (l) => l.text && /[\p{L}\p{N}]/u.test(l.text.trim())
  );
  if (validLines.length === 0) {
    throw new Error(
      'No spoken dialogue words found to synthesize (lines contained only stage directions).'
    );
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

  // Expand any very long single lines at '.', '!', '?', or Bangla '।'
  const expandedLines: (SynthLineItem & { baseVoice: PrebuiltBaseVoice })[] = [];
  for (const line of validLines) {
    const baseVoice = speakerBaseMap.get(line.speaker.toLowerCase())!;
    const subSegments = splitLongTextIntoBreathSegments(line.text, 380);
    for (let idx = 0; idx < subSegments.length; idx++) {
      const segText = subSegments[idx];
      if (!/[\p{L}\p{N}]/u.test(segText)) continue;
      expandedLines.push({
        ...line,
        text: segText,
        flashTtsText:
          subSegments.length === 1 ? line.flashTtsText || segText : segText,
        baseVoice,
      });
    }
  }

  // PATH A: Single-Speaker Batching via unary `gemini-3.8-flash-tts` / `gemini-3.8-flash-lite-tts` (up to 10 lines per call)
  if (speakerBaseMap.size === 1) {
    const singleBase = Array.from(speakerBaseMap.values())[0];
    const batchSize = 10;
    const batchBuffers: Buffer[] = [];

    for (let i = 0; i < expandedLines.length; i += batchSize) {
      const slice = expandedLines.slice(i, i + batchSize);
      let slicePcm: Buffer | null = null;
      let sawQuotaError = false;
      let lastErr: any = null;

      for (const modelName of [
        'gemini-3.8-flash-tts',
        'gemini-3.8-flash-lite-tts',
      ] as const) {
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
          lastErr = err;
          if (isQuotaError(err)) {
            sawQuotaError = true;
          }
          console.warn(
            `Single-speaker TTS (${modelName}) error:`,
            err?.status || err?.message
          );
        }
      }

      if (!slicePcm) {
        if (sawQuotaError) {
          throw createClearQuotaError(lastErr);
        }
        throw new Error(
          lastErr?.message || 'Single-speaker TTS synthesis failed.'
        );
      }

      batchBuffers.push(slicePcm);
    }

    const joined: Buffer[] = [];
    for (let i = 0; i < batchBuffers.length; i++) {
      joined.push(batchBuffers[i]);
      if (i < batchBuffers.length - 1) joined.push(pauseBuffer);
    }
    return Buffer.concat(joined);
  }

  // PATH B: Dual-Speaker Batching via `multiSpeakerVoiceConfig` (up to 10 lines per request)
  // Sends ONLY `lineText` in `text` (NEVER `${l.speaker}: ${lineText}`) because `speechMetadata.speaker` sets the speaker!
  if (speakerBaseMap.size === 2) {
    const speakersArr = Array.from(speakerBaseMap.entries());
    const spkAName = expandedLines.find(
      (l) => l.speaker.toLowerCase() === speakersArr[0][0]
    )!.speaker;
    const spkBName = expandedLines.find(
      (l) => l.speaker.toLowerCase() === speakersArr[1][0]
    )!.speaker;
    const baseA = speakersArr[0][1];
    const baseB = speakersArr[1][1];

    const chunkSize = 10;
    const chunkBuffers: Buffer[] = [];

    for (let i = 0; i < expandedLines.length; i += chunkSize) {
      const slice = expandedLines.slice(i, i + chunkSize);
      let slicePcm: Buffer | null = null;
      let sawQuotaError = false;
      let lastErr: any = null;

      for (const modelName of [
        'gemini-3.8-flash-tts',
        'gemini-3.8-flash-lite-tts',
      ] as const) {
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
                    text: lineText,
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
          lastErr = err;
          if (isQuotaError(err)) {
            sawQuotaError = true;
          }
          console.warn(
            `Dual-speaker TTS (${modelName}) error:`,
            err?.status || err?.message
          );
        }
      }

      if (!slicePcm) {
        if (sawQuotaError) {
          throw createClearQuotaError(lastErr);
        }
        throw new Error(
          lastErr?.message || 'Dual-speaker TTS synthesis failed.'
        );
      }

      chunkBuffers.push(slicePcm);
    }

    const joined: Buffer[] = [];
    for (let i = 0; i < chunkBuffers.length; i++) {
      joined.push(chunkBuffers[i]);
      if (i < chunkBuffers.length - 1) joined.push(pauseBuffer);
    }
    return Buffer.concat(joined);
  }

  // PATH C: Multi-Speaker (3+ speakers) using TTS models only
  const segmentBuffers: Buffer[] = [];
  for (const task of expandedLines) {
    const buf = await synthesizeSegmentTtsOnly(
      ai,
      task.voiceId,
      task.text,
      task.flashTtsText || task.text,
      task.emotion,
      task.baseVoice
    );
    segmentBuffers.push(buf);
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
  try {
    const {
      voiceId = 'Achird',
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
        customEmotion,
        characterName
      );
    const cacheKey = `v6::${voiceId}::${enhancedEmotion}::${cleanText}`;

    if (auditionMp3Cache.has(cacheKey)) {
      return res.json({
        mp3Base64: auditionMp3Cache.get(cacheKey),
        cached: true,
      });
    }

    const pcm = await synthesizeSegmentTtsOnly(
      ai,
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
    const statusCode = error?.status === 429 ? 429 : 500;
    res
      .status(statusCode)
      .json({ error: error?.message || 'Could not preview voice.' });
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
                `${c.name} (${c.gender}, Gemini Voice: ${c.voiceId}${
                  c.customEmotion ? `, emotion: ${c.customEmotion}` : ''
                })`
            )
            .join(', ')
        : 'Raf (male, Achird) and Rain (female, Autonoe)';

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
    ? `Base it on this user idea (preserve the language if written in Bangla or another language): "${seedIdea.trim()}"`
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
 * Preserves user-written dialogue 100% verbatim in its original language (including Bangla).
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

  const isRevision = Array.isArray(previousScript) && previousScript.length > 0;

  // Direct Verbatim Parser when the user provides a script formatted with "Speaker: Dialogue"
  // (e.g., "Raf: কেমন আছো রেইন?" or "Rain: <breath> I am here.") and is not revising a previous script.
  // This guarantees 0% modification of Bangla or any language and 0ms latency!
  const rawInputLines = userPrompt
    .split(/\r?\n+/)
    .map((s) => s.trim())
    .filter(Boolean);

  const speakerColonRegex = /^([^:：]{1,32})[:：]\s*(.+)$/;
  const colonLineMatches = rawInputLines.filter((l) => speakerColonRegex.test(l));

  let parsed: any = null;

  if (
    !isRevision &&
    rawInputLines.length > 0 &&
    colonLineMatches.length >= Math.ceil(rawInputLines.length * 0.6)
  ) {
    const directLines: { speaker: string; emotion: string; text: string }[] = [];
    for (const rawLine of rawInputLines) {
      const m = rawLine.match(speakerColonRegex);
      if (m) {
        const spkName = m[1].trim();
        const spokenPart = m[2].trim();
        const castMatch = activeCast.find(
          (c) => c.name.toLowerCase() === spkName.toLowerCase()
        );
        directLines.push({
          speaker: castMatch ? castMatch.name : spkName,
          emotion: castMatch?.customEmotion || 'Natural expressive delivery',
          text: spokenPart,
        });
      } else if (directLines.length > 0) {
        directLines[directLines.length - 1].text += ` ${rawLine}`;
      } else {
        const firstMember = activeCast[0];
        directLines.push({
          speaker: firstMember.name,
          emotion: firstMember.customEmotion || 'Natural expressive delivery',
          text: rawLine,
        });
      }
    }

    parsed = {
      sceneTitle: `${activeCast.map((c) => c.name).join(' & ')} Scene`,
      environmentNote: 'Verbatim Script Recording',
      detectedCast: activeCast,
      lines: directLines,
    };
  } else {
    const castListDescription = activeCast
      .map(
        (c, idx) =>
          `Character ${idx + 1}: "${c.name}" (${c.gender}, Gemini Voice: ${
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
- VERBATIM & LANGUAGE PRESERVATION: Keep all user-written dialogue in its exact original language and script (including Bangla / বাংলা, English, or mixed text). Never translate Bangla into English or rewrite user-written words unless explicitly asked.
- NEVER include the speaker's name inside the "text" field (only put the spoken words in "text").
- If a line has only a stage direction and no spoken words, fold that direction into the adjacent line's "emotion" field rather than creating an empty line.
- Honor each character's User-Specified Emotional Style and any inline tags like <breath>, <sigh>, <laugh>, <gasp>, or <whisper>.`
      : `You are the script director for "Rain sound", a minimalist voice production studio.
${modeInstruction}
Current Cast & Their Emotional Personas:
${castListDescription}

The user has provided the theme, environment, emotions, inline <breath> cues, or full script below:
"${userPrompt.trim()}"

Write or format the spoken script based on the user's input.
CRITICAL RULES:
- VERBATIM & LANGUAGE PRESERVATION: If the user wrote dialogue or monologue text (in Bangla / বাংলা, English, or any language), keep their exact written dialogue 100% verbatim in its original language and script without translating, shortening, or paraphrasing it. Preserve Bangla punctuation like "।" exactly.
- If the user described a theme/environment/situation instead of dialogue, write a natural, emotionally rich script in the language requested by the user matching the mode (${talkingMode}).
- NEVER include the speaker's name prefix (e.g. "Raf:") inside the "text" field—put the speaker name only in "speaker" and only the spoken words in "text".
- Do NOT create lines that contain only stage directions with no spoken words.
- Honor each character's User-Specified Emotional Style in the "emotion" field of every line they speak.`;

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
                      'One of: Achird, Charon, Fenrir, Puck, Orus, Autonoe, Zephyr, Kore, Aoede, Leda',
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
                      'Spoken dialogue words only (never include speaker name prefix; may contain <breath>, <sigh>, <laugh>, <gasp>, <whisper> cues).',
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
      parsed = {
        sceneTitle: `${activeCast.map((c) => c.name).join(' & ')} Scene`,
        environmentNote: 'Studio Recording',
        detectedCast: activeCast,
        lines: rawInputLines.map((p, idx) => {
          const colonMatch = p.match(speakerColonRegex);
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
          ? VOICE_CHARACTER_MAP[dc.voiceId].primaryBase
          : gender === 'female'
          ? 'Autonoe'
          : 'Achird';
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

  // Normalize lines and skip any line that has only a stage direction and no spoken words!
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
          matchedMember.customEmotion,
          matchedMember.name
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
    .filter(
      (l: SynthLineItem) =>
        Boolean(l.text) && /[\p{L}\p{N}]/u.test(l.text.trim())
    );

  if (normalizedLines.length === 0) {
    throw new Error(
      'No spoken words found in the script (lines contained only stage directions).'
    );
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
 * Synthesizes up to 10 lines per request and returns raw 24kHz 16-bit PCM base64.
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

    const synthLines: SynthLineItem[] = lines
      .map((l: any) => {
        const charInfo = castMap.get(String(l.speaker || '').toLowerCase());
        const sourceText = String(l.rawTextWithTags ?? l.text ?? '');
        const { cleanText, flashTtsText, rawTextWithTags, enhancedEmotion } =
          sanitizeSpokenTextAndExtractCues(
            sourceText,
            String(l.emotion || 'Natural emotional delivery'),
            charInfo?.customEmotion,
            String(l.speaker || '')
          );
        return {
          speaker: l.speaker,
          voiceId: charInfo?.voiceId || l.voiceId || 'Achird',
          emotion: enhancedEmotion,
          text: cleanText,
          flashTtsText,
          rawTextWithTags,
        };
      })
      .filter(
        (l: SynthLineItem) =>
          Boolean(l.text) && /[\p{L}\p{N}]/u.test(l.text.trim())
      );

    if (synthLines.length === 0) {
      return res.json({ pcmBase64: '' });
    }

    const ai = getGeminiClient();
    const chunkPcm = await synthesizeMultiCharacterScript(ai, synthLines);

    res.json({
      pcmBase64: chunkPcm.toString('base64'),
    });
  } catch (error: any) {
    console.error('Synthesize chunk error:', error);
    const statusCode = error?.status === 429 ? 429 : 500;
    res.status(statusCode).json({
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
    const nonEmptyChunks = Array.isArray(pcmChunksBase64)
      ? pcmChunksBase64.filter((c: any) => typeof c === 'string' && c.length > 0)
      : [];

    if (nonEmptyChunks.length === 0) {
      return res.status(400).json({ error: 'No audio chunks to finalize.' });
    }

    const pauseBuffer = Buffer.alloc(Math.floor(24000 * 0.18) * 2, 0);
    const buffers: Buffer[] = [];

    for (let i = 0; i < nonEmptyChunks.length; i++) {
      const buf = Buffer.from(nonEmptyChunks[i], 'base64');
      if (buf.length > 0) {
        buffers.push(buf);
        if (i < nonEmptyChunks.length - 1) {
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
 * Full single-request script + audio endpoint.
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
    const statusCode = error?.status === 429 ? 429 : 500;
    res.status(statusCode).json({
      error: error?.message || 'Failed to generate script and audio.',
    });
  }
});

/**
 * POST /api/session/resynthesize
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

    const synthLines: SynthLineItem[] = lines
      .map((l: any) => {
        const charInfo = castMap.get(String(l.speaker || '').toLowerCase());
        const sourceText = String(l.rawTextWithTags ?? l.text ?? '');
        const { cleanText, flashTtsText, rawTextWithTags, enhancedEmotion } =
          sanitizeSpokenTextAndExtractCues(
            sourceText,
            String(l.emotion || 'Natural emotional delivery'),
            charInfo?.customEmotion,
            String(l.speaker || '')
          );
        return {
          speaker: l.speaker,
          voiceId: charInfo?.voiceId || l.voiceId || 'Achird',
          emotion: enhancedEmotion,
          text: cleanText,
          flashTtsText,
          rawTextWithTags,
        };
      })
      .filter(
        (l: SynthLineItem) =>
          Boolean(l.text) && /[\p{L}\p{N}]/u.test(l.text.trim())
      );

    if (synthLines.length === 0) {
      return res.status(400).json({
        error: 'No spoken words found to synthesize after removing stage directions.',
      });
    }

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
    const statusCode = error?.status === 429 ? 429 : 500;
    res.status(statusCode).json({
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
