import { useNavigate } from 'react-router-dom';
import { motion } from 'motion/react';

const stagger = { animate: { transition: { staggerChildren: 0.1 } } };
const rise = {
  initial: { opacity: 0, y: 24 },
  animate: { opacity: 1, y: 0, transition: { duration: 0.5, ease: [0.25, 0.1, 0.25, 1] as [number, number, number, number] } },
};
const fadeIn = {
  initial: { opacity: 0 },
  animate: { opacity: 1, transition: { duration: 0.6 } },
};

const METRICS_PREVIEW = [
  { label: 'WPM', value: '142', badge: 'normal', badgeColor: 'var(--pace-normal)' },
  { label: 'Filler Words', value: '3', sub: 'um, like, basically' },
  { label: 'Pauses', value: '1', sub: '2.1s at 0:34' },
  { label: 'Repeated', value: '2', sub: '"data shows" ×3' },
];

const STEPS = [
  {
    num: '01',
    title: 'Upload & Configure',
    body: 'Drop your slide deck and tell Clara the context — audience, tone, expected duration. This calibrates every metric to your specific presentation.',
  },
  {
    num: '02',
    title: 'Present Naturally',
    body: 'Advance through your slides while Clara captures audio. No camera, no video — just your voice against your slides, exactly how you\'d rehearse.',
  },
  {
    num: '03',
    title: 'Receive Telemetry',
    body: 'Within seconds, get a per-slide diagnostic breakdown: pacing, filler words, pauses, repetition, and targeted feedback grounded in your actual transcript.',
  },
];

const PROBLEMS = [
  {
    icon: (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="10" />
        <path d="M12 6v6l4 2" />
      </svg>
    ),
    title: 'Pacing is invisible',
    body: 'You can\'t hear your own speed. Are you rushing the conclusion? Dragging through the intro? Without measurement, you\'re guessing.',
  },
  {
    icon: (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 20h9" /><path d="M16.5 3.5a2.121 2.121 0 1 1 3 3L7 19l-4 1 1-4Z" />
      </svg>
    ),
    title: 'Filler words hide in plain speech',
    body: '"Um" and "basically" vanish from your own ears. They don\'t vanish from your audience\'s. Clara catches every one, with timestamps.',
  },
  {
    icon: (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
      </svg>
    ),
    title: 'Generic advice doesn\'t help',
    body: '"Speak with confidence" means nothing. Clara tells you that slide 4 had 3 repetitions of "essentially" and your pace dropped 40 WPM below your target.',
  },
];

const CAPABILITIES = [
  {
    title: 'Words Per Minute',
    description: 'Per-slide pace measurement calibrated to your presentation style — professional, conversational, educational, persuasive, or storytelling — each with its own benchmarks.',
    color: '#2B5F8A',
    tag: 'metrics',
  },
  {
    title: 'Filler Word Detection',
    description: 'Catches um, uh, like, you know, basically, actually, literally, right, I mean, kind of, and sort of. Every instance timestamped.',
    color: '#6B4C8A',
    tag: 'detection',
  },
  {
    title: 'Pause Analysis',
    description: 'Identifies pauses that exceed tone-appropriate thresholds. A 2-second pause in a professional setting is notable; in conversation, it\'s nothing.',
    color: '#A13B3B',
    tag: 'analysis',
  },
  {
    title: 'Repetition Tracking',
    description: 'Finds phrases repeated more than once. Useful for catching verbal crutches you don\'t notice — "the data shows" on every other slide.',
    color: 'var(--cat-repetition)',
    tag: 'repetition',
  },
  {
    title: 'Targeted Feedback',
    description: 'AI-generated flags grounded in your transcript. No generic encouragement — every flag references specific words, slides, and patterns.',
    color: 'var(--cat-hedge-stack)',
    tag: 'feedback',
  },
  {
    title: 'Slide-by-Slide Breakdown',
    description: 'Every metric and feedback item is scoped to a single slide. See exactly where your presentation is strong and where it needs work.',
    color: 'var(--cat-slide-reading)',
    tag: 'breakdown',
  },
];

export default function LandingPage() {
  const navigate = useNavigate();

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.3 }}
    >
      {/* ─── HERO ─── */}
      <section
        className="textured"
        style={{
          background: 'linear-gradient(165deg, #3B1215 0%, #4A1E21 35%, #2C1810 100%)',
          minHeight: '100vh',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
          alignItems: 'center',
          padding: 'var(--space-9) var(--space-6)',
          position: 'relative',
          overflow: 'hidden',
        }}
      >
        {/* Subtle radial glow behind the wordmark */}
        <div
          style={{
            position: 'absolute',
            top: '30%',
            left: '50%',
            transform: 'translate(-50%, -50%)',
            width: '60vw',
            height: '60vw',
            maxWidth: 700,
            maxHeight: 700,
            borderRadius: '50%',
            background: 'radial-gradient(circle, rgba(122, 44, 48, 0.25) 0%, transparent 70%)',
            pointerEvents: 'none',
          }}
        />

        <motion.div
          variants={stagger}
          initial="initial"
          animate="animate"
          style={{
            maxWidth: 800,
            width: '100%',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            textAlign: 'center',
            gap: 'var(--space-6)',
            position: 'relative',
            zIndex: 1,
          }}
        >
          <motion.div variants={rise}>
            <span
              className="category-label"
              style={{
                color: 'var(--text-on-dark-muted)',
                fontSize: 'var(--text-xs)',
                letterSpacing: '0.18em',
              }}
            >
              Your Presentation Assistant
            </span>
          </motion.div>

          <motion.h1
            variants={rise}
            style={{
              fontFamily: 'var(--font-display)',
              fontSize: 'clamp(3rem, 8vw, 5.5rem)',
              color: 'var(--text-on-dark)',
              letterSpacing: '-0.03em',
              lineHeight: 1.05,
            }}
          >
            Clara
          </motion.h1>

          <motion.p
            variants={rise}
            style={{
              fontFamily: 'var(--font-display)',
              fontStyle: 'italic',
              fontSize: 'clamp(1.25rem, 3vw, 1.75rem)',
              color: 'var(--text-on-dark-muted)',
              lineHeight: 1.4,
              maxWidth: 600,
            }}
          >
            Know exactly how you sound, slide by slide.
          </motion.p>

          <motion.p
            variants={rise}
            style={{
              fontFamily: 'var(--font-body)',
              fontSize: 'var(--text-base)',
              color: 'rgba(196, 169, 143, 0.8)',
              lineHeight: 1.7,
              maxWidth: 520,
            }}
          >
            Record a practice run of your talk. Clara transcribes your audio, maps every word to the slide 
            it belongs to, and produces a diagnostic breakdown of your speaking patterns — pacing, filler 
            words, pauses, repetition — with feedback calibrated to your context.
          </motion.p>

          <motion.div
            variants={rise}
            style={{ display: 'flex', gap: 'var(--space-4)', flexWrap: 'wrap', justifyContent: 'center' }}
          >
            <motion.button
              whileHover={{ scale: 1.03 }}
              whileTap={{ scale: 0.97 }}
              onClick={() => navigate('/setup')}
              style={{
                fontFamily: 'var(--font-body)',
                fontSize: 'var(--text-base)',
                fontWeight: 500,
                color: 'var(--text-on-dark)',
                background: 'var(--accent)',
                border: 'none',
                borderRadius: 'var(--radius-md)',
                padding: 'var(--space-3) var(--space-6)',
                cursor: 'pointer',
                transition: 'background 150ms ease',
              }}
              onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--accent-hover)')}
              onMouseLeave={(e) => (e.currentTarget.style.background = 'var(--accent)')}
            >
              Start a Session &rarr;
            </motion.button>
            <motion.button
              whileHover={{ scale: 1.03 }}
              whileTap={{ scale: 0.97 }}
              onClick={() => {
                document.getElementById('how-it-works')?.scrollIntoView({ behavior: 'smooth' });
              }}
              style={{
                fontFamily: 'var(--font-body)',
                fontSize: 'var(--text-base)',
                fontWeight: 500,
                color: 'var(--text-on-dark-muted)',
                background: 'transparent',
                border: '1px solid rgba(196, 169, 143, 0.3)',
                borderRadius: 'var(--radius-md)',
                padding: 'var(--space-3) var(--space-6)',
                cursor: 'pointer',
                transition: 'border-color 150ms ease, color 150ms ease',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.borderColor = 'rgba(196, 169, 143, 0.6)';
                e.currentTarget.style.color = 'var(--text-on-dark)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.borderColor = 'rgba(196, 169, 143, 0.3)';
                e.currentTarget.style.color = 'var(--text-on-dark-muted)';
              }}
            >
              See How It Works
            </motion.button>
          </motion.div>

          {/* Mock metrics preview */}
          <motion.div
            variants={rise}
            style={{
              marginTop: 'var(--space-6)',
              display: 'grid',
              gridTemplateColumns: 'repeat(4, 1fr)',
              gap: 'var(--space-4)',
              width: '100%',
              maxWidth: 640,
            }}
          >
            {METRICS_PREVIEW.map((m) => (
              <div
                key={m.label}
                style={{
                  background: 'rgba(250, 246, 241, 0.06)',
                  border: '1px solid rgba(250, 246, 241, 0.08)',
                  borderRadius: 'var(--radius-md)',
                  padding: 'var(--space-3) var(--space-3)',
                  textAlign: 'left',
                }}
              >
                <div
                  className="category-label"
                  style={{ color: 'var(--text-on-dark-muted)', fontSize: '0.625rem', marginBottom: 'var(--space-1)' }}
                >
                  {m.label}
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-1)' }}>
                  <span
                    className="metric-value"
                    style={{ color: 'var(--text-on-dark)', fontSize: 'var(--text-xl)' }}
                  >
                    {m.value}
                  </span>
                  {m.badge && (
                    <span
                      style={{
                        fontSize: '0.6rem',
                        fontWeight: 600,
                        textTransform: 'uppercase',
                        letterSpacing: '0.05em',
                        color: '#fff',
                        background: m.badgeColor,
                        borderRadius: '9999px',
                        padding: '1px 6px',
                        alignSelf: 'flex-start',
                      }}
                    >
                      {m.badge}
                    </span>
                  )}
                </div>
                {m.sub && (
                  <div
                    style={{
                      fontFamily: 'var(--font-mono)',
                      fontSize: '0.625rem',
                      color: 'rgba(196, 169, 143, 0.6)',
                      marginTop: 'var(--space-1)',
                      lineHeight: 1.4,
                    }}
                  >
                    {m.sub}
                  </div>
                )}
              </div>
            ))}
          </motion.div>
        </motion.div>

        {/* Scroll hint */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 0.4 }}
          transition={{ delay: 1.5, duration: 0.8 }}
          style={{
            position: 'absolute',
            bottom: 'var(--space-6)',
            left: '50%',
            transform: 'translateX(-50%)',
          }}
        >
          <motion.svg
            animate={{ y: [0, 6, 0] }}
            transition={{ repeat: Infinity, duration: 2, ease: 'easeInOut' }}
            width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--text-on-dark-muted)"
            strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"
          >
            <path d="M6 9l6 6 6-6" />
          </motion.svg>
        </motion.div>
      </section>

      {/* ─── WHY IT MATTERS ─── */}
      <section
        className="bg-warm-gradient textured"
        style={{
          padding: 'var(--space-9) var(--space-6)',
          position: 'relative',
        }}
      >
        <motion.div
          initial="initial"
          whileInView="animate"
          viewport={{ once: true, margin: '-100px' }}
          variants={stagger}
          style={{
            maxWidth: 1000,
            margin: '0 auto',
          }}
        >
          <motion.div variants={rise} style={{ textAlign: 'center', marginBottom: 'var(--space-8)' }}>
            <span
              className="category-label"
              style={{ color: 'var(--accent)', letterSpacing: '0.14em', fontSize: 'var(--text-xs)' }}
            >
              The Problem
            </span>
            <h2
              style={{
                fontFamily: 'var(--font-display)',
                fontSize: 'clamp(1.75rem, 4vw, 2.5rem)',
                color: 'var(--text-primary)',
                marginTop: 'var(--space-3)',
                letterSpacing: '-0.01em',
                lineHeight: 1.15,
              }}
            >
              You can't improve what you can't measure
            </h2>
            <p
              style={{
                fontFamily: 'var(--font-body)',
                fontSize: 'var(--text-lg)',
                color: 'var(--text-secondary)',
                marginTop: 'var(--space-4)',
                maxWidth: 600,
                marginLeft: 'auto',
                marginRight: 'auto',
                lineHeight: 1.6,
              }}
            >
              Most presentation practice is a black box. You talk, you finish, and you have no 
              idea whether your pacing was right, which slides dragged, or how many times you 
              said "um." Clara changes that.
            </p>
          </motion.div>

          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
              gap: 'var(--space-5)',
            }}
          >
            {PROBLEMS.map((p, i) => (
              <motion.div
                key={i}
                variants={rise}
                style={{
                  padding: 'var(--space-6)',
                  background: 'var(--bg-elevated)',
                  borderRadius: 'var(--radius-lg)',
                  boxShadow: 'var(--shadow-sm)',
                  borderTop: '3px solid var(--accent)',
                }}
              >
                <div style={{ color: 'var(--accent)', marginBottom: 'var(--space-4)' }}>{p.icon}</div>
                <h3
                  style={{
                    fontFamily: 'var(--font-display)',
                    fontSize: 'var(--text-xl)',
                    color: 'var(--text-primary)',
                    marginBottom: 'var(--space-3)',
                  }}
                >
                  {p.title}
                </h3>
                <p
                  style={{
                    fontFamily: 'var(--font-body)',
                    fontSize: 'var(--text-sm)',
                    color: 'var(--text-secondary)',
                    lineHeight: 1.7,
                  }}
                >
                  {p.body}
                </p>
              </motion.div>
            ))}
          </div>
        </motion.div>
      </section>

      {/* ─── HOW IT WORKS ─── */}
      <section
        id="how-it-works"
        style={{
          background: 'var(--bg-elevated)',
          padding: 'var(--space-9) var(--space-6)',
          position: 'relative',
        }}
      >
        <motion.div
          initial="initial"
          whileInView="animate"
          viewport={{ once: true, margin: '-100px' }}
          variants={stagger}
          style={{ maxWidth: 900, margin: '0 auto' }}
        >
          <motion.div variants={rise} style={{ textAlign: 'center', marginBottom: 'var(--space-8)' }}>
            <span
              className="category-label"
              style={{ color: 'var(--accent)', letterSpacing: '0.14em', fontSize: 'var(--text-xs)' }}
            >
              Process
            </span>
            <h2
              style={{
                fontFamily: 'var(--font-display)',
                fontSize: 'clamp(1.75rem, 4vw, 2.5rem)',
                color: 'var(--text-primary)',
                marginTop: 'var(--space-3)',
                letterSpacing: '-0.01em',
              }}
            >
              Three steps to a diagnostic
            </h2>
          </motion.div>

          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: 0,
            }}
          >
            {STEPS.map((step, i) => (
              <motion.div
                key={i}
                variants={rise}
                style={{
                  display: 'grid',
                  gridTemplateColumns: '64px 1fr',
                  gap: 'var(--space-5)',
                  paddingBottom: i < STEPS.length - 1 ? 'var(--space-7)' : 0,
                  position: 'relative',
                }}
              >
                {/* Number column with vertical connector */}
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                  <div
                    style={{
                      width: 56,
                      height: 56,
                      borderRadius: '50%',
                      background: 'var(--bg-base)',
                      border: '2px solid var(--accent)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontFamily: 'var(--font-display)',
                      fontStyle: 'italic',
                      fontSize: 'var(--text-xl)',
                      color: 'var(--accent)',
                      flexShrink: 0,
                    }}
                  >
                    {step.num}
                  </div>
                  {i < STEPS.length - 1 && (
                    <div
                      style={{
                        width: 1,
                        flex: 1,
                        background: 'var(--border-subtle)',
                        marginTop: 'var(--space-3)',
                      }}
                    />
                  )}
                </div>

                {/* Content */}
                <div style={{ paddingTop: 'var(--space-3)' }}>
                  <h3
                    style={{
                      fontFamily: 'var(--font-display)',
                      fontSize: 'var(--text-xl)',
                      color: 'var(--text-primary)',
                      marginBottom: 'var(--space-2)',
                    }}
                  >
                    {step.title}
                  </h3>
                  <p
                    style={{
                      fontFamily: 'var(--font-body)',
                      fontSize: 'var(--text-base)',
                      color: 'var(--text-secondary)',
                      lineHeight: 1.7,
                      maxWidth: 560,
                    }}
                  >
                    {step.body}
                  </p>
                </div>
              </motion.div>
            ))}
          </div>
        </motion.div>
      </section>

      {/* ─── WHAT YOU GET ─── */}
      <section
        className="bg-warm-gradient textured"
        style={{
          padding: 'var(--space-9) var(--space-6)',
          position: 'relative',
        }}
      >
        <motion.div
          initial="initial"
          whileInView="animate"
          viewport={{ once: true, margin: '-100px' }}
          variants={stagger}
          style={{ maxWidth: 1100, margin: '0 auto' }}
        >
          <motion.div variants={rise} style={{ textAlign: 'center', marginBottom: 'var(--space-8)' }}>
            <span
              className="category-label"
              style={{ color: 'var(--accent)', letterSpacing: '0.14em', fontSize: 'var(--text-xs)' }}
            >
              Capabilities
            </span>
            <h2
              style={{
                fontFamily: 'var(--font-display)',
                fontSize: 'clamp(1.75rem, 4vw, 2.5rem)',
                color: 'var(--text-primary)',
                marginTop: 'var(--space-3)',
                letterSpacing: '-0.01em',
              }}
            >
              Every metric, every slide
            </h2>
            <p
              style={{
                fontFamily: 'var(--font-body)',
                fontSize: 'var(--text-lg)',
                color: 'var(--text-secondary)',
                marginTop: 'var(--space-4)',
                maxWidth: 560,
                marginLeft: 'auto',
                marginRight: 'auto',
                lineHeight: 1.6,
              }}
            >
              Clara doesn't give you a single score. It gives you a complete telemetry readout, scoped to each slide, calibrated to your context.
            </p>
          </motion.div>

          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))',
              gap: 'var(--space-4)',
            }}
          >
            {CAPABILITIES.map((cap, i) => (
              <motion.div
                key={i}
                variants={rise}
                style={{
                  padding: 'var(--space-5)',
                  background: 'var(--bg-elevated)',
                  borderRadius: 'var(--radius-lg)',
                  boxShadow: 'var(--shadow-sm)',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 'var(--space-3)',
                }}
              >
                <span
                  className="category-label"
                  style={{
                    display: 'inline-block',
                    alignSelf: 'flex-start',
                    padding: '2px 10px',
                    borderRadius: '9999px',
                    background: cap.color,
                    color: '#fff',
                    fontSize: '0.625rem',
                    letterSpacing: '0.06em',
                  }}
                >
                  {cap.tag}
                </span>
                <h3
                  style={{
                    fontFamily: 'var(--font-display)',
                    fontSize: 'var(--text-lg)',
                    color: 'var(--text-primary)',
                  }}
                >
                  {cap.title}
                </h3>
                <p
                  style={{
                    fontFamily: 'var(--font-body)',
                    fontSize: 'var(--text-sm)',
                    color: 'var(--text-secondary)',
                    lineHeight: 1.7,
                  }}
                >
                  {cap.description}
                </p>
              </motion.div>
            ))}
          </div>
        </motion.div>
      </section>

      {/* ─── CLOSING CTA ─── */}
      <section
        className="textured"
        style={{
          background: 'linear-gradient(165deg, #3B1215 0%, #4A1E21 50%, #2C1810 100%)',
          padding: 'var(--space-9) var(--space-6)',
          position: 'relative',
        }}
      >
        <motion.div
          initial="initial"
          whileInView="animate"
          viewport={{ once: true, margin: '-100px' }}
          variants={stagger}
          style={{
            maxWidth: 640,
            margin: '0 auto',
            textAlign: 'center',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: 'var(--space-5)',
          }}
        >
          <motion.h2
            variants={rise}
            style={{
              fontFamily: 'var(--font-display)',
              fontSize: 'clamp(1.75rem, 4vw, 2.5rem)',
              color: 'var(--text-on-dark)',
              letterSpacing: '-0.01em',
              lineHeight: 1.15,
            }}
          >
            Stop guessing. Start measuring.
          </motion.h2>
          <motion.p
            variants={rise}
            style={{
              fontFamily: 'var(--font-body)',
              fontSize: 'var(--text-base)',
              color: 'var(--text-on-dark-muted)',
              lineHeight: 1.7,
              maxWidth: 480,
            }}
          >
            Upload your slides, record your talk, and see exactly where you stand — in under a minute. No account required.
          </motion.p>
          <motion.button
            variants={rise}
            whileHover={{ scale: 1.03 }}
            whileTap={{ scale: 0.97 }}
            onClick={() => navigate('/setup')}
            style={{
              fontFamily: 'var(--font-body)',
              fontSize: 'var(--text-lg)',
              fontWeight: 500,
              color: 'var(--text-on-dark)',
              background: 'var(--accent)',
              border: 'none',
              borderRadius: 'var(--radius-md)',
              padding: 'var(--space-4) var(--space-7)',
              cursor: 'pointer',
              transition: 'background 150ms ease',
            }}
            onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--accent-hover)')}
            onMouseLeave={(e) => (e.currentTarget.style.background = 'var(--accent)')}
          >
            Get Started &rarr;
          </motion.button>
          <motion.p
            variants={fadeIn}
            style={{
              fontFamily: 'var(--font-mono)',
              fontSize: 'var(--text-xs)',
              color: 'rgba(196, 169, 143, 0.5)',
              marginTop: 'var(--space-2)',
            }}
          >
            No sign-up &middot; No data stored &middot; Works locally
          </motion.p>
        </motion.div>
      </section>
    </motion.div>
  );
}
