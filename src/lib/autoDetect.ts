import { AutoDetectResult } from './types';

type AIProvider = 'huggingface' | 'groq' | 'gemini';

const PROVIDER_ENDPOINT: Record<AIProvider, string> = {
  huggingface: '/api/ai-detect',
  groq: '/api/ai-detect-groq',
  gemini: '/api/ai-detect-gemini',
};

// Helper to convert AudioBuffer to WAV base64
async function audioBufferToWavBase64(audioBuffer: AudioBuffer, startSec: number, durationSec: number): Promise<string> {
  const offlineCtx = new OfflineAudioContext(1, 16000 * durationSec, 16000);
  const source = offlineCtx.createBufferSource();
  source.buffer = audioBuffer;
  source.connect(offlineCtx.destination);
  source.start(0, startSec, durationSec);
  
  const renderedBuffer = await offlineCtx.startRendering();
  
  // Convert renderedBuffer to WAV format
  const length = renderedBuffer.length;
  const channelData = renderedBuffer.getChannelData(0);
  const wavBuffer = new ArrayBuffer(44 + length * 2);
  const view = new DataView(wavBuffer);
  
  // Write WAV Header
  const writeString = (view: DataView, offset: number, string: string) => {
    for (let i = 0; i < string.length; i++) {
      view.setUint8(offset + i, string.charCodeAt(i));
    }
  };
  
  writeString(view, 0, 'RIFF');
  view.setUint32(4, 36 + length * 2, true);
  writeString(view, 8, 'WAVE');
  writeString(view, 12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true); // 1 channel
  view.setUint32(24, 16000, true);
  view.setUint32(28, 16000 * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeString(view, 36, 'data');
  view.setUint32(40, length * 2, true);
  
  // Write PCM samples
  let offset = 44;
  for (let i = 0; i < length; i++) {
    const s = Math.max(-1, Math.min(1, channelData[i]));
    view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7FFF, true);
    offset += 2;
  }
  
  // Convert ArrayBuffer to Base64
  let binary = '';
  const bytes = new Uint8Array(wavBuffer);
  const len = bytes.byteLength;
  for (let i = 0; i < len; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

/**
 * Auto-detect moments using AI (HuggingFace, Groq, or Gemini)
 */
export async function autoDetectClipsAI(
  videoSource: File | string,
  customToken?: string,
  provider: AIProvider = 'huggingface',
  onProgress?: (progress: number) => void
): Promise<AutoDetectResult> {
  const audioContext = new AudioContext();

  let arrayBuffer: ArrayBuffer;
  if (typeof videoSource === 'string') {
    const response = await fetch(videoSource);
    arrayBuffer = await response.arrayBuffer();
  } else {
    if (videoSource.size > 500 * 1024 * 1024) {
      throw new Error("Ukuran file terlalu besar (>500MB). AI Smart Detect membutuhkan banyak RAM untuk memproses audio dari video sebesar ini dan dapat membuat browser crash. Mohon gunakan video yang lebih kecil atau potong secara manual.");
    }
    arrayBuffer = await videoSource.arrayBuffer();
  }

  try {
    const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
    const duration = audioBuffer.duration;
    
    // Process in 10-second chunks for the entire video duration
    const chunkDuration = 10;
    const segments: Array<{ start: number; end: number; score: number; label: string }> = [];
    const chunksToProcess = Math.ceil(duration / chunkDuration);
    let completedChunks = 0;

    const processChunk = async (i: number, retries = 3) => {
      const startSec = i * chunkDuration;
      const actualDuration = Math.min(chunkDuration, duration - startSec);
      
      if (actualDuration < 2) {
        return;
      }
      
      const base64Audio = await audioBufferToWavBase64(audioBuffer, startSec, actualDuration);
      
      try {
        const response = await fetch(PROVIDER_ENDPOINT[provider], {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ audioBase64: base64Audio, customToken }),
        });
        
        if (!response.ok) {
          if (response.status === 429 && retries > 0) {
            // Exponential backoff
            await new Promise((res) => setTimeout(res, 2000 * (4 - retries)));
            return processChunk(i, retries - 1);
          }
          throw new Error(`API Error: ${response.statusText}`);
        }
        
        const data = await response.json();
        if (data.result && Array.isArray(data.result)) {
          if (provider === 'groq' || provider === 'gemini') {
            // Groq/Gemini return {start, end, score, label} directly
            for (const item of data.result) {
              if (item.score > 0.2) {
                segments.push({
                  start: startSec + (item.start ?? 0),
                  end: startSec + (item.end ?? actualDuration),
                  score: item.score,
                  label: `AI Highlight`,
                });
              }
            }
          } else {
            // HuggingFace returns [{label, score}] emotion classification
            let emotionScore = 0;
            const targetEmotions = ['happy', 'surprised', 'angry', 'excited'];
            for (const item of data.result) {
              if (targetEmotions.includes(item.label.toLowerCase())) {
                emotionScore += item.score;
              }
            }
            if (emotionScore > 0.2) {
              segments.push({
                start: startSec,
                end: startSec + actualDuration,
                score: emotionScore,
                label: `AI Highlight`,
              });
            }
          }
        }
      } catch (err) {
        console.error('AI chunk processing failed:', err);
        // Continue to next chunk instead of aborting
      }
    };

    // Fix for the finally block above: wrapper to handle increments cleanly
    const safeProcessChunk = async (i: number) => {
      await processChunk(i, 3);
      completedChunks++;
      if (onProgress) onProgress(Math.round((completedChunks / chunksToProcess) * 100));
    };

    // Parallel execution with concurrency limit
    const CONCURRENCY = 4;
    let currentIndex = 0;

    const executeBatch = async () => {
      while (currentIndex < chunksToProcess) {
        const index = currentIndex++;
        await safeProcessChunk(index);
      }
    };

    const workers = [];
    for (let w = 0; w < CONCURRENCY; w++) {
      workers.push(executeBatch());
    }

    await Promise.all(workers);
    
    await audioContext.close();
    
    // Sort by score
    segments.sort((a, b) => b.score - a.score);
    const topSegments = segments.slice(0, 10);
    topSegments.sort((a, b) => a.start - b.start);
    
    topSegments.forEach((seg, i) => {
      seg.label = `AI Highlight ${i + 1}`;
    });
    
    // Fallback if AI found nothing
    if (topSegments.length === 0) {
      return generateEvenSplits(videoSource, 5, 10);
    }
    
    return { segments: topSegments };
  } catch (err) {
    console.error('Audio decoding failed in AI mode:', err);
    await audioContext.close();
    return generateEvenSplits(videoSource, 5, 10);
  }
}

/**
 * Auto-detect potential clip-worthy moments in a video by analyzing audio levels.
 * Uses the Web Audio API to decode audio and find peak energy sections.
 */
export async function autoDetectClips(
  videoSource: File | string,
  sensitivity: number = 0.5, // 0 = less clips, 1 = more clips
  minClipDuration: number = 5,
  maxClipDuration: number = 60
): Promise<AutoDetectResult> {
  const audioContext = new AudioContext();

  let arrayBuffer: ArrayBuffer;
  if (typeof videoSource === 'string') {
    const response = await fetch(videoSource);
    arrayBuffer = await response.arrayBuffer();
  } else {
    arrayBuffer = await videoSource.arrayBuffer();
  }

  try {
    const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
    const channelData = audioBuffer.getChannelData(0);
    const sampleRate = audioBuffer.sampleRate;
    const duration = audioBuffer.duration;

    // Analyze audio in chunks of 0.5 seconds
    const chunkSize = Math.floor(sampleRate * 0.5);
    const chunks: number[] = [];

    for (let i = 0; i < channelData.length; i += chunkSize) {
      const end = Math.min(i + chunkSize, channelData.length);
      let sum = 0;
      for (let j = i; j < end; j++) {
        sum += channelData[j] * channelData[j]; // RMS energy
      }
      chunks.push(Math.sqrt(sum / (end - i)));
    }

    // Normalize energy values
    const maxEnergy = Math.max(...chunks, 0.001);
    const normalized = chunks.map((c) => c / maxEnergy);

    // Dynamic threshold based on sensitivity
    // Lower sensitivity = higher threshold = fewer clips
    const avgEnergy = normalized.reduce((a, b) => a + b, 0) / normalized.length;
    const threshold = avgEnergy + (1 - sensitivity) * (1 - avgEnergy) * 0.5;

    // Find segments above threshold
    const segments: Array<{ start: number; end: number; score: number; label: string }> = [];
    let inSegment = false;
    let segStart = 0;
    let segPeakScore = 0;

    for (let i = 0; i < normalized.length; i++) {
      const time = (i * 0.5);
      if (normalized[i] >= threshold && !inSegment) {
        inSegment = true;
        segStart = Math.max(0, time - 2); // Start 2s before peak
        segPeakScore = normalized[i];
      } else if (normalized[i] >= threshold && inSegment) {
        segPeakScore = Math.max(segPeakScore, normalized[i]);
      } else if (normalized[i] < threshold && inSegment) {
        inSegment = false;
        let segEnd = Math.min(duration, time + 2); // End 2s after peak
        let segDuration = segEnd - segStart;

        // Enforce min/max duration
        if (segDuration < minClipDuration) {
          const padding = (minClipDuration - segDuration) / 2;
          segStart = Math.max(0, segStart - padding);
          segEnd = Math.min(duration, segEnd + padding);
          segDuration = segEnd - segStart;
        }
        if (segDuration > maxClipDuration) {
          segEnd = segStart + maxClipDuration;
        }

        // Merge with previous if overlapping
        if (segments.length > 0) {
          const last = segments[segments.length - 1];
          if (segStart <= last.end + 1) {
            last.end = Math.min(duration, Math.max(last.end, segEnd));
            last.score = Math.max(last.score, segPeakScore);
            if (last.end - last.start > maxClipDuration) {
              last.end = last.start + maxClipDuration;
            }
            continue;
          }
        }

        segments.push({
          start: Math.round(segStart * 10) / 10,
          end: Math.round(segEnd * 10) / 10,
          score: segPeakScore,
          label: `Highlight ${segments.length + 1}`,
        });
      }
    }

    // Handle if still in segment at end
    if (inSegment) {
      const segEnd = Math.min(duration, (normalized.length * 0.5) + 2);
      if (segEnd - segStart >= minClipDuration) {
        segments.push({
          start: Math.round(segStart * 10) / 10,
          end: Math.round(Math.min(segStart + maxClipDuration, segEnd) * 10) / 10,
          score: segPeakScore,
          label: `Highlight ${segments.length + 1}`,
        });
      }
    }

    // Sort by score and limit to top 10
    segments.sort((a, b) => b.score - a.score);
    const topSegments = segments.slice(0, 10);

    // Re-sort by time
    topSegments.sort((a, b) => a.start - b.start);

    // Re-label
    topSegments.forEach((seg, i) => {
      seg.label = `Highlight ${i + 1}`;
    });

    await audioContext.close();
    return { segments: topSegments };
  } catch {
    // If audio decoding fails, fall back to even splitting
    await audioContext.close();
    return generateEvenSplits(videoSource, minClipDuration, maxClipDuration);
  }
}

/**
 * Fallback: split video into even segments
 */
async function generateEvenSplits(
  videoSource: File | string,
  minDuration: number,
  maxDuration: number
): Promise<AutoDetectResult> {
  // Try to get video duration from a temporary video element
  const duration = await getVideoDuration(videoSource);
  if (!duration || duration < minDuration) return { segments: [] };

  const clipDuration = Math.min(maxDuration, Math.max(minDuration, duration / 5));
  const segments: AutoDetectResult['segments'] = [];

  for (let start = 0; start + clipDuration <= duration && segments.length < 10; start += clipDuration * 1.5) {
    segments.push({
      start: Math.round(start * 10) / 10,
      end: Math.round(Math.min(start + clipDuration, duration) * 10) / 10,
      score: 0.5,
      label: `Segment ${segments.length + 1}`,
    });
  }

  return { segments };
}

function getVideoDuration(source: File | string): Promise<number> {
  return new Promise((resolve) => {
    const video = document.createElement('video');
    video.preload = 'metadata';
    video.onloadedmetadata = () => {
      resolve(video.duration);
      URL.revokeObjectURL(video.src);
    };
    video.onerror = () => resolve(0);

    if (typeof source === 'string') {
      video.src = source;
    } else {
      video.src = URL.createObjectURL(source);
    }
  });
}
