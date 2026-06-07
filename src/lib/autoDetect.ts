import { AutoDetectResult } from './types';

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
