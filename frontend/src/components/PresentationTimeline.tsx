import { useCallback, useRef, useMemo } from 'react';
import type { PresentationResults, SlideResult } from '../types';

interface PresentationTimelineProps {
  results: PresentationResults;
  currentTime: number;
  duration: number;
  onSeek: (time: number) => void;
  onSlideSelect: (index: number) => void;
}

const paceColors: Record<string, string> = {
  slow: 'var(--pace-slow)',
  normal: 'var(--pace-normal)',
  fast: 'var(--pace-fast)',
};

export default function PresentationTimeline({
  results,
  currentTime,
  duration,
  onSeek,
  onSlideSelect,
}: PresentationTimelineProps) {
  const barRef = useRef<HTMLDivElement>(null);

  const slides = useMemo(() => {
    const entries: (SlideResult & { id: string })[] = [];
    for (let i = 0; i < results.total_slides; i++) {
      const key = `slide_${i}`;
      const s = results.slides[key];
      if (s) entries.push({ ...s, id: key });
    }
    return entries;
  }, [results]);

  const markers = useMemo(() => {
    const fillers: { time: number }[] = [];
    const pauses: { start: number; end: number }[] = [];

    for (const slide of slides) {
      for (const fi of slide.metrics.filler_words.instances) {
        fillers.push({ time: fi.timestamp });
      }
      for (const pi of slide.metrics.pauses.instances) {
        pauses.push({ start: pi.start, end: pi.end });
      }
    }
    return { fillers, pauses };
  }, [slides]);

  const handleClick = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (!barRef.current || !duration) return;
      const rect = barRef.current.getBoundingClientRect();
      const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
      const time = ratio * duration;
      onSeek(time);

      for (let i = slides.length - 1; i >= 0; i--) {
        if (time >= slides[i].start_time) {
          onSlideSelect(i);
          break;
        }
      }
    },
    [duration, onSeek, onSlideSelect, slides],
  );

  const playheadPct = duration > 0 ? (currentTime / duration) * 100 : 0;

  return (
    <div
      style={{
        background: 'var(--bg-elevated)',
        borderRadius: 'var(--radius-lg)',
        boxShadow: 'var(--shadow-sm)',
        padding: 'var(--space-3) var(--space-4)',
      }}
    >
      {/* Legend */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 'var(--space-4)',
          marginBottom: 'var(--space-2)',
          flexWrap: 'wrap',
        }}
      >
        <span
          className="category-label"
          style={{ color: 'var(--text-tertiary)', fontSize: 'var(--text-xs)' }}
        >
          Timeline
        </span>
        <div style={{ display: 'flex', gap: 'var(--space-3)', marginLeft: 'auto' }}>
          {(['slow', 'normal', 'fast'] as const).map((pace) => (
            <LegendDot key={pace} color={paceColors[pace]} label={pace} />
          ))}
          <LegendDot color="var(--accent)" label="filler" shape="diamond" />
          <LegendDot color="var(--pause-warning)" label="pause" shape="bar" />
        </div>
      </div>

      {/* Bar */}
      <div
        ref={barRef}
        onClick={handleClick}
        style={{
          position: 'relative',
          height: 28,
          borderRadius: 'var(--radius-md)',
          overflow: 'hidden',
          cursor: 'pointer',
          display: 'flex',
          background: 'var(--bg-recessed)',
        }}
      >
        {slides.map((slide, idx) => {
          const widthPct = duration > 0 ? ((slide.end_time - slide.start_time) / duration) * 100 : 0;
          return (
            <div
              key={slide.id}
              onClick={(e) => {
                e.stopPropagation();
                onSlideSelect(idx);
                onSeek(slide.start_time);
              }}
              title={`Slide ${idx + 1} — ${slide.metrics.speaking_pace} pace`}
              style={{
                width: `${widthPct}%`,
                height: '100%',
                background: paceColors[slide.metrics.speaking_pace] || paceColors.normal,
                opacity: 0.35,
                borderRight: idx < slides.length - 1 ? '1px solid var(--bg-elevated)' : 'none',
                position: 'relative',
                transition: 'opacity 120ms ease',
              }}
              onMouseEnter={(e) => { e.currentTarget.style.opacity = '0.55'; }}
              onMouseLeave={(e) => { e.currentTarget.style.opacity = '0.35'; }}
            >
              <span
                style={{
                  position: 'absolute',
                  bottom: 2,
                  left: '50%',
                  transform: 'translateX(-50%)',
                  fontSize: '0.55rem',
                  fontFamily: 'var(--font-mono)',
                  color: 'var(--text-primary)',
                  opacity: 0.6,
                  pointerEvents: 'none',
                  whiteSpace: 'nowrap',
                }}
              >
                {idx + 1}
              </span>
            </div>
          );
        })}

        {/* Pause markers */}
        {markers.pauses.map((p, i) => {
          const leftPct = duration > 0 ? (p.start / duration) * 100 : 0;
          const wPct = duration > 0 ? ((p.end - p.start) / duration) * 100 : 0;
          return (
            <div
              key={`pause-${i}`}
              style={{
                position: 'absolute',
                left: `${leftPct}%`,
                width: `${Math.max(wPct, 0.3)}%`,
                top: 0,
                bottom: 0,
                background: 'var(--pause-warning)',
                opacity: 0.25,
                pointerEvents: 'none',
              }}
            />
          );
        })}

        {/* Filler markers */}
        {markers.fillers.map((f, i) => {
          const leftPct = duration > 0 ? (f.time / duration) * 100 : 0;
          return (
            <div
              key={`filler-${i}`}
              style={{
                position: 'absolute',
                left: `${leftPct}%`,
                top: 3,
                width: 5,
                height: 5,
                background: 'var(--accent)',
                borderRadius: 1,
                transform: 'rotate(45deg) translateX(-50%)',
                pointerEvents: 'none',
                opacity: 0.7,
              }}
            />
          );
        })}

        {/* Playhead */}
        <div
          style={{
            position: 'absolute',
            left: `${playheadPct}%`,
            top: 0,
            bottom: 0,
            width: 2,
            background: 'var(--text-primary)',
            borderRadius: 1,
            pointerEvents: 'none',
            transition: 'left 60ms linear',
            zIndex: 2,
          }}
        />
      </div>
    </div>
  );
}

function LegendDot({
  color,
  label,
  shape = 'circle',
}: {
  color: string;
  label: string;
  shape?: 'circle' | 'diamond' | 'bar';
}) {
  const shapeStyle: React.CSSProperties =
    shape === 'diamond'
      ? { width: 6, height: 6, background: color, borderRadius: 1, transform: 'rotate(45deg)' }
      : shape === 'bar'
      ? { width: 10, height: 4, background: color, borderRadius: 2, opacity: 0.5 }
      : { width: 8, height: 8, background: color, borderRadius: '50%', opacity: 0.45 };

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
      <div style={shapeStyle} />
      <span
        style={{
          fontFamily: 'var(--font-body)',
          fontSize: '0.6rem',
          color: 'var(--text-tertiary)',
          textTransform: 'capitalize',
        }}
      >
        {label}
      </span>
    </div>
  );
}
