import { useCallback, useRef } from 'react';
import type { UseAudioPlayerReturn } from '../hooks/useAudioPlayer';

interface AudioPlayerProps {
  player: UseAudioPlayerReturn;
}

function formatTime(s: number): string {
  if (!Number.isFinite(s) || s < 0) return '0:00';
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${m}:${sec.toString().padStart(2, '0')}`;
}

export default function AudioPlayer({ player }: AudioPlayerProps) {
  const barRef = useRef<HTMLDivElement>(null);
  const { isPlaying, currentTime, duration, isReady, toggle, seek } = player;

  const pct = duration > 0 ? (currentTime / duration) * 100 : 0;

  const handleBarClick = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (!barRef.current || !duration) return;
      const rect = barRef.current.getBoundingClientRect();
      const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
      seek(ratio * duration);
    },
    [duration, seek],
  );

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 'var(--space-3)',
        padding: 'var(--space-3) var(--space-4)',
        background: 'var(--bg-elevated)',
        borderRadius: 'var(--radius-lg)',
        boxShadow: 'var(--shadow-sm)',
      }}
    >
      <button
        onClick={toggle}
        disabled={!isReady}
        aria-label={isPlaying ? 'Pause' : 'Play'}
        style={{
          width: 36,
          height: 36,
          borderRadius: '50%',
          border: 'none',
          background: isReady ? 'var(--accent)' : 'var(--bg-recessed)',
          color: 'var(--text-on-dark)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          cursor: isReady ? 'pointer' : 'default',
          flexShrink: 0,
          transition: 'background 150ms ease',
        }}
      >
        {isPlaying ? (
          <svg width="14" height="14" viewBox="0 0 14 14" fill="currentColor">
            <rect x="2" y="1" width="3.5" height="12" rx="1" />
            <rect x="8.5" y="1" width="3.5" height="12" rx="1" />
          </svg>
        ) : (
          <svg width="14" height="14" viewBox="0 0 14 14" fill="currentColor">
            <path d="M3 1.5v11l9-5.5z" />
          </svg>
        )}
      </button>

      <span
        className="metric-value"
        style={{
          fontSize: 'var(--text-xs)',
          color: 'var(--text-secondary)',
          minWidth: 36,
          textAlign: 'center',
        }}
      >
        {formatTime(currentTime)}
      </span>

      <div
        ref={barRef}
        onClick={handleBarClick}
        style={{
          flex: 1,
          height: 6,
          borderRadius: 3,
          background: 'var(--bg-recessed)',
          cursor: isReady ? 'pointer' : 'default',
          position: 'relative',
          overflow: 'hidden',
        }}
      >
        <div
          style={{
            position: 'absolute',
            left: 0,
            top: 0,
            bottom: 0,
            width: `${pct}%`,
            background: 'var(--accent)',
            borderRadius: 3,
            transition: isPlaying ? 'none' : 'width 100ms ease',
          }}
        />
      </div>

      <span
        className="metric-value"
        style={{
          fontSize: 'var(--text-xs)',
          color: 'var(--text-tertiary)',
          minWidth: 36,
          textAlign: 'center',
        }}
      >
        {formatTime(duration)}
      </span>
    </div>
  );
}
