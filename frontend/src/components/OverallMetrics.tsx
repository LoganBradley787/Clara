import type { OverallMetrics as OverallMetricsType } from '../types';

interface OverallMetricsProps {
  metrics: OverallMetricsType;
  onNewPresentation: () => void;
  onPracticeAgain?: () => void;
}

function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

function formatDeviation(dev: number): string {
  const sign = dev >= 0 ? '+' : '';
  return `(${sign}${Math.round(dev)}s)`;
}

export default function OverallMetrics({ metrics, onNewPresentation, onPracticeAgain }: OverallMetricsProps) {
  return (
    <div
      className="bg-deep-gradient"
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: 'var(--space-4) var(--space-6)',
        borderRadius: 'var(--radius-lg)',
        gap: 'var(--space-5)',
        flexWrap: 'wrap',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-7)', flexWrap: 'wrap' }}>
        <MetricCell label="Avg WPM" value={Math.round(metrics.average_wpm).toString()} />
        <MetricCell
          label="Duration"
          value={`${formatDuration(metrics.actual_duration_seconds)} / ${formatDuration(metrics.expected_duration_seconds)}`}
          suffix={formatDeviation(metrics.duration_deviation_seconds)}
        />
        <MetricCell label="Filler Words" value={metrics.total_filler_count.toString()} />
        <MetricCell label="Pauses" value={metrics.total_pause_count.toString()} />
      </div>

      <div style={{ display: 'flex', gap: 'var(--space-2)', flexWrap: 'wrap' }}>
        {onPracticeAgain && (
          <button
            onClick={onPracticeAgain}
            style={{
              fontFamily: 'var(--font-body)',
              fontSize: 'var(--text-sm)',
              fontWeight: 500,
              color: 'var(--text-on-dark)',
              background: 'var(--accent)',
              border: '1px solid rgba(250, 246, 241, 0.2)',
              borderRadius: 'var(--radius-md)',
              padding: 'var(--space-2) var(--space-4)',
              cursor: 'pointer',
              transition: 'background 150ms ease',
              whiteSpace: 'nowrap',
            }}
            onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--accent-hover)')}
            onMouseLeave={(e) => (e.currentTarget.style.background = 'var(--accent)')}
          >
            Practice Again
          </button>
        )}
        <button
          onClick={onNewPresentation}
          style={{
            fontFamily: 'var(--font-body)',
            fontSize: 'var(--text-sm)',
            fontWeight: 500,
            color: 'var(--text-on-dark)',
            background: 'rgba(250, 246, 241, 0.1)',
            border: '1px solid rgba(250, 246, 241, 0.2)',
            borderRadius: 'var(--radius-md)',
            padding: 'var(--space-2) var(--space-4)',
            cursor: 'pointer',
            transition: 'background 150ms ease',
            whiteSpace: 'nowrap',
          }}
          onMouseEnter={(e) => (e.currentTarget.style.background = 'rgba(250, 246, 241, 0.18)')}
          onMouseLeave={(e) => (e.currentTarget.style.background = 'rgba(250, 246, 241, 0.1)')}
        >
          New Presentation
        </button>
      </div>
    </div>
  );
}

function MetricCell({ label, value, suffix }: { label: string; value: string; suffix?: string }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-1)' }}>
      <span
        className="category-label"
        style={{ color: 'var(--text-on-dark-muted)', fontSize: 'var(--text-xs)' }}
      >
        {label}
      </span>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 'var(--space-2)' }}>
        <span
          className="metric-value"
          style={{ color: 'var(--text-on-dark)', fontSize: 'var(--text-xl)' }}
        >
          {value}
        </span>
        {suffix && (
          <span
            className="metric-value"
            style={{ color: 'var(--text-on-dark-muted)', fontSize: 'var(--text-sm)' }}
          >
            {suffix}
          </span>
        )}
      </div>
    </div>
  );
}
