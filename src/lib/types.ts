export interface Clip {
  id: string;
  startTime: number; // seconds
  endTime: number; // seconds
  label: string;
  color: string;
  thumbnail?: string;
  selected?: boolean;
}

export interface VideoSource {
  type: 'file' | 'youtube';
  file?: File;
  url?: string;
  objectUrl?: string;
  title: string;
  duration: number; // seconds
  thumbnail?: string;
}

export interface ExportProgress {
  clipId: string;
  progress: number; // 0-100
  status: 'pending' | 'processing' | 'done' | 'error';
  downloadUrl?: string;
  error?: string;
}

export interface YouTubeInfo {
  title: string;
  duration: number;
  thumbnail: string;
  author: string;
}

export interface AutoDetectResult {
  segments: Array<{
    start: number;
    end: number;
    score: number; // 0-1 confidence
    label: string;
  }>;
}

export type Language = 'id' | 'en';

export type AIProvider = 'huggingface' | 'groq' | 'gemini';
