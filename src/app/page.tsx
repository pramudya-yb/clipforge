'use client';

import React, { useState, useRef, useCallback, useEffect } from 'react';
import {
  Upload,
  Play,
  Pause,
  Volume2,
  VolumeX,
  Maximize,
  Plus,
  Trash2,
  Download,
  Eye,
  Wand2,
  RotateCcw,
  ChevronDown,
  ChevronUp,
  Loader2,
  CheckCircle2,
  AlertCircle,
  Clock,
  Scissors,
  X,
  ZoomIn,
  ZoomOut,
  Globe,
} from 'lucide-react';

const YoutubeIcon = ({ size = 24 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor">
    <path d="M19.615 3.184c-3.604-.246-11.631-.245-15.23 0C.488 3.45.029 5.804 0 12c.029 6.185.484 8.549 4.385 8.816 3.6.245 11.626.246 15.23 0C23.512 20.55 23.971 18.196 24 12c-.029-6.185-.484-8.549-4.385-8.816zM9 16V8l8 4-8 4z"/>
  </svg>
);
import { useI18n } from '@/lib/i18n';
import { useFFmpeg } from '@/hooks/useFFmpeg';
import { autoDetectClips, autoDetectClipsAI } from '@/lib/autoDetect';
import { Clip, VideoSource, ExportProgress } from '@/lib/types';
import {
  formatTime,
  generateId,
  getClipColor,
  getClipDuration,
  clamp,
  parseYouTubeUrl,
} from '@/lib/utils';

export default function HomePage() {
  const { t, language, setLanguage } = useI18n();
  const ffmpeg = useFFmpeg();

  // === STATE ===
  const [videoSource, setVideoSource] = useState<VideoSource | null>(null);
  const [clips, setClips] = useState<Clip[]>([]);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(1);
  const [isMuted, setIsMuted] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [dragTarget, setDragTarget] = useState<{ clipId: string; edge: 'start' | 'end' } | null>(null);
  const [zoom, setZoom] = useState(1);
  const [, setScrollLeft] = useState(0);
  const [youtubeUrl, setYoutubeUrl] = useState('');
  const [youtubeLoading, setYoutubeLoading] = useState(false);
  const [youtubeError, setYoutubeError] = useState('');
  const [dragOver, setDragOver] = useState(false);
  const [autoDetecting, setAutoDetecting] = useState(false);
  const [autoDetectExpanded, setAutoDetectExpanded] = useState(false);
  const [autoDetectMode, setAutoDetectMode] = useState<'standard' | 'ai'>('standard');
  const [hfToken, setHfToken] = useState('');
  const [serverHasToken, setServerHasToken] = useState<boolean | null>(null);
  const [sensitivity, setSensitivity] = useState(0.5);
  const [exportProgresses, setExportProgresses] = useState<ExportProgress[]>([]);
  const [isExporting, setIsExporting] = useState(false);
  const [activeClipId, setActiveClipId] = useState<string | null>(null);

  // === REFS ===
  const videoRef = useRef<HTMLVideoElement>(null);
  const timelineRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // === VIDEO PLAYER CONTROLS ===
  const togglePlay = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;
    if (video.paused) {
      video.play();
      setIsPlaying(true);
    } else {
      video.pause();
      setIsPlaying(false);
    }
  }, []);

  const handleTimeUpdate = useCallback(() => {
    const video = videoRef.current;
    if (video && !isDragging) {
      setCurrentTime(video.currentTime);
    }
  }, [isDragging]);

  const handleLoadedMetadata = useCallback(() => {
    const video = videoRef.current;
    if (video) {
      setDuration(video.duration);
      if (videoSource) {
        setVideoSource((prev) => prev ? { ...prev, duration: video.duration } : null);
      }
    }
  }, [videoSource]);

  const seekTo = useCallback((time: number) => {
    const video = videoRef.current;
    if (video) {
      video.currentTime = clamp(time, 0, video.duration);
      setCurrentTime(video.currentTime);
    }
  }, []);

  const handleSeek = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      seekTo(parseFloat(e.target.value));
    },
    [seekTo]
  );

  const handleVolumeChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const vol = parseFloat(e.target.value);
    setVolume(vol);
    setIsMuted(vol === 0);
    if (videoRef.current) videoRef.current.volume = vol;
  }, []);

  const toggleMute = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;
    if (isMuted) {
      video.volume = volume || 0.5;
      setIsMuted(false);
    } else {
      video.volume = 0;
      setIsMuted(true);
    }
  }, [isMuted, volume]);

  const toggleFullscreen = useCallback(() => {
    const video = videoRef.current;
    if (video) {
      if (document.fullscreenElement) {
        document.exitFullscreen();
      } else {
        video.requestFullscreen();
      }
    }
  }, []);

  // Check if server has HF token configured
  useEffect(() => {
    if (autoDetectMode === 'ai' && serverHasToken === null) {
      fetch('/api/ai-detect').then((r) => r.json()).then(({ hasToken }) => setServerHasToken(hasToken)).catch(() => setServerHasToken(false));
    }
  }, [autoDetectMode, serverHasToken]);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!videoSource) return;
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      switch (e.key) {
        case ' ':
          e.preventDefault();
          togglePlay();
          break;
        case 'ArrowLeft':
          e.preventDefault();
          seekTo(currentTime - 5);
          break;
        case 'ArrowRight':
          e.preventDefault();
          seekTo(currentTime + 5);
          break;
        case 'ArrowUp':
          e.preventDefault();
          handleVolumeChange({ target: { value: String(Math.min(1, volume + 0.1)) } } as React.ChangeEvent<HTMLInputElement>);
          break;
        case 'ArrowDown':
          e.preventDefault();
          handleVolumeChange({ target: { value: String(Math.max(0, volume - 0.1)) } } as React.ChangeEvent<HTMLInputElement>);
          break;
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [videoSource, togglePlay, seekTo, currentTime, handleVolumeChange, volume]);

  // === FILE UPLOAD ===
  const handleFileSelect = useCallback((file: File) => {
    const validTypes = ['video/mp4', 'video/webm', 'video/quicktime', 'video/x-msvideo', 'video/x-matroska'];
    if (!validTypes.includes(file.type) && !file.name.match(/\.(mp4|webm|mov|avi|mkv)$/i)) {
      alert('Unsupported file format. Please use MP4, WebM, MOV, AVI, or MKV.');
      return;
    }
    const objectUrl = URL.createObjectURL(file);
    setVideoSource({
      type: 'file',
      file,
      objectUrl,
      title: file.name,
      duration: 0,
    });
    setClips([]);
    setExportProgresses([]);
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragOver(false);
      const file = e.dataTransfer.files[0];
      if (file) handleFileSelect(file);
    },
    [handleFileSelect]
  );

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(true);
  }, []);

  const handleDragLeave = useCallback(() => {
    setDragOver(false);
  }, []);

  // === YOUTUBE ===
  const handleYoutubeLoad = useCallback(async () => {
    const videoId = parseYouTubeUrl(youtubeUrl);
    if (!videoId) {
      setYoutubeError(t('upload.youtube.error'));
      return;
    }

    setYoutubeLoading(true);
    setYoutubeError('');

    try {
      const res = await fetch(`/api/youtube/info?url=${encodeURIComponent(youtubeUrl)}`);
      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || 'Failed to load video');
      }

      // For YouTube, we use a proxy approach or embed
      // Since direct download requires server-side tools, we'll inform the user
      // to download the video first and upload it, or use the embed for preview
      setVideoSource({
        type: 'youtube',
        url: youtubeUrl,
        title: data.title,
        thumbnail: data.thumbnail,
        duration: 0,
        objectUrl: data.embedUrl,
      });
      setClips([]);
      setExportProgresses([]);
    } catch {
      setYoutubeError(t('upload.youtube.error'));
    } finally {
      setYoutubeLoading(false);
    }
  }, [youtubeUrl, t]);

  // === CLIPS MANAGEMENT ===
  const addClip = useCallback(() => {
    if (!duration) return;
    const clipDuration = Math.min(30, duration * 0.1);
    const startTime = clamp(currentTime, 0, duration - clipDuration);
    const endTime = clamp(startTime + clipDuration, startTime + 1, duration);

    const newClip: Clip = {
      id: generateId(),
      startTime: Math.round(startTime * 10) / 10,
      endTime: Math.round(endTime * 10) / 10,
      label: `Clip ${clips.length + 1}`,
      color: getClipColor(clips.length),
    };

    setClips((prev) => [...prev, newClip]);
    setActiveClipId(newClip.id);
  }, [currentTime, duration, clips.length]);

  const deleteClip = useCallback((id: string) => {
    setClips((prev) => prev.filter((c) => c.id !== id));
    if (activeClipId === id) setActiveClipId(null);
  }, [activeClipId]);

  const previewClip = useCallback(
    (clip: Clip) => {
      seekTo(clip.startTime);
      setActiveClipId(clip.id);
      const video = videoRef.current;
      if (video) {
        video.play();
        setIsPlaying(true);
        const checkEnd = () => {
          if (video.currentTime >= clip.endTime) {
            video.pause();
            setIsPlaying(false);
            video.removeEventListener('timeupdate', checkEnd);
          }
        };
        video.addEventListener('timeupdate', checkEnd);
      }
    },
    [seekTo]
  );

  // === TIMELINE INTERACTIONS ===
  const handleTimelineClick = useCallback(
    (e: React.MouseEvent) => {
      if (!timelineRef.current || !duration) return;
      const rect = timelineRef.current.getBoundingClientRect();
      const x = e.clientX - rect.left + timelineRef.current.scrollLeft;
      const totalWidth = rect.width * zoom;
      const time = (x / totalWidth) * duration;
      seekTo(clamp(time, 0, duration));
    },
    [duration, zoom, seekTo]
  );

  const handleClipDragStart = useCallback(
    (clipId: string, edge: 'start' | 'end') => (e: React.MouseEvent) => {
      e.stopPropagation();
      setIsDragging(true);
      setDragTarget({ clipId, edge });
    },
    []
  );

  useEffect(() => {
    if (!isDragging || !dragTarget) return;

    const handleMouseMove = (e: MouseEvent) => {
      if (!timelineRef.current || !duration) return;
      const rect = timelineRef.current.getBoundingClientRect();
      const x = e.clientX - rect.left + timelineRef.current.scrollLeft;
      const totalWidth = rect.width * zoom;
      const time = clamp((x / totalWidth) * duration, 0, duration);

      setClips((prev) =>
        prev.map((clip) => {
          if (clip.id !== dragTarget.clipId) return clip;
          if (dragTarget.edge === 'start') {
            return { ...clip, startTime: Math.round(Math.min(time, clip.endTime - 0.5) * 10) / 10 };
          } else {
            return { ...clip, endTime: Math.round(Math.max(time, clip.startTime + 0.5) * 10) / 10 };
          }
        })
      );
    };

    const handleMouseUp = () => {
      setIsDragging(false);
      setDragTarget(null);
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDragging, dragTarget, duration, zoom]);

  // === AUTO DETECT ===
  const handleAutoDetect = useCallback(async () => {
    if (!videoSource) return;

    setAutoDetecting(true);
    try {
      const source = videoSource.type === 'file' && videoSource.file
        ? videoSource.file
        : videoSource.objectUrl || '';

      const result = autoDetectMode === 'ai'
        ? await autoDetectClipsAI(source, hfToken)
        : await autoDetectClips(source, sensitivity);

      if (result.segments.length > 0) {
        const newClips: Clip[] = result.segments.map((seg, i) => ({
          id: generateId(),
          startTime: seg.start,
          endTime: seg.end,
          label: seg.label,
          color: getClipColor(clips.length + i),
        }));
        setClips((prev) => [...prev, ...newClips]);
      }
    } catch (err) {
      console.error('Auto-detect failed:', err);
    } finally {
      setAutoDetecting(false);
    }
  }, [videoSource, sensitivity, clips.length]);

  // === EXPORT ===
  const handleExportAll = useCallback(async () => {
    if (clips.length === 0 || !videoSource) return;

    setIsExporting(true);
    try {
      if (!ffmpeg.loaded) {
        await ffmpeg.load();
      }

      const source = videoSource.type === 'file' && videoSource.file
        ? videoSource.file
        : videoSource.objectUrl || '';

      await ffmpeg.exportClips(source, clips, (progresses) => {
        setExportProgresses(progresses);
      });
    } catch (err) {
      console.error('Export failed:', err);
    } finally {
      setIsExporting(false);
    }
  }, [clips, videoSource, ffmpeg]);

  const handleExportOne = useCallback(async (clip: Clip) => {
    if (!videoSource) return;
    const source = videoSource.type === 'file' && videoSource.file ? videoSource.file : videoSource.objectUrl || '';

    setIsExporting(true);
    try {
      await ffmpeg.exportClips(source, [clip], (progresses) => {
        setExportProgresses((prev) => {
          const merged = [...prev];
          for (const p of progresses) {
            const idx = merged.findIndex((x) => x.clipId === p.clipId);
            if (idx >= 0) merged[idx] = p;
            else merged.push(p);
          }
          return merged;
        });
      });
    } catch (err) {
      console.error('Export single clip failed:', err);
    } finally {
      setIsExporting(false);
    }
  }, [videoSource, ffmpeg]);

  const handleDownload = useCallback((url: string, filename: string) => {
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
  }, []);

  const handleReset = useCallback(() => {
    if (videoSource?.objectUrl && videoSource.type === 'file') {
      URL.revokeObjectURL(videoSource.objectUrl);
    }
    exportProgresses.forEach((ep) => {
      if (ep.downloadUrl) URL.revokeObjectURL(ep.downloadUrl);
    });
    setVideoSource(null);
    setClips([]);
    setExportProgresses([]);
    setCurrentTime(0);
    setDuration(0);
    setIsPlaying(false);
    setActiveClipId(null);
    setAutoDetectExpanded(false);
    setIsExporting(false);
  }, [videoSource, exportProgresses]);

  // === RENDER: UPLOAD SCREEN ===
  if (!videoSource) {
    return (
      <div className="app-container">
        <header className="header">
          <div className="header-inner">
            <div className="header-logo">
              <Scissors size={24} />
              <span className="header-logo-text">{t('app.title')}</span>
            </div>
            <div className="header-actions">
              <button
                className="language-toggle"
                onClick={() => setLanguage(language === 'id' ? 'en' : 'id')}
                title="Switch language"
              >
                <Globe size={14} />
                <span>{language === 'id' ? 'ID' : 'EN'}</span>
              </button>
            </div>
          </div>
        </header>

        <main className="upload-screen">
          <div className="upload-hero">
            <h1 className="upload-hero-title">
              <span className="gradient-text">{t('app.title')}</span>
            </h1>
            <p className="upload-hero-subtitle">{t('app.subtitle')}</p>
          </div>

          <div
            className={`upload-zone ${dragOver ? 'upload-zone--active' : ''}`}
            onDrop={handleDrop}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onClick={() => fileInputRef.current?.click()}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept="video/*,.mp4,.webm,.mov,.avi,.mkv"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) handleFileSelect(file);
              }}
              style={{ display: 'none' }}
            />
            <div className="upload-zone-icon">
              <Upload size={48} strokeWidth={1.5} />
            </div>
            <h2 className="upload-zone-title">{t('upload.title')}</h2>
            <p className="upload-zone-subtitle">{t('upload.subtitle')}</p>
            <p className="upload-zone-formats">{t('upload.formats')}</p>
          </div>

          <div className="upload-divider">
            <span>{t('upload.or')}</span>
          </div>

          <div className="upload-youtube">
            <div className="upload-youtube-icon">
              <YoutubeIcon size={24} />
            </div>
            <h3 className="upload-youtube-title">{t('upload.youtube')}</h3>
            <div className="upload-youtube-input-group">
              <input
                type="text"
                className="upload-youtube-input"
                placeholder={t('upload.youtube.placeholder')}
                value={youtubeUrl}
                onChange={(e) => {
                  setYoutubeUrl(e.target.value);
                  setYoutubeError('');
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleYoutubeLoad();
                }}
                onClick={(e) => e.stopPropagation()}
              />
              <button
                className="btn btn-primary"
                onClick={(e) => {
                  e.stopPropagation();
                  handleYoutubeLoad();
                }}
                disabled={youtubeLoading || !youtubeUrl}
              >
                {youtubeLoading ? (
                  <>
                    <Loader2 size={16} className="spin" /> {t('upload.youtube.loading')}
                  </>
                ) : (
                  t('upload.youtube.button')
                )}
              </button>
            </div>
            {youtubeError && (
              <p className="upload-youtube-error">
                <AlertCircle size={14} /> {youtubeError}
              </p>
            )}
          </div>

          <footer className="footer">
            <div className="footer-chips">
              <span className="footer-chip">✨ {t('footer.free')}</span>
              <span className="footer-chip">🔒 {t('footer.clientside')}</span>
              <span className="footer-chip">☁️ {t('footer.noupload')}</span>
            </div>
            <p className="footer-privacy">{t('footer.privacy')}</p>
          </footer>
        </main>
      </div>
    );
  }

  // === RENDER: WORKSPACE ===
  const isYoutube = videoSource.type === 'youtube';

  return (
    <div className="app-container">
      <header className="header">
        <div className="header-inner">
          <div className="header-logo">
            <Scissors size={24} />
            <span className="header-logo-text">{t('app.title')}</span>
          </div>
          <div className="header-center">
            <span className="header-video-title">{videoSource.title}</span>
          </div>
          <div className="header-actions">
            <button
              className="language-toggle"
              onClick={() => setLanguage(language === 'id' ? 'en' : 'id')}
            >
              <Globe size={14} />
              <span>{language === 'id' ? 'ID' : 'EN'}</span>
            </button>
            <button className="btn btn-secondary btn-sm" onClick={handleReset}>
              <RotateCcw size={14} />
              <span>{t('general.reset')}</span>
            </button>
          </div>
        </div>
      </header>

      <main className="workspace">
        {/* VIDEO PLAYER */}
        <section className="video-player-section">
          <div className="video-player">
            {isYoutube ? (
              <div className="video-player-youtube">
                <iframe
                  src={`${videoSource.objectUrl}?enablejsapi=1`}
                  title={videoSource.title}
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                  allowFullScreen
                  className="video-player-iframe"
                />
                <div className="video-player-youtube-notice">
                  <AlertCircle size={16} />
                  <span>
                    {language === 'id'
                      ? 'Untuk memotong video YouTube, silakan download videonya terlebih dahulu lalu upload ke sini.'
                      : 'To clip YouTube videos, please download the video first then upload it here.'}
                  </span>
                </div>
              </div>
            ) : (
              <>
                <video
                  ref={videoRef}
                  src={videoSource.objectUrl}
                  onTimeUpdate={handleTimeUpdate}
                  onLoadedMetadata={handleLoadedMetadata}
                  onEnded={() => setIsPlaying(false)}
                  onClick={togglePlay}
                  className="video-player-video"
                />
                <div className="player-controls">
                  <button className="btn btn-icon" onClick={togglePlay} title={isPlaying ? t('player.pause') : t('player.play')}>
                    {isPlaying ? <Pause size={18} /> : <Play size={18} />}
                  </button>

                  <span className="player-time">
                    {formatTime(currentTime)} / {formatTime(duration)}
                  </span>

                  <input
                    type="range"
                    className="player-seek"
                    min={0}
                    max={duration || 0}
                    step={0.1}
                    value={currentTime}
                    onChange={handleSeek}
                  />

                  <button className="btn btn-icon" onClick={toggleMute} title={isMuted ? 'Unmute' : 'Mute'}>
                    {isMuted ? <VolumeX size={18} /> : <Volume2 size={18} />}
                  </button>

                  <input
                    type="range"
                    className="player-volume"
                    min={0}
                    max={1}
                    step={0.05}
                    value={isMuted ? 0 : volume}
                    onChange={handleVolumeChange}
                  />

                  <button className="btn btn-icon" onClick={toggleFullscreen} title="Fullscreen">
                    <Maximize size={18} />
                  </button>
                </div>
              </>
            )}
          </div>
        </section>

        {/* TIMELINE - only for uploaded videos */}
        {!isYoutube && duration > 0 && (
          <section className="timeline-section">
            <div className="timeline-container">
              <div className="timeline-header">
                <h3 className="timeline-title">
                  <Clock size={16} />
                  {t('timeline.title')}
                </h3>
                <div className="timeline-zoom">
                  <button className="btn btn-icon btn-xs" onClick={() => setZoom((z) => Math.max(1, z - 0.5))}>
                    <ZoomOut size={14} />
                  </button>
                  <span className="timeline-zoom-label">{Math.round(zoom * 100)}%</span>
                  <button className="btn btn-icon btn-xs" onClick={() => setZoom((z) => Math.min(10, z + 0.5))}>
                    <ZoomIn size={14} />
                  </button>
                </div>
              </div>

              <div
                className="timeline-scroll-container"
                onScroll={(e) => setScrollLeft((e.target as HTMLDivElement).scrollLeft)}
              >
                <div
                  ref={timelineRef}
                  className="timeline-bar"
                  style={{ width: `${zoom * 100}%` }}
                  onClick={handleTimelineClick}
                >
                  {/* Time markers */}
                  <div className="timeline-markers">
                    {Array.from({ length: Math.ceil(duration / (duration > 600 ? 60 : duration > 60 ? 10 : 5)) + 1 }).map((_, i) => {
                      const interval = duration > 600 ? 60 : duration > 60 ? 10 : 5;
                      const time = i * interval;
                      if (time > duration) return null;
                      return (
                        <div
                          key={i}
                          className="timeline-marker"
                          style={{ left: `${(time / duration) * 100}%` }}
                        >
                          <span>{formatTime(time)}</span>
                        </div>
                      );
                    })}
                  </div>

                  {/* Clip regions */}
                  {clips.map((clip) => (
                    <div
                      key={clip.id}
                      className={`clip-region ${activeClipId === clip.id ? 'clip-region--active' : ''}`}
                      style={{
                        left: `${(clip.startTime / duration) * 100}%`,
                        width: `${((clip.endTime - clip.startTime) / duration) * 100}%`,
                        backgroundColor: `${clip.color}40`,
                        borderColor: clip.color,
                      }}
                      onClick={(e) => {
                        e.stopPropagation();
                        setActiveClipId(clip.id);
                        seekTo(clip.startTime);
                      }}
                    >
                      <div
                        className="clip-region-handle clip-region-handle--left"
                        style={{ backgroundColor: clip.color }}
                        onMouseDown={handleClipDragStart(clip.id, 'start')}
                      />
                      <span className="clip-region-label">{clip.label}</span>
                      <div
                        className="clip-region-handle clip-region-handle--right"
                        style={{ backgroundColor: clip.color }}
                        onMouseDown={handleClipDragStart(clip.id, 'end')}
                      />
                      <button
                        className="clip-region-delete"
                        onClick={(e) => {
                          e.stopPropagation();
                          deleteClip(clip.id);
                        }}
                      >
                        <X size={10} />
                      </button>
                    </div>
                  ))}

                  {/* Playhead */}
                  <div
                    className="timeline-playhead"
                    style={{ left: `${(currentTime / duration) * 100}%` }}
                  />
                </div>
              </div>

              {/* Timeline controls */}
              <div className="timeline-controls">
                <button className="btn btn-primary btn-sm" onClick={addClip}>
                  <Plus size={14} />
                  <span>{t('timeline.addClip')}</span>
                </button>

                <button
                  className="btn btn-secondary btn-sm"
                  onClick={() => setAutoDetectExpanded(!autoDetectExpanded)}
                >
                  <Wand2 size={14} />
                  <span>{t('autoDetect.title')}</span>
                  {autoDetectExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                </button>
              </div>

              {/* Auto-detect panel */}
              {autoDetectExpanded && (
                <div className="auto-detect-panel">
                  <div style={{ marginBottom: '12px', display: 'flex', gap: '15px', fontSize: '13px' }}>
                    <label style={{ display: 'flex', alignItems: 'center', gap: '5px', cursor: 'pointer' }}>
                      <input type="radio" checked={autoDetectMode === 'standard'} onChange={() => setAutoDetectMode('standard')} /> 
                      Standard (Fast)
                    </label>
                    <label style={{ display: 'flex', alignItems: 'center', gap: '5px', cursor: 'pointer' }}>
                      <input type="radio" checked={autoDetectMode === 'ai'} onChange={() => setAutoDetectMode('ai')} /> 
                      AI Emotion (HuggingFace)
                    </label>
                  </div>

                  {autoDetectMode === 'standard' ? (
                    <div className="auto-detect-sensitivity">
                      <label>{t('autoDetect.sensitivity')}</label>
                      <input
                        type="range"
                        min={0}
                        max={1}
                        step={0.1}
                        value={sensitivity}
                        onChange={(e) => setSensitivity(parseFloat(e.target.value))}
                      />
                      <span>{Math.round(sensitivity * 100)}%</span>
                    </div>
                  ) : (
                    <div style={{ marginBottom: '12px' }}>
                      {serverHasToken === false && (
                        <>
                          <label style={{ display: 'block', fontSize: '12px', marginBottom: '6px', color: 'var(--text-muted)' }}>
                            HuggingFace Token (Optional if server limit reached):
                          </label>
                          <input
                            type="password"
                            value={hfToken}
                            onChange={(e) => setHfToken(e.target.value)}
                            placeholder="hf_..."
                            style={{ width: '100%', padding: '8px', borderRadius: '6px', border: '1px solid var(--border)', background: 'var(--bg-glass)', color: 'white', fontSize: '13px' }}
                          />
                        </>
                      )}
                      {serverHasToken === true && (
                        <p style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: '6px' }}>
                          ✅ HuggingFace token sudah dikonfigurasi di server.
                        </p>
                      )}
                      <p style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '6px' }}>
                        AI will analyze the first 1 minute to find the highest emotional moments.
                      </p>
                    </div>
                  )}

                  <button
                    className="btn btn-primary"
                    onClick={handleAutoDetect}
                    disabled={autoDetecting}
                  >
                    {autoDetecting ? (
                      <>
                        <Loader2 size={16} className="spin" />
                        <span>{t('autoDetect.analyzing')}</span>
                      </>
                    ) : (
                      <>
                        <Wand2 size={16} />
                        <span>{t('autoDetect.button')}</span>
                      </>
                    )}
                  </button>
                </div>
              )}
            </div>
          </section>
        )}

        {/* BOTTOM PANELS */}
        {!isYoutube && duration > 0 && (
          <div className="bottom-panels">
            {/* CLIP LIST */}
            <section className="clip-list-section">
              <div className="clip-list">
                <div className="clip-list-header">
                  <h3>
                    <Scissors size={16} />
                    {t('clips.title')}
                    {clips.length > 0 && <span className="badge">{clips.length}</span>}
                  </h3>
                </div>

                {clips.length === 0 ? (
                  <div className="clip-list-empty">
                    <Scissors size={32} strokeWidth={1} />
                    <p>{t('clips.empty')}</p>
                  </div>
                ) : (
                  <div className="clip-list-items">
                    {clips.map((clip, index) => (
                      <div
                        key={clip.id}
                        className={`clip-card ${activeClipId === clip.id ? 'clip-card--active' : ''}`}
                        onClick={() => {
                          setActiveClipId(clip.id);
                          seekTo(clip.startTime);
                        }}
                      >
                        <div
                          className="clip-card-color"
                          style={{ backgroundColor: clip.color }}
                        />
                        <div className="clip-card-info">
                          <div className="clip-card-label">
                            <input
                              type="text"
                              value={clip.label}
                              onChange={(e) => {
                                setClips((prev) =>
                                  prev.map((c) =>
                                    c.id === clip.id ? { ...c, label: e.target.value } : c
                                  )
                                );
                              }}
                              onClick={(e) => e.stopPropagation()}
                              className="clip-card-label-input"
                            />
                          </div>
                          <div className="clip-card-time">
                            {formatTime(clip.startTime)} → {formatTime(clip.endTime)}
                          </div>
                          <div className="clip-card-duration">
                            {t('clips.duration')}: {formatTime(getClipDuration(clip))}
                          </div>
                        </div>
                        <div className="clip-card-actions">
                          <button
                            className="btn btn-icon btn-xs"
                            onClick={(e) => {
                              e.stopPropagation();
                              previewClip(clip);
                            }}
                            title={t('clips.preview')}
                          >
                            <Eye size={14} />
                          </button>
                          {(() => {
                            const ep = exportProgresses.find((p) => p.clipId === clip.id);
                            if (ep?.status === 'processing') return <Loader2 size={14} className="spin" />;
                            if (ep?.status === 'done' && ep.downloadUrl) return (
                              <button
                                className="btn btn-icon btn-xs"
                                onClick={(e) => { e.stopPropagation(); handleDownload(ep.downloadUrl!, `${clip.label}.mp4`); }}
                                title={t('export.download')}
                              >
                                <Download size={14} />
                              </button>
                            );
                            return (
                              <button
                                className="btn btn-icon btn-xs"
                                onClick={(e) => { e.stopPropagation(); handleExportOne(clip); }}
                                disabled={isExporting}
                                title="Export clip"
                              >
                                <Download size={14} />
                              </button>
                            );
                          })()}
                          <button
                            className="btn btn-icon btn-xs btn-danger"
                            onClick={(e) => {
                              e.stopPropagation();
                              deleteClip(clip.id);
                            }}
                            title={t('clips.delete')}
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </section>

            {/* EXPORT PANEL */}
            <section className="export-panel-section">
              <div className="export-panel">
                <div className="export-panel-header">
                  <h3>
                    <Download size={16} />
                    {t('export.title')}
                  </h3>
                </div>

                <button
                  className="btn btn-primary btn-lg export-btn"
                  onClick={handleExportAll}
                  disabled={clips.length === 0 || isExporting}
                >
                  {isExporting ? (
                    <>
                      <Loader2 size={20} className="spin" />
                      <span>{ffmpeg.loading ? t('export.loading.ffmpeg') : t('export.processing')}</span>
                    </>
                  ) : (
                    <>
                      <Download size={20} />
                      <span>{t('export.all')} ({clips.length})</span>
                    </>
                  )}
                </button>

                {/* Overall progress */}
                {isExporting && (
                  <div className="export-overall-progress">
                    <div className="progress-bar">
                      <div
                        className="progress-bar-fill"
                        style={{
                          width: `${exportProgresses.length > 0 ? (exportProgresses.filter((p) => p.status === 'done').length / exportProgresses.length) * 100 : 0}%`,
                        }}
                      />
                    </div>
                    <span className="export-progress-text">
                      {t('export.progress', {
                        current: exportProgresses.filter((p) => p.status === 'done').length,
                        total: exportProgresses.length,
                      })}
                    </span>
                  </div>
                )}

                {/* Export items */}
                {exportProgresses.length > 0 && (
                  <div className="export-items">
                    {exportProgresses.map((ep) => {
                      const clip = clips.find((c) => c.id === ep.clipId);
                      if (!clip) return null;
                      return (
                        <div key={ep.clipId} className="export-item">
                          <div className="export-item-info">
                            <div className="export-item-color" style={{ backgroundColor: clip.color }} />
                            <span className="export-item-name">{clip.label}</span>
                          </div>

                          <div className="export-item-status">
                            {ep.status === 'pending' && (
                              <span className="badge badge-muted">
                                <Clock size={12} /> {t('export.pending')}
                              </span>
                            )}
                            {ep.status === 'processing' && (
                              <span className="badge badge-processing">
                                <Loader2 size={12} className="spin" /> {t('export.processing')}
                              </span>
                            )}
                            {ep.status === 'done' && (
                              <span className="badge badge-success">
                                <CheckCircle2 size={12} /> {t('export.done')}
                              </span>
                            )}
                            {ep.status === 'error' && (
                              <span className="badge badge-error">
                                <AlertCircle size={12} /> {t('export.error')}
                              </span>
                            )}
                          </div>

                          {ep.status === 'processing' && (
                            <div className="progress-bar progress-bar-sm">
                              <div className="progress-bar-fill progress-bar-fill--shimmer" style={{ width: `${ffmpeg.progress}%` }} />
                            </div>
                          )}

                          {ep.status === 'done' && ep.downloadUrl && (
                            <button
                              className="btn btn-secondary btn-xs"
                              onClick={() => handleDownload(ep.downloadUrl!, `${clip.label}.mp4`)}
                            >
                              <Download size={12} />
                              <span>{t('export.download')}</span>
                            </button>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}

                {/* Download All */}
                {exportProgresses.length > 0 && exportProgresses.every((p) => p.status === 'done') && (
                  <button
                    className="btn btn-primary btn-sm export-download-all"
                    onClick={() => {
                      exportProgresses.forEach((ep) => {
                        const clip = clips.find((c) => c.id === ep.clipId);
                        if (ep.downloadUrl && clip) {
                          handleDownload(ep.downloadUrl, `${clip.label}.mp4`);
                        }
                      });
                    }}
                  >
                    <Download size={16} />
                    <span>{t('export.downloadAll')}</span>
                  </button>
                )}
              </div>
            </section>
          </div>
        )}

        {/* Footer */}
        <footer className="footer workspace-footer">
          <div className="footer-chips">
            <span className="footer-chip">✨ {t('footer.free')}</span>
            <span className="footer-chip">🔒 {t('footer.clientside')}</span>
            <span className="footer-chip">☁️ {t('footer.noupload')}</span>
          </div>
        </footer>
      </main>
    </div>
  );
}
