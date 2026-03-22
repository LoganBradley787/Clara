import { useEffect, useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { motion } from 'motion/react';
import { getResults } from '../api/client';
import { useAppActions } from '../context/AppContext';
import type { PresentationResults, OverallMetrics } from '../types';

export default function ComparisonPage() {
  const { id1, id2 } = useParams<{ id1: string; id2: string }>();
  const navigate = useNavigate();
  const { startPracticeAgain } = useAppActions();

  const [prev, setPrev] = useState<PresentationResults | null>(null);
  const [curr, setCurr] = useState<PresentationResults | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!id1 || !id2) return;
    let cancelled = false;
    Promise.all([getResults(id1), getResults(id2)])
      .then(([r1, r2]) => {
        if (cancelled) return;
        setPrev(r1);
        setCurr(r2);
        setLoading(false);
      })
      .catch(() => {
        if (cancelled) return;
        setError('Could not load comparison data.');
        setLoading(false);
      });
    return () => { cancelled = true; };
  }, [id1, id2]);

  if (loading) {
    return (
      <div className="bg-warm-gradient textured" style={fullCenter}>
        <div className="loading-shimmer" style={{ width: 200, height: 24, borderRadius: 'var(--radius-md)' }} />
        <p style={{ color: 'var(--text-tertiary)', fontSize: 'var(--text-sm)', marginTop: 'var(--space-3)' }}>
          Loading comparison...
        </p>
      </div>
    );
  }

  if (error || !prev || !curr) {
    return (
      <div className="bg-warm-gradient textured" style={fullCenter}>
        <h2 style={headingStyle}>{error || 'Something went wrong'}</h2>
        <Link to="/" style={linkStyle}>&larr; Back to home</Link>
      </div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.3 }}
      className="bg-warm-gradient textured"
      style={{ minHeight: '100vh', padding: 'var(--space-5) var(--space-6)' }}
    >
      <div style={{ maxWidth: 1200, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 'var(--space-5)' }}>
        {/* Header */}
        <div
          className="bg-deep-gradient"
          style={{
            borderRadius: 'var(--radius-lg)',
            padding: 'var(--space-5) var(--space-6)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: 'var(--space-3)',
          }}
        >
          <div>
            <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 'var(--text-2xl)', color: 'var(--text-on-dark)' }}>
              Practice Comparison
            </h1>
            <p style={{ fontFamily: 'var(--font-body)', fontSize: 'var(--text-sm)', color: 'var(--text-on-dark-muted)', marginTop: 'var(--space-1)' }}>
              See how you improved between attempts
            </p>
          </div>
          <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
            <button onClick={() => navigate(`/results/${id2}`)} style={headerBtnStyle}>
              View Latest Results
            </button>
            <button
              onClick={() => {
                if (id2) startPracticeAgain(id2);
                navigate('/present');
              }}
              style={{ ...headerBtnStyle, background: 'var(--accent)', borderColor: 'var(--accent)' }}
            >
              Practice Again
            </button>
          </div>
        </div>

        {/* Overall Comparison */}
        <section style={cardStyle}>
          <h2 style={sectionHeading}>Overall Metrics</h2>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 'var(--space-4)' }}>
            <ComparisonMetric label="Avg WPM" prev={Math.round(prev.overall_metrics.average_wpm)} curr={Math.round(curr.overall_metrics.average_wpm)} lower="better-when-closer" target={prev.overall_metrics.average_wpm} />
            <ComparisonMetric label="Total Filler Words" prev={prev.overall_metrics.total_filler_count} curr={curr.overall_metrics.total_filler_count} lower="better" />
            <ComparisonMetric label="Total Pauses" prev={prev.overall_metrics.total_pause_count} curr={curr.overall_metrics.total_pause_count} lower="better" />
            <DurationMetric label="Duration" prev={prev.overall_metrics} curr={curr.overall_metrics} />
          </div>
        </section>

        {/* Per-Slide Comparison */}
        <section style={cardStyle}>
          <h2 style={sectionHeading}>Per-Slide Breakdown</h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
            {Array.from({ length: Math.max(prev.total_slides, curr.total_slides) }, (_, i) => {
              const prevSlide = prev.slides[`slide_${i}`];
              const currSlide = curr.slides[`slide_${i}`];
              if (!prevSlide || !currSlide) return null;
              return (
                <div
                  key={i}
                  style={{
                    display: 'grid',
                    gridTemplateColumns: '80px 1fr',
                    gap: 'var(--space-3)',
                    padding: 'var(--space-3) var(--space-4)',
                    background: 'var(--bg-base)',
                    borderRadius: 'var(--radius-md)',
                    alignItems: 'center',
                  }}
                >
                  <span
                    className="category-label"
                    style={{ color: 'var(--text-tertiary)' }}
                  >
                    Slide {i + 1}
                  </span>
                  <div
                    style={{
                      display: 'grid',
                      gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))',
                      gap: 'var(--space-3)',
                    }}
                  >
                    <MiniCompare label="WPM" prev={Math.round(prevSlide.metrics.wpm)} curr={Math.round(currSlide.metrics.wpm)} />
                    <MiniCompare label="Fillers" prev={prevSlide.metrics.filler_words.count} curr={currSlide.metrics.filler_words.count} lowerBetter />
                    <MiniCompare label="Pauses" prev={prevSlide.metrics.pauses.count} curr={currSlide.metrics.pauses.count} lowerBetter />
                    <PaceCompare prev={prevSlide.metrics.speaking_pace} curr={currSlide.metrics.speaking_pace} />
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      </div>
    </motion.div>
  );
}

function ComparisonMetric({
  label,
  prev,
  curr,
  lower,
}: {
  label: string;
  prev: number;
  curr: number;
  lower: 'better' | 'better-when-closer';
  target?: number;
}) {
  const diff = curr - prev;
  const improved = lower === 'better' ? diff < 0 : Math.abs(diff) < Math.abs(prev * 0.1);
  const arrow = diff < 0 ? '\u2193' : diff > 0 ? '\u2191' : '';
  const diffColor = improved ? 'var(--pace-normal)' : diff === 0 ? 'var(--text-tertiary)' : 'var(--pause-warning)';

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-1)' }}>
      <span className="category-label" style={{ color: 'var(--text-tertiary)' }}>{label}</span>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 'var(--space-2)' }}>
        <span className="metric-value" style={{ fontSize: 'var(--text-xl)', color: 'var(--text-primary)' }}>
          {curr}
        </span>
        {diff !== 0 && (
          <span className="metric-value" style={{ fontSize: 'var(--text-sm)', color: diffColor }}>
            {arrow} {Math.abs(diff)}
          </span>
        )}
      </div>
      <span style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--text-xs)', color: 'var(--text-tertiary)' }}>
        was {prev}
      </span>
    </div>
  );
}

function DurationMetric({ label, prev, curr }: { label: string; prev: OverallMetrics; curr: OverallMetrics }) {
  const fmt = (s: number) => {
    const m = Math.floor(s / 60);
    const sec = Math.floor(s % 60);
    return `${m}:${sec.toString().padStart(2, '0')}`;
  };
  const prevDev = Math.abs(prev.duration_deviation_seconds);
  const currDev = Math.abs(curr.duration_deviation_seconds);
  const improved = currDev < prevDev;
  const diffColor = improved ? 'var(--pace-normal)' : currDev === prevDev ? 'var(--text-tertiary)' : 'var(--pause-warning)';

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-1)' }}>
      <span className="category-label" style={{ color: 'var(--text-tertiary)' }}>{label}</span>
      <span className="metric-value" style={{ fontSize: 'var(--text-xl)', color: 'var(--text-primary)' }}>
        {fmt(curr.actual_duration_seconds)}
      </span>
      <span style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--text-xs)', color: diffColor }}>
        deviation {Math.round(curr.duration_deviation_seconds)}s (was {Math.round(prev.duration_deviation_seconds)}s)
      </span>
    </div>
  );
}

function MiniCompare({ label, prev, curr, lowerBetter }: { label: string; prev: number; curr: number; lowerBetter?: boolean }) {
  const diff = curr - prev;
  const improved = lowerBetter ? diff < 0 : diff === 0;
  const color = diff === 0 ? 'var(--text-tertiary)' : improved ? 'var(--pace-normal)' : 'var(--pause-warning)';

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      <span style={{ fontFamily: 'var(--font-body)', fontSize: '0.6rem', color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.03em', fontWeight: 500 }}>
        {label}
      </span>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 4 }}>
        <span className="metric-value" style={{ fontSize: 'var(--text-base)', color: 'var(--text-primary)' }}>{curr}</span>
        {diff !== 0 && (
          <span className="metric-value" style={{ fontSize: 'var(--text-xs)', color }}>
            {diff > 0 ? '+' : ''}{diff}
          </span>
        )}
      </div>
    </div>
  );
}

function PaceCompare({ prev, curr }: { prev: string; curr: string }) {
  const changed = prev !== curr;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      <span style={{ fontFamily: 'var(--font-body)', fontSize: '0.6rem', color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.03em', fontWeight: 500 }}>
        Pace
      </span>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 4 }}>
        <span
          className="metric-value"
          style={{
            fontSize: 'var(--text-xs)',
            padding: '1px 6px',
            borderRadius: 'var(--radius-sm)',
            background: `var(--pace-${curr})`,
            color: '#fff',
            textTransform: 'capitalize',
          }}
        >
          {curr}
        </span>
        {changed && (
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--text-xs)', color: 'var(--text-tertiary)' }}>
            was {prev}
          </span>
        )}
      </div>
    </div>
  );
}

const fullCenter: React.CSSProperties = {
  minHeight: '100vh',
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'center',
  gap: 'var(--space-4)',
};

const headingStyle: React.CSSProperties = {
  fontFamily: 'var(--font-display)',
  fontSize: 'var(--text-2xl)',
  color: 'var(--text-primary)',
};

const linkStyle: React.CSSProperties = {
  color: 'var(--accent)',
  fontFamily: 'var(--font-body)',
  fontWeight: 500,
  textDecoration: 'none',
};

const cardStyle: React.CSSProperties = {
  background: 'var(--bg-elevated)',
  boxShadow: 'var(--shadow-sm)',
  borderRadius: 'var(--radius-lg)',
  padding: 'var(--space-5)',
};

const sectionHeading: React.CSSProperties = {
  fontFamily: 'var(--font-display)',
  fontSize: 'var(--text-lg)',
  color: 'var(--text-primary)',
  marginBottom: 'var(--space-4)',
};

const headerBtnStyle: React.CSSProperties = {
  fontFamily: 'var(--font-body)',
  fontSize: 'var(--text-sm)',
  fontWeight: 500,
  color: 'var(--text-on-dark)',
  background: 'rgba(250, 246, 241, 0.1)',
  border: '1px solid rgba(250, 246, 241, 0.2)',
  borderRadius: 'var(--radius-md)',
  padding: 'var(--space-2) var(--space-4)',
  cursor: 'pointer',
  whiteSpace: 'nowrap',
};
