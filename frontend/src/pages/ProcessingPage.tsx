import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'motion/react';
import { submitPresentation, ApiClientError } from '../api/client';
import { usePolling } from '../hooks/usePolling';
import { useAppState, useAppActions } from '../context/AppContext';
import ProcessingSteps from '../components/ProcessingSteps';
import type { PresentationMetadata } from '../types';

export default function ProcessingPage() {
  const navigate = useNavigate();
  const { audioBlob, slideTimestamps, expectations, totalSlides, presentationId, pdfFile, previousAttemptId } =
    useAppState();
  const { setPresentationId, resetAll } = useAppActions();

  const [submitError, setSubmitError] = useState<string | null>(null);
  const submittedRef = useRef(false);

  const { stage, currentStep, isComplete, isFailed, errorMessage } =
    usePolling(presentationId);

  useEffect(() => {
    if (!audioBlob || !slideTimestamps.length || !expectations || !totalSlides) {
      navigate('/setup', { replace: true });
      return;
    }

    if (submittedRef.current) return;
    submittedRef.current = true;

    const metadata: PresentationMetadata = {
      slide_timestamps: slideTimestamps,
      expectations,
      total_slides: totalSlides,
    };

    submitPresentation(audioBlob, metadata, pdfFile)
      .then((res) => {
        setPresentationId(res.presentation_id);
      })
      .catch((err) => {
        submittedRef.current = false;
        if (err instanceof ApiClientError) {
          setSubmitError(err.apiError.message);
        } else {
          setSubmitError('Failed to submit presentation. Please try again.');
        }
      });
  }, [audioBlob, slideTimestamps, expectations, totalSlides, navigate, setPresentationId]);

  useEffect(() => {
    if (isComplete && presentationId) {
      if (previousAttemptId) {
        navigate(`/compare/${previousAttemptId}/${presentationId}`, { replace: true });
      } else {
        navigate(`/results/${presentationId}`, { replace: true });
      }
    }
  }, [isComplete, presentationId, previousAttemptId, navigate]);

  const errorText = submitError || (isFailed ? errorMessage : null);

  function handleRetry() {
    resetAll();
    navigate('/setup', { replace: true });
  }

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.3 }}
      className="bg-warm-gradient textured"
      style={{
        minHeight: '100vh',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 'var(--space-6)',
        position: 'relative',
      }}
    >
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: 'var(--space-6)',
          maxWidth: 480,
          width: '100%',
        }}
      >
        <h1
          style={{
            fontFamily: 'var(--font-display)',
            fontSize: 'var(--text-2xl)',
            color: 'var(--text-primary)',
            textAlign: 'center',
            lineHeight: 1.2,
          }}
        >
          Analyzing Your Presentation
        </h1>

        <ProcessingSteps currentStage={stage} />

        {!errorText && (
          <p
            style={{
              fontFamily: 'var(--font-mono)',
              fontSize: 'var(--text-sm)',
              color: 'var(--text-secondary)',
              textAlign: 'center',
            }}
          >
            Step {currentStep || 1} of 5
          </p>
        )}

        {errorText && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.25 }}
            style={{
              width: '100%',
              background: 'rgba(161, 59, 59, 0.1)',
              border: '1px solid rgba(161, 59, 59, 0.25)',
              borderRadius: 'var(--radius-md)',
              padding: 'var(--space-4) var(--space-5)',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: 'var(--space-3)',
            }}
          >
            <p
              style={{
                fontFamily: 'var(--font-body)',
                fontSize: 'var(--text-sm)',
                color: '#A13B3B',
                textAlign: 'center',
                lineHeight: 1.5,
              }}
            >
              {errorText}
            </p>
            <button
              onClick={handleRetry}
              style={{
                fontFamily: 'var(--font-body)',
                fontSize: 'var(--text-sm)',
                fontWeight: 500,
                color: 'var(--text-on-dark)',
                background: 'var(--accent)',
                border: 'none',
                borderRadius: 'var(--radius-md)',
                padding: 'var(--space-2) var(--space-5)',
                cursor: 'pointer',
                transition: 'background 150ms ease',
              }}
              onMouseEnter={(e) =>
                (e.currentTarget.style.background = 'var(--accent-hover)')
              }
              onMouseLeave={(e) =>
                (e.currentTarget.style.background = 'var(--accent)')
              }
            >
              Try Again
            </button>
          </motion.div>
        )}
      </div>
    </motion.div>
  );
}
