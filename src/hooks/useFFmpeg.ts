'use client';

import { useState, useRef, useCallback, useEffect } from 'react';
import { FFmpeg } from '@ffmpeg/ffmpeg';
import { toBlobURL, fetchFile } from '@ffmpeg/util';
import { Clip, ExportProgress } from '@/lib/types';
import { formatFFmpegTime } from '@/lib/utils';

export function useFFmpeg() {
  const ffmpegRef = useRef<FFmpeg | null>(null);
  const loadPromiseRef = useRef<Promise<void> | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState(0);

  const load = useCallback(async () => {
    // If already loaded, return immediately
    if (ffmpegRef.current && loaded) return;
    // If load is in progress, wait for it
    if (loadPromiseRef.current) return loadPromiseRef.current;

    setLoading(true);
    loadPromiseRef.current = (async () => {
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
      setLoading(false);
      loadPromiseRef.current = null;
    })();

    try {
      await loadPromiseRef.current;
    } catch (err) {
      setLoading(false);
      loadPromiseRef.current = null;
      console.error('Failed to load FFmpeg:', err);
      throw err;
    }
  }, [loaded]);

  const clipVideo = useCallback(
    async (videoSource: File | string, clip: Clip, inputName: string): Promise<string> => {
      const ffmpeg = ffmpegRef.current;
      if (!ffmpeg) throw new Error('FFmpeg not loaded');

      const outputName = `clip_${clip.id}.mp4`;

      setProgress(0);

      // -ss before -i for fast seeking; -to is relative to -ss when used this way
      await ffmpeg.exec([
        '-ss', formatFFmpegTime(clip.startTime),
        '-i', inputName,
        '-t', formatFFmpegTime(clip.endTime - clip.startTime),
        '-vf', 'crop=ih*9/16:ih,scale=1080:1920',
        '-c:v', 'libx264',
        '-preset', 'ultrafast',
        '-crf', '28',
        '-threads', '4',
        '-c:a', 'aac',
        '-avoid_negative_ts', 'make_zero',
        outputName,
      ]);

      const data = await ffmpeg.readFile(outputName);
      await ffmpeg.deleteFile(outputName);

      const blob = new Blob([data as unknown as BlobPart], { type: 'video/mp4' });
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
        await ffmpeg.writeFile(inputName, new Uint8Array(await blob.arrayBuffer()));
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

      const blob = new Blob([data as unknown as BlobPart], { type: 'image/jpeg' });
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
      await load();

      const ffmpeg = ffmpegRef.current!;
      const inputName = 'input_video.mp4';

      // Write input once for all clips
      if (typeof videoSource === 'string') {
        const response = await fetch(videoSource);
        const blob = await response.blob();
        await ffmpeg.writeFile(inputName, new Uint8Array(await blob.arrayBuffer()));
      } else {
        await ffmpeg.writeFile(inputName, await fetchFile(videoSource));
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
          const downloadUrl = await clipVideo(videoSource, clips[i], inputName);
          results[i] = { ...results[i], status: 'done', progress: 100, downloadUrl };
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

      // Clean up input after all clips are processed
      await ffmpeg.deleteFile(inputName).catch(() => {});

      return results;
    },
    [load, clipVideo]
  );

  useEffect(() => {
    return () => {
      // nothing to clean up; object URLs are managed by the consumer
    };
  }, []);

  return { loaded, loading, progress, load, clipVideo, generateThumbnail, exportClips };
}
