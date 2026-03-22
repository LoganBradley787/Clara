import type { FeedbackItem, FeedbackType } from '../types';

interface FeedbackPanelProps {
  feedback: FeedbackItem[];
}

const typeColors: Record<FeedbackType, string> = {
  REPETITION: 'var(--cat-repetition)',
  HEDGE_STACK: 'var(--cat-hedge-stack)',
  FALSE_START: 'var(--cat-false-start)',
  SLIDE_READING: 'var(--cat-slide-reading)',
};

const typeLabels: Record<FeedbackType, string> = {
  REPETITION: 'repetition',
  HEDGE_STACK: 'hedge stack',
  FALSE_START: 'false start',
  SLIDE_READING: 'slide reading',
};

export default function FeedbackPanel({ feedback }: FeedbackPanelProps) {
  if (feedback.length === 0) {
    return (
      <p style={{ color: 'var(--text-tertiary)', fontStyle: 'italic', fontSize: 'var(--text-sm)' }}>
        No feedback generated for this slide.
      </p>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
      {feedback.map((item, i) => (
        <div
          key={i}
          style={{
            display: 'flex',
            alignItems: 'flex-start',
            gap: 'var(--space-3)',
            padding: 'var(--space-3)',
            borderRadius: 'var(--radius-md)',
            background: 'var(--bg-base)',
            borderLeft: `3px solid ${typeColors[item.type]}`,
          }}
        >
          <span
            className="category-label"
            style={{
              display: 'inline-block',
              padding: '2px 8px',
              borderRadius: '9999px',
              background: typeColors[item.type],
              color: '#fff',
              whiteSpace: 'nowrap',
              lineHeight: 1.6,
              flexShrink: 0,
            }}
          >
            {typeLabels[item.type]}
          </span>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
            <span
              style={{
                fontSize: 'var(--text-sm)',
                color: 'var(--text-primary)',
                fontWeight: 600,
                lineHeight: 1.5,
              }}
            >
              {item.text}
            </span>
            <span
              style={{
                fontSize: 'var(--text-sm)',
                color: 'var(--text-secondary)',
                lineHeight: 1.5,
              }}
            >
              {item.detail}
            </span>
          </div>
        </div>
      ))}
    </div>
  );
}
