import type { ObservationItem } from '../types';

interface CoverageChecklistProps {
  observation: ObservationItem;
}

export default function CoverageChecklist({ observation }: CoverageChecklistProps) {
  const evidence = observation.evidence;
  if (!evidence) return null;

  const covered: string[] = evidence.concepts_covered ?? [];
  const missed: string[] = evidence.concepts_missed ?? [];
  const total = covered.length + missed.length;

  if (total === 0) return null;

  return (
    <div
      style={{
        padding: 'var(--space-3) var(--space-4)',
        background: 'var(--bg-elevated)',
        borderRadius: 'var(--radius-md)',
        borderLeft: '3px solid var(--cat-content-coverage)',
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
            color: 'var(--cat-content-coverage)',
          }}
        >
          Content coverage
        </span>
        <span
          style={{
            fontFamily: 'var(--font-mono)',
            fontSize: 'var(--text-xs)',
            color: 'var(--text-tertiary)',
          }}
        >
          {covered.length} of {total} concepts addressed
        </span>
      </div>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--space-1)' }}>
        {covered.map((concept, i) => (
          <span
            key={`c-${i}`}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 4,
              padding: '2px 8px',
              borderRadius: '9999px',
              background: 'rgba(74, 124, 89, 0.1)',
              border: '1px solid rgba(74, 124, 89, 0.25)',
              fontFamily: 'var(--font-body)',
              fontSize: 'var(--text-xs)',
              color: 'var(--cat-content-coverage)',
            }}
          >
            <span style={{ fontSize: '0.65rem' }}>&#10003;</span>
            {concept}
          </span>
        ))}
        {missed.map((concept, i) => (
          <span
            key={`m-${i}`}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 4,
              padding: '2px 8px',
              borderRadius: '9999px',
              background: 'rgba(161, 59, 59, 0.06)',
              border: '1px solid rgba(161, 59, 59, 0.2)',
              fontFamily: 'var(--font-body)',
              fontSize: 'var(--text-xs)',
              color: 'var(--text-tertiary)',
              textDecoration: 'line-through',
              textDecorationColor: 'rgba(161, 59, 59, 0.4)',
            }}
          >
            {concept}
          </span>
        ))}
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
