import { useEffect, useState, useRef, useCallback, useMemo } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { motion, AnimatePresence } from 'motion/react';
import { getResults, getAudioUrl, ApiClientError } from '../api/client';
import { useAppState, useAppActions } from '../context/AppContext';
import { useAudioPlayer } from '../hooks/useAudioPlayer';
import SlideViewer from '../components/SlideViewer';
import OverallMetrics from '../components/OverallMetrics';
import CoachingSummary from '../components/CoachingSummary';
import AudioPlayer from '../components/AudioPlayer';
import PresentationTimeline from '../components/PresentationTimeline';
import MetricsPanel from '../components/MetricsPanel';
import TranscriptPanel from '../components/TranscriptPanel';
import CoverageChecklist from '../components/CoverageChecklist';
import SlideCarousel from '../components/SlideCarousel';
import ChatPanel from '../components/ChatPanel';
import type { PresentationResults, ObservationItem } from '../types';

export default function ResultsPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { pdfFile, audioBlob, results: contextResults } = useAppState();
  const { setResults, resetAll, startPracticeAgain } = useAppActions();

  const [results, setLocalResults] = useState<PresentationResults | null>(contextResults);
  const [selectedSlideIndex, setSelectedSlideIndex] = useState(0);
  const [transcriptExpanded, setTranscriptExpanded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(!contextResults);

  const transcriptRef = useRef<HTMLDivElement>(null);

  const [audioSrc, setAudioSrc] = useState<string | null>(null);
  useEffect(() => {
    if (audioBlob) {
      const url = URL.createObjectURL(audioBlob);
      setAudioSrc(url);
      return () => URL.revokeObjectURL(url);
    }
    if (id) {
      let revoke: (() => void) | null = null;
      getAudioUrl(id)
        .then((url) => {
          setAudioSrc(url);
          revoke = () => URL.revokeObjectURL(url);
        })
        .catch(() => {});
      return () => revoke?.();
    }
  }, [audioBlob, id]);

  const player = useAudioPlayer(audioSrc, results?.total_duration_seconds);

  useEffect(() => {
    if (contextResults) {
      setLocalResults(contextResults);
      setLoading(false);
      return;
    }

    if (!id) return;

    let cancelled = false;

    async function fetchResults() {
      try {
        const data = await getResults(id!);
        if (cancelled) return;
        setLocalResults(data);
        setResults(data);
        setLoading(false);
      } catch (err) {
        if (cancelled) return;
        if (err instanceof ApiClientError) {
          if (err.apiError.status === 'processing') {
            navigate('/processing', { replace: true });
            return;
          }
          if (err.apiError.error === 'not_found') {
            setError('not_found');
            setLoading(false);
            return;
          }
        }
        setError('unknown');
        setLoading(false);
      }
    }

    fetchResults();
    return () => { cancelled = true; };
  }, [id, contextResults, navigate, setResults]);

  // Auto-advance slides during playback
  const slideTimeBounds = useMemo(() => {
    if (!results) return [];
    return Array.from({ length: results.total_slides }, (_, i) => {
      const s = results.slides[`slide_${i}`];
      return s ? { start: s.start_time, end: s.end_time } : null;
    });
  }, [results]);

  useEffect(() => {
    if (!player.isPlaying) return;
    for (let i = slideTimeBounds.length - 1; i >= 0; i--) {
      const b = slideTimeBounds[i];
      if (b && player.currentTime >= b.start) {
        if (i !== selectedSlideIndex) setSelectedSlideIndex(i);
        break;
      }
    }
  }, [player.currentTime, player.isPlaying, slideTimeBounds, selectedSlideIndex]);

  const handleNewPresentation = useCallback(() => {
    resetAll();
    navigate('/setup');
  }, [resetAll, navigate]);

  const handlePracticeAgain = useCallback(() => {
    if (!id) return;
    startPracticeAgain(id);
    navigate('/present');
  }, [id, startPracticeAgain, navigate]);

  const handleFillerClick = useCallback(() => {
    setTranscriptExpanded(true);
    requestAnimationFrame(() => {
      transcriptRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    });
  }, []);

  const handlePauseClick = useCallback(() => {}, []);

  const handleSlideSelect = useCallback((index: number) => {
    setSelectedSlideIndex(index);
    setTranscriptExpanded(false);
  }, []);

  if (loading) {
    return (
      <div
        className="bg-warm-gradient textured"
        style={{
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <div style={{ textAlign: 'center' }}>
          <div className="loading-shimmer" style={{ width: 200, height: 24, borderRadius: 'var(--radius-md)', marginBottom: 'var(--space-3)' }} />
          <p style={{ color: 'var(--text-tertiary)', fontSize: 'var(--text-sm)' }}>Loading results…</p>
        </div>
      </div>
    );
  }

  if (error === 'not_found') {
    return (
      <div
        className="bg-warm-gradient textured"
        style={{
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexDirection: 'column',
          gap: 'var(--space-4)',
        }}
      >
        <h2 style={{ fontFamily: 'var(--font-display)', fontSize: 'var(--text-2xl)', color: 'var(--text-primary)' }}>
          Presentation not found
        </h2>
        <p style={{ color: 'var(--text-secondary)', fontSize: 'var(--text-base)' }}>
          This presentation doesn't exist or has expired.
        </p>
        <Link
          to="/"
          style={{
            color: 'var(--accent)',
            fontFamily: 'var(--font-body)',
            fontWeight: 500,
            fontSize: 'var(--text-base)',
            textDecoration: 'none',
          }}
        >
          &larr; Back to home
        </Link>
      </div>
    );
  }

  if (error || !results) {
    return (
      <div
        className="bg-warm-gradient textured"
        style={{
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexDirection: 'column',
          gap: 'var(--space-4)',
        }}
      >
        <h2 style={{ fontFamily: 'var(--font-display)', fontSize: 'var(--text-2xl)', color: 'var(--text-primary)' }}>
          Something went wrong
        </h2>
        <Link
          to="/"
          style={{
            color: 'var(--accent)',
            fontFamily: 'var(--font-body)',
            fontWeight: 500,
            textDecoration: 'none',
          }}
        >
          &larr; Back to home
        </Link>
      </div>
    );
  }

  const slideKey = `slide_${selectedSlideIndex}`;
  const slide = results.slides[slideKey];

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.3 }}
      className="bg-warm-gradient textured"
      style={{
        minHeight: '100vh',
        display: 'flex',
        flexDirection: 'column',
        position: 'relative',
      }}
    >
      <motion.div
        initial="hidden"
        animate="visible"
        variants={{ visible: { transition: { staggerChildren: 0.12 } } }}
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: 'var(--space-5)',
          padding: 'var(--space-5) var(--space-6)',
          maxWidth: 1400,
          width: '100%',
          margin: '0 auto',
          flex: 1,
        }}
      >
        {/* Zone 1: Overall Metrics */}
        <motion.div variants={zoneVariants}>
          <OverallMetrics
            metrics={results.overall_metrics}
            onNewPresentation={handleNewPresentation}
            onPracticeAgain={handlePracticeAgain}
          />
        </motion.div>

        {/* Audio Player + Timeline */}
        {audioSrc && (
          <motion.div variants={zoneVariants} style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
            <AudioPlayer player={player} />
            <PresentationTimeline
              results={results}
              currentTime={player.currentTime}
              duration={player.duration}
              onSeek={player.seek}
              onSlideSelect={handleSlideSelect}
            />
          </motion.div>
        )}

        {/* Zone 2: Coaching Summary */}
        {results.coaching_summary && results.coaching_summary.length > 0 && (
          <motion.div variants={zoneVariants} style={cardStyle}>
            <CoachingSummary
              tips={results.coaching_summary}
              onSlideClick={handleSlideSelect}
            />
          </motion.div>
        )}

        {/* Zone 3: Two-Column Split */}
        <motion.div
          variants={zoneVariants}
          className="results-grid"
          style={{
            flex: 1,
            minHeight: 0,
          }}
        >
          {/* Left: Slide Viewer */}
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'flex-start',
              minWidth: 0,
            }}
          >
            <SlideViewer
              file={pdfFile}
              pageNumber={selectedSlideIndex + 1}
            />
            <div
              style={{
                marginTop: 'var(--space-3)',
                textAlign: 'center',
                color: 'var(--text-tertiary)',
                fontSize: 'var(--text-xs)',
                fontFamily: 'var(--font-mono)',
              }}
            >
              Slide {selectedSlideIndex + 1} of {results.total_slides}
            </div>
          </div>

          {/* Right: Panels */}
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: 'var(--space-4)',
              overflowY: 'auto',
              minHeight: 0,
            }}
          >
            <AnimatePresence mode="wait">
              <motion.div
                key={slideKey}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                transition={{ duration: 0.25 }}
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 'var(--space-4)',
                }}
              >
                {/* Metrics */}
                <section style={cardStyle}>
                  <h3 style={sectionHeadingStyle}>Metrics</h3>
                  {slide ? (
                    <MetricsPanel
                      metrics={slide.metrics}
                      duration={slide.duration_seconds}
                      onFillerClick={handleFillerClick}
                      onPauseClick={handlePauseClick}
                    />
                  ) : (
                    <p style={emptySlideStyle}>No data for this slide.</p>
                  )}
                </section>

                {/* Content Coverage observation */}
                {slide && slide.observations && (() => {
                  const coverageObs = slide.observations.find((o: ObservationItem) => o.type === 'CONTENT_COVERAGE');
                  if (!coverageObs) return null;
                  return <CoverageChecklist observation={coverageObs} />;
                })()}

                {/* Transcript + Inline Feedback */}
                <section ref={transcriptRef} style={cardStyle}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 'var(--space-4)' }}>
                    <h3 style={{ ...sectionHeadingStyle, marginBottom: 0 }}>Transcript</h3>
                    {slide && slide.feedback.length > 0 && (
                      <span
                        style={{
                          fontFamily: 'var(--font-body)',
                          fontSize: 'var(--text-xs)',
                          color: 'var(--text-tertiary)',
                          fontWeight: 500,
                        }}
                      >
                        {slide.feedback.length} inline annotation{slide.feedback.length > 1 ? 's' : ''}
                      </span>
                    )}
                  </div>
                  {slide ? (
                    <TranscriptPanel
                      transcript={slide.transcript}
                      fillerWords={slide.metrics.filler_words.instances}
                      feedback={slide.feedback}
                      expanded={transcriptExpanded}
                      onToggle={() => setTranscriptExpanded((p) => !p)}
                      words={slide.words}
                      currentTime={player.isPlaying ? player.currentTime : undefined}
                    />
                  ) : (
                    <p style={emptySlideStyle}>No transcript for this slide.</p>
                  )}
                </section>
              </motion.div>
            </AnimatePresence>
          </div>
        </motion.div>

        {/* Zone 4: Slide Carousel */}
        <motion.div variants={zoneVariants}>
          <SlideCarousel
            totalSlides={results.total_slides}
            selectedIndex={selectedSlideIndex}
            onSelect={handleSlideSelect}
          />
        </motion.div>
      </motion.div>

      {/* Chat Panel */}
      {results.presentation_id && (
        <ChatPanel presentationId={results.presentation_id} />
      )}
    </motion.div>
  );
}

const zoneVariants = {
  hidden: { opacity: 0, y: 16 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.35, ease: 'easeOut' as const } },
};

const cardStyle: React.CSSProperties = {
  background: 'var(--bg-elevated)',
  boxShadow: 'var(--shadow-sm)',
  borderRadius: 'var(--radius-lg)',
  padding: 'var(--space-5)',
};

const sectionHeadingStyle: React.CSSProperties = {
  fontFamily: 'var(--font-display)',
  fontSize: 'var(--text-lg)',
  color: 'var(--text-primary)',
  marginBottom: 'var(--space-4)',
};

const emptySlideStyle: React.CSSProperties = {
  color: 'var(--text-tertiary)',
  fontSize: 'var(--text-sm)',
  fontStyle: 'italic',
};
