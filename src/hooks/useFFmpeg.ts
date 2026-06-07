'use client';

import { useState, useRef, useCallback, useEffect } from 'react';
import { FFmpeg } from '@ffmpeg/ffmpeg';
import { toBlobURL, fetchFile } from '@ffmpeg/util';
import { Clip, ExportProgress } from '@/lib/types';
import { formatFFmpegTime } from '@/lib/utils';

export function useFFmpeg() {
  const ffmpegRef = useRef<FFmpeg | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState(0);

  const load = useCallback(async () => {
    if (loaded || loading) return;
    setLoading(true);
    try {
      const ffmpeg = new FFmpeg();
      ffmpegRef.current = ffmpeg;

      const baseURL = 'https://cdn.jsdelivr.net/npm/@ffmpeg/core@0.12.10/dist/esm';

      ffmpeg.on('progress', ({ progress: p }) => {
        setProgress(Math.max(0, Math.min(100, Math.round(p * 100))));
      });

      await ffmpeg.load({
        coreURL: await toBlobURL(`${baseURL}/ffmpeg-core.js`, 'text/javascript'),
        wasmURL: await toBlobURL(`${baseURL}/ffmpeg-core.wasm`, 'application/wasm'),
      });

      setLoaded(true);
    } catch (err) {
      console.error('Failed to load FFmpeg:', err);
      throw err;
    } finally {
      setLoading(false);
    }
  }, [loaded, loading]);

  const clipVideo = useCallback(
    async (
      videoSource: File | string,
      clip: Clip
    ): Promise<string> => {
      const ffmpeg = ffmpegRef.current;
      if (!ffmpeg) throw new Error('FFmpeg not loaded');

      const inputName = 'input_video.mp4';
      const outputName = `clip_${clip.id}.mp4`;

      // Write input
      if (typeof videoSource === 'string') {
        // It's a blob URL or object URL - fetch it
        const response = await fetch(videoSource);
        const blob = await response.blob();
        const arrayBuffer = await blob.arrayBuffer();
        await ffmpeg.writeFile(inputName, new Uint8Array(arrayBuffer));
      } else {
        await ffmpeg.writeFile(inputName, await fetchFile(videoSource));
      }

      setProgress(0);

      // Crop center to 9:16 aspect ratio and scale to 1080x1920 (Reels/Shorts format)
      // Note: Re-encoding is required for cropping, which takes longer than stream copy
      await ffmpeg.exec([
        '-i', inputName,
        '-ss', formatFFmpegTime(clip.startTime),
        '-to', formatFFmpegTime(clip.endTime),
        '-vf', 'crop=ih*9/16:ih,scale=1080:1920',
        '-c:v', 'libx264',
        '-preset', 'ultrafast',
        '-crf', '28', // Good balance of quality and speed
        '-c:a', 'aac', // Re-encode audio to ensure compatibility
        '-avoid_negative_ts', 'make_zero',
        outputName,
      ]);

      // Clean up input first to save memory
      await ffmpeg.deleteFile(inputName);

      // Read output
      const data = await ffmpeg.readFile(outputName);
      await ffmpeg.deleteFile(outputName);

      const blob = new Blob([data as any], { type: 'video/mp4' });
      return URL.createObjectURL(blob);
    },
    []
  );

  const generateThumbnail = useCallback(
    async (videoSource: File | string, timestamp: number): Promise<string> => {
      const ffmpeg = ffmpegRef.current;
      if (!ffmpeg) throw new Error('FFmpeg not loaded');

      const inputName = 'thumb_input.mp4';
      const outputName = 'thumbnail.jpg';

      if (typeof videoSource === 'string') {
        const response = await fetch(videoSource);
        const blob = await response.blob();
        const arrayBuffer = await blob.arrayBuffer();
        await ffmpeg.writeFile(inputName, new Uint8Array(arrayBuffer));
      } else {
        await ffmpeg.writeFile(inputName, await fetchFile(videoSource));
      }

      await ffmpeg.exec([
        '-ss', formatFFmpegTime(timestamp),
        '-i', inputName,
        '-frames:v', '1',
        '-q:v', '5',
        '-vf', 'scale=160:-1',
        outputName,
      ]);

      await ffmpeg.deleteFile(inputName);
      const data = await ffmpeg.readFile(outputName);
      await ffmpeg.deleteFile(outputName);

      const blob = new Blob([data as any], { type: 'image/jpeg' });
      return URL.createObjectURL(blob);
    },
    []
  );

  const exportClips = useCallback(
    async (
      videoSource: File | string,
      clips: Clip[],
      onProgress: (progresses: ExportProgress[]) => void
    ): Promise<ExportProgress[]> => {
      if (!ffmpegRef.current) {
        await load();
      }

      const results: ExportProgress[] = clips.map((c) => ({
        clipId: c.id,
        progress: 0,
        status: 'pending' as const,
      }));

      onProgress([...results]);

      for (let i = 0; i < clips.length; i++) {
        results[i] = { ...results[i], status: 'processing', progress: 0 };
        onProgress([...results]);

        try {
          const downloadUrl = await clipVideo(videoSource, clips[i]);
          results[i] = {
            ...results[i],
            status: 'done',
            progress: 100,
            downloadUrl,
          };
        } catch (err) {
          results[i] = {
            ...results[i],
            status: 'error',
            progress: 0,
            error: err instanceof Error ? err.message : 'Unknown error',
          };
        }
        onProgress([...results]);
      }

      return results;
    },
    [load, clipVideo]
  );

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      // Revoke any object URLs if needed
    };
  }, []);

  return {
    loaded,
    loading,
    progress,
    load,
    clipVideo,
    generateThumbnail,
    exportClips,
  };
}
