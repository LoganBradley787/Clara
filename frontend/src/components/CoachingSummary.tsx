import { motion } from 'motion/react';
import type { CoachingTip } from '../types';

interface CoachingSummaryProps {
  tips: CoachingTip[];
  onSlideClick?: (slideIndex: number) => void;
}

const tipIcons = ['01', '02', '03'];

export default function CoachingSummary({ tips, onSlideClick }: CoachingSummaryProps) {
  if (tips.length === 0) return null;

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 'var(--space-4)',
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 'var(--space-3)',
        }}
      >
        <h3
          style={{
            fontFamily: 'var(--font-display)',
            fontSize: 'var(--text-lg)',
            color: 'var(--text-primary)',
          }}
        >
          Clara's Debrief
        </h3>
        <span
          style={{
            fontFamily: 'var(--font-body)',
            fontSize: 'var(--text-xs)',
            color: 'var(--text-tertiary)',
            fontWeight: 500,
            letterSpacing: '0.04em',
            textTransform: 'uppercase',
          }}
        >
          Top {tips.length} priorities
        </span>
      </div>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: `repeat(${Math.min(tips.length, 3)}, 1fr)`,
          gap: 'var(--space-4)',
        }}
      >
        {tips.map((tip, i) => (
          <motion.div
            key={i}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.1, duration: 0.3 }}
            style={{
              background: 'var(--bg-base)',
              borderRadius: 'var(--radius-lg)',
              padding: 'var(--space-5)',
              border: '1px solid var(--border-subtle)',
              display: 'flex',
              flexDirection: 'column',
              gap: 'var(--space-3)',
              position: 'relative',
              overflow: 'hidden',
            }}
          >
            <div
              style={{
                position: 'absolute',
                top: 'var(--space-3)',
                right: 'var(--space-3)',
                fontFamily: 'var(--font-mono)',
                fontSize: 'var(--text-3xl)',
                fontWeight: 700,
                color: 'var(--accent-muted)',
                lineHeight: 1,
                userSelect: 'none',
              }}
            >
              {tipIcons[i]}
            </div>

            <h4
              style={{
                fontFamily: 'var(--font-body)',
                fontWeight: 600,
                fontSize: 'var(--text-base)',
                color: 'var(--accent)',
                lineHeight: 1.4,
                paddingRight: 'var(--space-7)',
              }}
            >
              {tip.title}
            </h4>

            <p
              style={{
                fontFamily: 'var(--font-body)',
                fontSize: 'var(--text-sm)',
                color: 'var(--text-secondary)',
                lineHeight: 1.6,
              }}
            >
              {tip.explanation}
            </p>

            {tip.slide_references.length > 0 && (
              <div
                style={{
                  display: 'flex',
                  flexWrap: 'wrap',
                  gap: 'var(--space-1)',
                  marginTop: 'auto',
                }}
              >
                {tip.slide_references.map((ref) => {
                  const idx = parseInt(ref.replace('slide_', ''), 10);
                  return (
                    <button
                      key={ref}
                      onClick={() => onSlideClick?.(idx)}
                      style={{
                        fontFamily: 'var(--font-mono)',
                        fontSize: '0.65rem',
                        padding: '2px 6px',
                        borderRadius: 'var(--radius-sm)',
                        border: '1px solid var(--border-subtle)',
                        background: 'var(--bg-elevated)',
                        color: 'var(--text-secondary)',
                        cursor: 'pointer',
                        transition: 'all 120ms ease',
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.background = 'var(--accent)';
                        e.currentTarget.style.color = 'var(--text-on-dark)';
                        e.currentTarget.style.borderColor = 'var(--accent)';
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.background = 'var(--bg-elevated)';
                        e.currentTarget.style.color = 'var(--text-secondary)';
                        e.currentTarget.style.borderColor = 'var(--border-subtle)';
                      }}
                    >
                      Slide {idx + 1}
                    </button>
                  );
                })}
              </div>
            )}
          </motion.div>
        ))}
      </div>
    </div>
  );
}
