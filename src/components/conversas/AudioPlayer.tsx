'use client';

import { useEffect, useRef, useState } from 'react';
import type { KeyboardEvent as ReactKeyboardEvent, MouseEvent as ReactMouseEvent, ReactNode } from 'react';

function formatAudioTime(totalSeconds: number | null | undefined): string {
  if (typeof totalSeconds !== 'number' || !Number.isFinite(totalSeconds) || totalSeconds < 0) {
    return '--:--';
  }
  const total = Math.floor(totalSeconds);
  const seconds = String(total % 60).padStart(2, '0');
  const minutes = Math.floor(total / 60);
  if (minutes < 60) return `${minutes}:${seconds}`;
  return `${Math.floor(minutes / 60)}:${String(minutes % 60).padStart(2, '0')}:${seconds}`;
}

/** Player compacto no padrão WhatsApp: play/pause, barra arrastável/navegável por teclado, tempo. */
export function AudioPlayer({
  src,
  initialDurationSeconds,
  ariaLabel,
  onError,
  trailingSlot,
}: {
  src: string;
  initialDurationSeconds?: number | null;
  ariaLabel?: string;
  onError?: () => void;
  trailingSlot?: ReactNode;
}) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [playing, setPlaying] = useState(false);
  const [loading, setLoading] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(initialDurationSeconds ?? 0);

  useEffect(() => {
    setPlaying(false);
    setLoading(false);
    setCurrentTime(0);
    setDuration(initialDurationSeconds ?? 0);
  }, [src, initialDurationSeconds]);

  useEffect(() => {
    const audio = audioRef.current;
    return () => {
      audio?.pause();
    };
  }, [src]);

  function togglePlay() {
    const audio = audioRef.current;
    if (!audio) return;
    if (playing) {
      audio.pause();
      return;
    }
    setLoading(true);
    audio.play().catch(() => {
      setLoading(false);
      onError?.();
    });
  }

  function seekFromRatio(ratio: number) {
    const audio = audioRef.current;
    if (!audio || !duration) return;
    const clamped = Math.min(1, Math.max(0, ratio));
    audio.currentTime = clamped * duration;
    setCurrentTime(audio.currentTime);
  }

  function handleSeekClick(event: ReactMouseEvent<HTMLDivElement>) {
    const rect = event.currentTarget.getBoundingClientRect();
    if (rect.width <= 0) return;
    seekFromRatio((event.clientX - rect.left) / rect.width);
  }

  function handleSeekKeyDown(event: ReactKeyboardEvent<HTMLDivElement>) {
    if (!duration) return;
    const step = duration > 0 ? Math.max(1, duration / 20) : 1;
    if (event.key === 'ArrowRight' || event.key === 'ArrowUp') {
      event.preventDefault();
      seekFromRatio((currentTime + step) / duration);
    } else if (event.key === 'ArrowLeft' || event.key === 'ArrowDown') {
      event.preventDefault();
      seekFromRatio((currentTime - step) / duration);
    } else if (event.key === 'Home') {
      event.preventDefault();
      seekFromRatio(0);
    } else if (event.key === 'End') {
      event.preventDefault();
      seekFromRatio(1);
    }
  }

  const progressPercent = duration > 0 ? Math.min(100, (currentTime / duration) * 100) : 0;
  const timeLabel = `${formatAudioTime(currentTime)} / ${formatAudioTime(duration)}`;

  return (
    <div className="flex items-center gap-2 rounded-full bg-black/5 py-1.5 pl-1.5 pr-2 dark:bg-white/5">
      <button
        type="button"
        onClick={togglePlay}
        disabled={loading}
        aria-busy={loading}
        aria-label={playing ? 'Pausar áudio' : (ariaLabel ?? 'Reproduzir áudio')}
        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary text-white outline-none transition hover:brightness-110 focus-visible:ring-2 focus-visible:ring-primary/40 disabled:opacity-60"
      >
        {loading ? (
          <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white" aria-hidden="true" />
        ) : playing ? (
          <svg viewBox="0 0 20 20" fill="currentColor" aria-hidden="true" className="h-4 w-4">
            <rect x="5" y="4" width="3.2" height="12" rx="1" />
            <rect x="11.8" y="4" width="3.2" height="12" rx="1" />
          </svg>
        ) : (
          <svg viewBox="0 0 20 20" fill="currentColor" aria-hidden="true" className="ml-0.5 h-4 w-4">
            <path d="M6 4.2a1 1 0 0 1 1.53-.85l8.2 5.8a1 1 0 0 1 0 1.7l-8.2 5.8A1 1 0 0 1 6 15.8V4.2Z" />
          </svg>
        )}
      </button>

      <div className="min-w-0 flex-1">
        <div
          role="slider"
          tabIndex={0}
          aria-label="Progresso do áudio"
          aria-valuemin={0}
          aria-valuemax={Math.max(0, Math.round(duration))}
          aria-valuenow={Math.round(currentTime)}
          aria-valuetext={timeLabel}
          onClick={handleSeekClick}
          onKeyDown={handleSeekKeyDown}
          className="group relative h-1.5 w-full cursor-pointer touch-none rounded-full bg-black/15 outline-none focus-visible:ring-2 focus-visible:ring-primary/40 dark:bg-white/15"
        >
          <div className="absolute inset-y-0 left-0 rounded-full bg-primary" style={{ width: `${progressPercent}%` }} />
          <div
            className="absolute top-1/2 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full bg-primary opacity-0 shadow transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100"
            style={{ left: `${progressPercent}%` }}
          />
        </div>
        <span className="mt-1 block text-[11px] tabular-nums text-gray-500 dark:text-gray-400">{timeLabel}</span>
      </div>

      {trailingSlot}

      <audio
        ref={audioRef}
        preload="none"
        src={src}
        className="hidden"
        onPlay={() => {
          setPlaying(true);
          setLoading(false);
        }}
        onPause={() => setPlaying(false)}
        onEnded={() => {
          setPlaying(false);
          setCurrentTime(0);
        }}
        onLoadedMetadata={(event) => setDuration(event.currentTarget.duration || initialDurationSeconds || 0)}
        onTimeUpdate={(event) => setCurrentTime(event.currentTarget.currentTime)}
        onCanPlay={() => setLoading(false)}
        onError={() => {
          setLoading(false);
          setPlaying(false);
          onError?.();
        }}
      >
        Seu navegador não suporta reprodução de áudio.
      </audio>
    </div>
  );
}
