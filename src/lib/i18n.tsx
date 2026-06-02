'use client';

import React, { createContext, useContext, useState, useCallback, ReactNode } from 'react';
import { Language } from './types';

type Translations = Record<string, Record<Language, string>>;

const translations: Translations = {
  // Header
  'app.title': { en: 'ClipForge', id: 'ClipForge' },
  'app.subtitle': { en: 'Free Video Clipper', id: 'Pemotong Video Gratis' },

  // Upload
  'upload.title': { en: 'Drop your video here', id: 'Letakkan video Anda di sini' },
  'upload.subtitle': { en: 'or click to browse files', id: 'atau klik untuk pilih file' },
  'upload.formats': { en: 'Supports MP4, WebM, MOV, AVI', id: 'Mendukung MP4, WebM, MOV, AVI' },
  'upload.or': { en: 'OR', id: 'ATAU' },
  'upload.youtube': { en: 'Paste YouTube URL', id: 'Tempel URL YouTube' },
  'upload.youtube.placeholder': { en: 'https://youtube.com/watch?v=...', id: 'https://youtube.com/watch?v=...' },
  'upload.youtube.button': { en: 'Load Video', id: 'Muat Video' },
  'upload.youtube.loading': { en: 'Loading video info...', id: 'Memuat info video...' },
  'upload.size.warning': { en: 'Large file! Processing may be slow on this device.', id: 'File besar! Pemrosesan mungkin lambat di perangkat ini.' },
  'upload.youtube.error': { en: 'Failed to load YouTube video. Please check the URL.', id: 'Gagal memuat video YouTube. Periksa URL-nya.' },

  // Player
  'player.play': { en: 'Play', id: 'Putar' },
  'player.pause': { en: 'Pause', id: 'Jeda' },

  // Timeline
  'timeline.title': { en: 'Timeline', id: 'Garis Waktu' },
  'timeline.zoom': { en: 'Zoom', id: 'Zoom' },
  'timeline.addClip': { en: 'Add Clip', id: 'Tambah Klip' },
  'timeline.addClipHint': { en: 'Click to mark a new clip at current position', id: 'Klik untuk menandai klip baru di posisi saat ini' },

  // Auto Detect
  'autoDetect.title': { en: 'Auto-Detect Clips', id: 'Deteksi Otomatis Klip' },
  'autoDetect.button': { en: 'Detect Highlights', id: 'Deteksi Momen Menarik' },
  'autoDetect.analyzing': { en: 'Analyzing audio...', id: 'Menganalisis audio...' },
  'autoDetect.found': { en: 'Found {count} potential clips', id: 'Ditemukan {count} klip potensial' },
  'autoDetect.none': { en: 'No highlights detected. Try manual clipping.', id: 'Tidak ada momen menarik terdeteksi. Coba potong manual.' },
  'autoDetect.sensitivity': { en: 'Sensitivity', id: 'Sensitivitas' },

  // Clips
  'clips.title': { en: 'Clips', id: 'Klip' },
  'clips.empty': { en: 'No clips yet. Add clips from the timeline above.', id: 'Belum ada klip. Tambahkan klip dari timeline di atas.' },
  'clips.preview': { en: 'Preview', id: 'Pratinjau' },
  'clips.delete': { en: 'Delete', id: 'Hapus' },
  'clips.duration': { en: 'Duration', id: 'Durasi' },

  // Export
  'export.title': { en: 'Export', id: 'Ekspor' },
  'export.all': { en: 'Export All Clips', id: 'Ekspor Semua Klip' },
  'export.single': { en: 'Export', id: 'Ekspor' },
  'export.download': { en: 'Download', id: 'Unduh' },
  'export.processing': { en: 'Processing...', id: 'Memproses...' },
  'export.pending': { en: 'Pending', id: 'Menunggu' },
  'export.done': { en: 'Done', id: 'Selesai' },
  'export.error': { en: 'Error', id: 'Gagal' },
  'export.loading.ffmpeg': { en: 'Loading video processor...', id: 'Memuat prosesor video...' },
  'export.progress': { en: 'Processing clip {current} of {total}', id: 'Memproses klip {current} dari {total}' },
  'export.downloadAll': { en: 'Download All', id: 'Unduh Semua' },

  // Footer
  'footer.free': { en: '100% Free', id: '100% Gratis' },
  'footer.clientside': { en: 'Client-side Processing', id: 'Diproses di Perangkat Anda' },
  'footer.noupload': { en: 'No Server Upload', id: 'Tanpa Upload ke Server' },
  'footer.privacy': { en: 'Your videos never leave your device', id: 'Video Anda tidak pernah meninggalkan perangkat Anda' },

  // General
  'general.close': { en: 'Close', id: 'Tutup' },
  'general.cancel': { en: 'Cancel', id: 'Batal' },
  'general.reset': { en: 'Start Over', id: 'Mulai Ulang' },
};

interface I18nContextType {
  language: Language;
  setLanguage: (lang: Language) => void;
  t: (key: string, params?: Record<string, string | number>) => string;
}

const I18nContext = createContext<I18nContextType | null>(null);

export function I18nProvider({ children }: { children: ReactNode }) {
  const [language, setLanguage] = useState<Language>('id');

  const t = useCallback(
    (key: string, params?: Record<string, string | number>) => {
      const entry = translations[key];
      if (!entry) return key;
      let text = entry[language] || entry['en'] || key;
      if (params) {
        Object.entries(params).forEach(([k, v]) => {
          text = text.replace(`{${k}}`, String(v));
        });
      }
      return text;
    },
    [language]
  );

  return (
    <I18nContext.Provider value={{ language, setLanguage, t }}>
      {children}
    </I18nContext.Provider>
  );
}

export function useI18n(): I18nContextType {
  const context = useContext(I18nContext);
  if (!context) throw new Error('useI18n must be used within I18nProvider');
  return context;
}
