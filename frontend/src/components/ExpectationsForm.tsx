import { useState, useCallback, useEffect } from 'react';
import { motion } from 'motion/react';
import type { PresentationExpectations, Tone } from '../types';

interface ExpectationsFormProps {
  onSubmit: (expectations: PresentationExpectations) => void;
  onValidityChange?: (valid: boolean) => void;
  disabled?: boolean;
}

const TONE_OPTIONS: { value: Tone; label: string; description: string }[] = [
  { value: 'professional', label: 'Professional', description: 'Board rooms, client reviews, formal reports' },
  { value: 'conversational', label: 'Conversational', description: 'Team syncs, demos, casual updates' },
  { value: 'educational', label: 'Educational', description: 'Lectures, workshops, training sessions' },
  { value: 'persuasive', label: 'Persuasive', description: 'Pitches, proposals, fundraising asks' },
  { value: 'storytelling', label: 'Storytelling', description: 'Keynotes, narratives, personal talks' },
];

const CONTEXT_MAX = 500;

const fieldVariants = {
  initial: { opacity: 0, y: 12 },
  animate: { opacity: 1, y: 0 },
};

const staggerContainer = {
  animate: { transition: { staggerChildren: 0.1, delayChildren: 0.05 } },
};

export default function ExpectationsForm({ onSubmit, onValidityChange, disabled }: ExpectationsFormProps) {
  const [tone, setTone] = useState<Tone | ''>('');
  const [duration, setDuration] = useState('');
  const [context, setContext] = useState('');

  const [touched, setTouched] = useState({
    tone: false,
    duration: false,
    context: false,
  });

  const markTouched = useCallback((field: keyof typeof touched) => {
    setTouched((prev) => ({ ...prev, [field]: true }));
  }, []);

  const errors = {
    tone: touched.tone && !tone ? 'Select a presentation tone.' : '',
    duration:
      touched.duration && !duration
        ? 'Enter an expected duration.'
        : touched.duration && (Number(duration) < 1 || Number(duration) > 120)
          ? 'Duration must be between 1 and 120 minutes.'
          : '',
    context:
      touched.context && !context.trim()
        ? 'Provide some context for your presentation.'
        : touched.context && context.length > CONTEXT_MAX
          ? `Context must be under ${CONTEXT_MAX} characters.`
          : '',
  };

  const isValid =
    !!tone &&
    !!duration &&
    Number(duration) >= 1 &&
    Number(duration) <= 120 &&
    !!context.trim() &&
    context.length <= CONTEXT_MAX;

  useEffect(() => {
    onValidityChange?.(isValid);
  }, [isValid, onValidityChange]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setTouched({ tone: true, duration: true, context: true });
    if (!isValid) return;
    onSubmit({
      tone: tone as Tone,
      expected_duration_minutes: Number(duration),
      context: context.trim(),
    });
  };

  const inputBase: React.CSSProperties = {
    width: '100%',
    fontFamily: 'var(--font-body)',
    fontSize: 'var(--text-base)',
    color: 'var(--text-primary)',
    background: 'var(--bg-base)',
    borderRadius: 'var(--radius-md)',
    padding: 'var(--space-3) var(--space-4)',
    outline: 'none',
    opacity: disabled ? 0.5 : 1,
    transition: 'border-color 150ms ease, box-shadow 150ms ease',
  };

  const borderFor = (field: keyof typeof errors) =>
    `1px solid ${errors[field] ? 'var(--accent)' : 'var(--border-subtle)'}`;

  const handleFocus = (field: keyof typeof errors) => (e: React.FocusEvent<HTMLElement>) => {
    if (!errors[field]) {
      (e.currentTarget as HTMLElement).style.borderColor = 'var(--border-strong)';
      (e.currentTarget as HTMLElement).style.boxShadow = '0 0 0 2px var(--accent-muted)';
    }
  };

  const handleBlurStyle = (field: keyof typeof errors) => (e: React.FocusEvent<HTMLElement>) => {
    (e.currentTarget as HTMLElement).style.borderColor = errors[field]
      ? 'var(--accent)'
      : 'var(--border-subtle)';
    (e.currentTarget as HTMLElement).style.boxShadow = 'none';
  };

  return (
    <form
      id="expectations-form"
      onSubmit={handleSubmit}
      style={{ display: 'contents' }}
    >
      <motion.div
        variants={staggerContainer}
        initial="initial"
        animate="animate"
        style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-5)' }}
      >
        {/* Tone */}
        <motion.div
          variants={fieldVariants}
          transition={{ duration: 0.35, ease: 'easeOut' }}
          style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}
        >
          <label className="category-label" style={{ color: 'var(--text-secondary)' }}>
            Tone
          </label>
          <div
            style={{
              display: 'flex',
              gap: 'var(--space-2)',
              flexWrap: 'wrap',
            }}
            role="radiogroup"
            aria-label="Presentation tone"
          >
            {TONE_OPTIONS.map((opt) => {
              const selected = tone === opt.value;
              return (
                <motion.button
                  key={opt.value}
                  type="button"
                  role="radio"
                  aria-checked={selected}
                  onClick={() => {
                    setTone(opt.value);
                    markTouched('tone');
                  }}
                  disabled={disabled}
                  whileHover={!disabled ? { y: -2 } : {}}
                  whileTap={!disabled ? { scale: 0.97 } : {}}
                  style={{
                    flex: '1 1 0',
                    minWidth: 100,
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 'var(--space-1)',
                    padding: 'var(--space-3) var(--space-3)',
                    borderRadius: 'var(--radius-md)',
                    border: selected
                      ? '1.5px solid var(--accent)'
                      : '1px solid var(--border-subtle)',
                    background: selected ? 'var(--accent-muted)' : 'var(--bg-base)',
                    cursor: disabled ? 'not-allowed' : 'pointer',
                    opacity: disabled ? 0.5 : 1,
                    transition: 'border-color 180ms ease, background 180ms ease, box-shadow 180ms ease',
                    boxShadow: selected ? '0 0 0 2px var(--accent-muted)' : 'none',
                    textAlign: 'left',
                    position: 'relative',
                    overflow: 'hidden',
                  }}
                  onMouseEnter={(e) => {
                    if (!selected && !disabled) {
                      e.currentTarget.style.borderColor = 'var(--border-strong)';
                      e.currentTarget.style.background = 'var(--bg-elevated)';
                    }
                  }}
                  onMouseLeave={(e) => {
                    if (!selected && !disabled) {
                      e.currentTarget.style.borderColor = 'var(--border-subtle)';
                      e.currentTarget.style.background = 'var(--bg-base)';
                    }
                  }}
                >
                  <span
                    style={{
                      fontFamily: 'var(--font-body)',
                      fontWeight: 600,
                      fontSize: 'var(--text-sm)',
                      color: selected ? 'var(--accent)' : 'var(--text-primary)',
                      transition: 'color 180ms ease',
                    }}
                  >
                    {opt.label}
                  </span>
                  <span
                    style={{
                      fontFamily: 'var(--font-body)',
                      fontSize: '0.65rem',
                      lineHeight: 1.35,
                      color: selected ? 'var(--text-secondary)' : 'var(--text-tertiary)',
                      transition: 'color 180ms ease',
                    }}
                  >
                    {opt.description}
                  </span>
                </motion.button>
              );
            })}
          </div>
          {errors.tone && (
            <span style={{ fontSize: 'var(--text-xs)', color: 'var(--accent)' }}>
              {errors.tone}
            </span>
          )}
        </motion.div>

        {/* Duration */}
        <motion.div
          variants={fieldVariants}
          transition={{ duration: 0.35, ease: 'easeOut' }}
          style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}
        >
          <label className="category-label" htmlFor="duration-input" style={{ color: 'var(--text-secondary)' }}>
            Expected Duration
          </label>
          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
            <input
              id="duration-input"
              type="number"
              min={1}
              max={120}
              step={1}
              value={duration}
              onChange={(e) => setDuration(e.target.value)}
              onBlur={(e) => {
                markTouched('duration');
                handleBlurStyle('duration')(e);
              }}
              onFocus={handleFocus('duration')}
              disabled={disabled}
              placeholder="10"
              style={{
                ...inputBase,
                width: 120,
                fontFamily: 'var(--font-mono)',
                fontVariantNumeric: 'tabular-nums',
                border: borderFor('duration'),
              }}
            />
            <span
              style={{
                fontFamily: 'var(--font-body)',
                fontSize: 'var(--text-sm)',
                color: 'var(--text-tertiary)',
              }}
            >
              minutes
            </span>
          </div>
          {errors.duration && (
            <span style={{ fontSize: 'var(--text-xs)', color: 'var(--accent)' }}>
              {errors.duration}
            </span>
          )}
        </motion.div>

        {/* Context */}
        <motion.div
          variants={fieldVariants}
          transition={{ duration: 0.35, ease: 'easeOut' }}
          style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
            <label className="category-label" htmlFor="context-textarea" style={{ color: 'var(--text-secondary)' }}>
              Context
            </label>
            <span
              style={{
                fontFamily: 'var(--font-mono)',
                fontSize: 'var(--text-xs)',
                fontVariantNumeric: 'tabular-nums',
                color: context.length > CONTEXT_MAX ? 'var(--accent)' : 'var(--text-tertiary)',
              }}
            >
              {context.length}/{CONTEXT_MAX}
            </span>
          </div>
          <textarea
            id="context-textarea"
            value={context}
            onChange={(e) => setContext(e.target.value)}
            onBlur={(e) => {
              markTouched('context');
              handleBlurStyle('context')(e);
            }}
            onFocus={handleFocus('context')}
            disabled={disabled}
            placeholder="Describe your presentation — audience, subject, purpose."
            rows={4}
            style={{
              ...inputBase,
              border: borderFor('context'),
              resize: 'vertical',
              lineHeight: 1.6,
            }}
          />
          {errors.context && (
            <span style={{ fontSize: 'var(--text-xs)', color: 'var(--accent)' }}>
              {errors.context}
            </span>
          )}
        </motion.div>
      </motion.div>
    </form>
  );
}
