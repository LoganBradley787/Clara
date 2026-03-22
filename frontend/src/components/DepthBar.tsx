import type { ObservationItem } from '../types';

interface DepthBarProps {
  observation: ObservationItem;
}

export default function DepthBar({ observation }: DepthBarProps) {
  const evidence = observation.evidence;
  if (!evidence) return null;

  const contentPct = evidence.content_pct as number;
  const timePct = evidence.time_pct as number;

  if (contentPct == null || timePct == null) return null;

  const maxPct = Math.max(contentPct, timePct, 1);

  return (
    <div
      style={{
        padding: 'var(--space-3) var(--space-4)',
        background: 'var(--bg-elevated)',
        borderRadius: 'var(--radius-md)',
        borderLeft: '3px solid var(--cat-depth-imbalance)',
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 'var(--space-2)',
          marginBottom: 'var(--space-2)',
        }}
      >
        <span
          style={{
            fontFamily: 'var(--font-body)',
            fontWeight: 600,
            fontSize: 'var(--text-xs)',
            textTransform: 'uppercase',
            letterSpacing: '0.04em',
            color: 'var(--cat-depth-imbalance)',
          }}
        >
          Depth imbalance
        </span>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {/* Content bar */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
          <span
            style={{
              fontFamily: 'var(--font-body)',
              fontSize: 'var(--text-xs)',
              color: 'var(--text-tertiary)',
              width: 52,
              textAlign: 'right',
              flexShrink: 0,
            }}
          >
            Content
          </span>
          <div
            style={{
              flex: 1,
              height: 8,
              background: 'var(--bg-recessed)',
              borderRadius: 4,
              overflow: 'hidden',
            }}
          >
            <div
              style={{
                width: `${(contentPct / maxPct) * 100}%`,
                height: '100%',
                background: 'var(--cat-depth-imbalance)',
                borderRadius: 4,
                opacity: 0.7,
              }}
            />
          </div>
          <span
            style={{
              fontFamily: 'var(--font-mono)',
              fontSize: 'var(--text-xs)',
              color: 'var(--text-secondary)',
              width: 36,
              flexShrink: 0,
            }}
          >
            {contentPct.toFixed(0)}%
          </span>
        </div>

        {/* Time bar */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
          <span
            style={{
              fontFamily: 'var(--font-body)',
              fontSize: 'var(--text-xs)',
              color: 'var(--text-tertiary)',
              width: 52,
              textAlign: 'right',
              flexShrink: 0,
            }}
          >
            Time
          </span>
          <div
            style={{
              flex: 1,
              height: 8,
              background: 'var(--bg-recessed)',
              borderRadius: 4,
              overflow: 'hidden',
            }}
          >
            <div
              style={{
                width: `${(timePct / maxPct) * 100}%`,
                height: '100%',
                background: 'var(--accent)',
                borderRadius: 4,
                opacity: 0.7,
              }}
            />
          </div>
          <span
            style={{
              fontFamily: 'var(--font-mono)',
              fontSize: 'var(--text-xs)',
              color: 'var(--text-secondary)',
              width: 36,
              flexShrink: 0,
            }}
          >
            {timePct.toFixed(0)}%
          </span>
        </div>
      </div>

      {observation.detail && (
        <p
          style={{
            marginTop: 'var(--space-2)',
            fontFamily: 'var(--font-body)',
            fontSize: 'var(--text-xs)',
            color: 'var(--text-secondary)',
            lineHeight: 1.5,
          }}
        >
          {observation.detail}
        </p>
      )}
    </div>
  );
}
