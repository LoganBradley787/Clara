import { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import type { SlideMetrics, SpeakingPace } from '../types';

interface MetricsPanelProps {
  metrics: SlideMetrics;
  duration: number;
  onFillerClick: () => void;
  onPauseClick: () => void;
}

const paceConfig: Record<SpeakingPace, { color: string; label: string }> = {
  slow: { color: 'var(--pace-slow)', label: 'Slow' },
  normal: { color: 'var(--pace-normal)', label: 'Normal' },
  fast: { color: 'var(--pace-fast)', label: 'Fast' },
};

export default function MetricsPanel({ metrics, duration, onFillerClick, onPauseClick }: MetricsPanelProps) {
  const [pausesExpanded, setPausesExpanded] = useState(false);
  const pace = paceConfig[metrics.speaking_pace];

  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(3, 1fr)',
        gap: 'var(--space-4)',
      }}
    >
      {/* WPM */}
      <div style={cellStyle}>
        <span className="category-label" style={labelStyle}>WPM</span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
          <span className="metric-value" style={valueStyle}>{Math.round(metrics.wpm)}</span>
          <span
            style={{
              display: 'inline-block',
              padding: '2px 8px',
              borderRadius: '9999px',
              background: pace.color,
              color: '#fff',
              fontFamily: 'var(--font-body)',
              fontWeight: 500,
              fontSize: 'var(--text-xs)',
              textTransform: 'uppercase',
              letterSpacing: '0.04em',
              lineHeight: 1.6,
            }}
          >
            {pace.label}
          </span>
        </div>
      </div>

      {/* Word count */}
      <div style={cellStyle}>
        <span className="category-label" style={labelStyle}>Words</span>
        <span className="metric-value" style={valueStyle}>{metrics.word_count}</span>
      </div>

      {/* Duration */}
      <div style={cellStyle}>
        <span className="category-label" style={labelStyle}>Duration</span>
        <span className="metric-value" style={valueStyle}>{duration.toFixed(1)}s</span>
      </div>

      {/* Filler Words */}
      <div
        style={{
          ...cellStyle,
          cursor: metrics.filler_words.count > 0 ? 'pointer' : 'default',
        }}
        onClick={metrics.filler_words.count > 0 ? onFillerClick : undefined}
        role={metrics.filler_words.count > 0 ? 'button' : undefined}
        tabIndex={metrics.filler_words.count > 0 ? 0 : undefined}
        onKeyDown={metrics.filler_words.count > 0 ? (e) => { if (e.key === 'Enter') onFillerClick(); } : undefined}
      >
        <span className="category-label" style={labelStyle}>Filler Words</span>
        {metrics.filler_words.count > 0 ? (
          <div>
            <span className="metric-value" style={valueStyle}>{metrics.filler_words.count}</span>
            <span style={{ color: 'var(--text-tertiary)', fontSize: 'var(--text-sm)', marginLeft: 'var(--space-2)' }}>
              ({[...new Set(metrics.filler_words.instances.map((f) => f.word))].join(', ')})
            </span>
          </div>
        ) : (
          <span style={emptyStyle}>No filler words detected</span>
        )}
      </div>

      {/* Pauses */}
      <div
        style={{
          ...cellStyle,
          ...(metrics.pauses.count > 0 ? pauseWarningCellStyle : {}),
          cursor: metrics.pauses.count > 0 ? 'pointer' : 'default',
        }}
        onClick={metrics.pauses.count > 0 ? () => { setPausesExpanded((p) => !p); onPauseClick(); } : undefined}
        role={metrics.pauses.count > 0 ? 'button' : undefined}
        tabIndex={metrics.pauses.count > 0 ? 0 : undefined}
        onKeyDown={metrics.pauses.count > 0 ? (e) => { if (e.key === 'Enter') { setPausesExpanded((p) => !p); onPauseClick(); } } : undefined}
      >
        <span className="category-label" style={metrics.pauses.count > 0 ? { color: 'var(--pause-warning)' } : labelStyle}>Pauses</span>
        {metrics.pauses.count > 0 ? (
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
              <span className="metric-value" style={{ ...valueStyle, color: 'var(--pause-warning)' }}>{metrics.pauses.count}</span>
              <span
                style={{
                  display: 'inline-block',
                  padding: '2px 8px',
                  borderRadius: '9999px',
                  background: 'var(--pause-warning)',
                  color: '#fff',
                  fontFamily: 'var(--font-body)',
                  fontWeight: 500,
                  fontSize: 'var(--text-xs)',
                  textTransform: 'uppercase',
                  letterSpacing: '0.04em',
                  lineHeight: 1.6,
                }}
              >
                {Math.max(...metrics.pauses.instances.map((p) => p.duration_seconds)).toFixed(1)}s longest
              </span>
            </div>
            <AnimatePresence>
              {pausesExpanded && (
                <motion.ul
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: 0.2 }}
                  style={{
                    listStyle: 'none',
                    marginTop: 'var(--space-2)',
                    overflow: 'hidden',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 'var(--space-1)',
                  }}
                >
                  {metrics.pauses.instances.map((p, i) => (
                    <li
                      key={i}
                      className="metric-value"
                      style={{
                        fontSize: 'var(--text-xs)',
                        color: 'var(--text-secondary)',
                      }}
                    >
                      {p.duration_seconds.toFixed(1)}s
                    </li>
                  ))}
                </motion.ul>
              )}
            </AnimatePresence>
          </div>
        ) : (
          <span style={emptyStyle}>No notable pauses</span>
        )}
      </div>

      {/* Repeated Phrases */}
      <div style={cellStyle}>
        <span className="category-label" style={labelStyle}>Repeated Phrases</span>
        {metrics.repeated_phrases.length > 0 ? (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--space-2)', marginTop: 'var(--space-1)' }}>
            {metrics.repeated_phrases.map((rp) => (
              <span
                key={rp.phrase}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 'var(--space-1)',
                  background: 'var(--bg-recessed)',
                  border: '1px solid var(--border-subtle)',
                  borderRadius: 'var(--radius-sm)',
                  padding: '2px 8px',
                  fontSize: 'var(--text-xs)',
                  fontFamily: 'var(--font-body)',
                  color: 'var(--text-secondary)',
                }}
              >
                {rp.phrase}
                <span
                  className="metric-value"
                  style={{
                    fontSize: '0.65rem',
                    background: 'var(--border-subtle)',
                    borderRadius: '9999px',
                    padding: '0 5px',
                    color: 'var(--text-primary)',
                    lineHeight: 1.6,
                  }}
                >
                  {rp.count}
                </span>
              </span>
            ))}
          </div>
        ) : (
          <span style={emptyStyle}>No repeated phrases</span>
        )}
      </div>
    </div>
  );
}

const cellStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 'var(--space-1)',
  padding: 'var(--space-3)',
  background: 'var(--bg-base)',
  borderRadius: 'var(--radius-md)',
  border: '1px solid var(--border-subtle)',
};

const labelStyle: React.CSSProperties = {
  color: 'var(--text-tertiary)',
};

const valueStyle: React.CSSProperties = {
  fontSize: 'var(--text-lg)',
  color: 'var(--text-primary)',
};

const emptyStyle: React.CSSProperties = {
  fontSize: 'var(--text-sm)',
  color: 'var(--text-tertiary)',
  fontStyle: 'italic',
};

const pauseWarningCellStyle: React.CSSProperties = {
  background: 'var(--pause-warning-bg)',
  border: '1px solid var(--pause-warning-border)',
  boxShadow: 'inset 3px 0 0 var(--pause-warning)',
};
