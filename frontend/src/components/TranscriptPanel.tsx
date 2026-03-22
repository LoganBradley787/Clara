import { useMemo, useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import type { FillerInstance, FeedbackItem, FeedbackType, WordTimestamp } from '../types';

interface TranscriptPanelProps {
  transcript: string;
  fillerWords: FillerInstance[];
  feedback: FeedbackItem[];
  expanded?: boolean;
  onToggle: () => void;
  words?: WordTimestamp[];
  currentTime?: number;
}

const PREVIEW_LENGTH = 100;

const feedbackColors: Record<FeedbackType, string> = {
  REPETITION: 'var(--cat-repetition)',
  HEDGE_STACK: 'var(--cat-hedge-stack)',
  FALSE_START: 'var(--cat-false-start)',
  SLIDE_READING: 'var(--cat-slide-reading)',
};

const feedbackLabels: Record<FeedbackType, string> = {
  REPETITION: 'repetition',
  HEDGE_STACK: 'hedge stack',
  FALSE_START: 'false start',
  SLIDE_READING: 'slide reading',
};

interface AnnotationRegion {
  start: number;
  end: number;
  kind: 'filler' | 'feedback';
  feedbackItem?: FeedbackItem;
}

interface TextSegment {
  text: string;
  kind: 'plain' | 'filler' | 'feedback';
  feedbackItem?: FeedbackItem;
}

function buildAnnotatedSegments(
  transcript: string,
  fillerWords: FillerInstance[],
  feedback: FeedbackItem[],
): TextSegment[] {
  if (!transcript) return [];

  const regions: AnnotationRegion[] = [];

  // Feedback annotations: find where each feedback.text appears in the transcript
  for (const fb of feedback) {
    if (!fb.text) continue;
    const idx = transcript.toLowerCase().indexOf(fb.text.toLowerCase());
    if (idx !== -1) {
      regions.push({
        start: idx,
        end: idx + fb.text.length,
        kind: 'feedback',
        feedbackItem: fb,
      });
    }
  }

  // Filler annotations
  const fillerSet = new Set(fillerWords.map((f) => f.word.toLowerCase()));
  if (fillerSet.size > 0) {
    const pattern = [...fillerSet]
      .map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
      .join('|');
    const regex = new RegExp(`\\b(${pattern})\\b`, 'gi');
    let match: RegExpExecArray | null;
    while ((match = regex.exec(transcript)) !== null) {
      const overlaps = regions.some(
        (r) => match!.index < r.end && match!.index + match![0].length > r.start
      );
      if (!overlaps) {
        regions.push({ start: match.index, end: match.index + match[0].length, kind: 'filler' });
      }
    }
  }

  regions.sort((a, b) => a.start - b.start);

  const segments: TextSegment[] = [];
  let cursor = 0;
  for (const region of regions) {
    if (region.start > cursor) {
      segments.push({ text: transcript.slice(cursor, region.start), kind: 'plain' });
    }
    segments.push({
      text: transcript.slice(region.start, region.end),
      kind: region.kind,
      feedbackItem: region.feedbackItem,
    });
    cursor = region.end;
  }
  if (cursor < transcript.length) {
    segments.push({ text: transcript.slice(cursor), kind: 'plain' });
  }

  return segments;
}

function FeedbackAnnotation({ item, text }: { item: FeedbackItem; text: string }) {
  const [showDetail, setShowDetail] = useState(false);
  const color = feedbackColors[item.type];

  return (
    <span style={{ position: 'relative', display: 'inline' }}>
      <mark
        onClick={() => setShowDetail((p) => !p)}
        style={{
          background: `${color}18`,
          borderBottom: `2px solid ${color}`,
          borderRadius: '2px',
          padding: '1px 2px',
          color: 'inherit',
          cursor: 'pointer',
          transition: 'background 120ms ease',
        }}
        onMouseEnter={(e) => (e.currentTarget.style.background = `${color}30`)}
        onMouseLeave={(e) => (e.currentTarget.style.background = `${color}18`)}
      >
        {text}
        <span
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            marginLeft: 4,
            padding: '0 5px',
            borderRadius: '9999px',
            background: color,
            color: '#fff',
            fontFamily: 'var(--font-body)',
            fontWeight: 500,
            fontSize: '0.6rem',
            letterSpacing: '0.03em',
            textTransform: 'uppercase',
            lineHeight: 1.8,
            verticalAlign: 'middle',
            userSelect: 'none',
          }}
        >
          {feedbackLabels[item.type]}
        </span>
      </mark>
      <AnimatePresence>
        {showDetail && (
          <motion.span
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.15 }}
            style={{
              position: 'absolute',
              left: 0,
              top: '100%',
              marginTop: 4,
              zIndex: 10,
              background: 'var(--bg-elevated)',
              border: `1px solid ${color}40`,
              borderLeft: `3px solid ${color}`,
              borderRadius: 'var(--radius-md)',
              padding: 'var(--space-2) var(--space-3)',
              fontFamily: 'var(--font-body)',
              fontSize: 'var(--text-xs)',
              color: 'var(--text-secondary)',
              lineHeight: 1.5,
              maxWidth: 280,
              minWidth: 180,
              boxShadow: 'var(--shadow-md)',
              whiteSpace: 'normal',
              pointerEvents: 'auto',
            }}
          >
            {item.detail}
          </motion.span>
        )}
      </AnimatePresence>
    </span>
  );
}

export default function TranscriptPanel({
  transcript,
  fillerWords,
  feedback,
  expanded = false,
  onToggle,
  words,
  currentTime,
}: TranscriptPanelProps) {
  const segments = useMemo(
    () => buildAnnotatedSegments(transcript, fillerWords, feedback),
    [transcript, fillerWords, feedback],
  );

  const isLong = transcript.length > PREVIEW_LENGTH;
  const hasAnnotations = feedback.length > 0 || fillerWords.length > 0;
  const autoExpand = !isLong && hasAnnotations;
  const showToggle = isLong;

  const feedbackCount = feedback.length;

  const activeWordIdx = useMemo(() => {
    if (currentTime == null || !words?.length) return -1;
    for (let i = words.length - 1; i >= 0; i--) {
      if (currentTime >= words[i].start) return i;
    }
    return -1;
  }, [currentTime, words]);

  const activeWordRef = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    activeWordRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }, [activeWordIdx]);

  const hasPlayback = currentTime != null && words && words.length > 0;

  return (
    <div>
      {feedbackCount > 0 && !expanded && (
        <div
          style={{
            marginBottom: 'var(--space-2)',
            display: 'flex',
            alignItems: 'center',
            gap: 'var(--space-2)',
          }}
        >
          <span
            style={{
              fontFamily: 'var(--font-body)',
              fontSize: 'var(--text-xs)',
              color: 'var(--text-tertiary)',
            }}
          >
            {feedbackCount} annotation{feedbackCount > 1 ? 's' : ''} — expand to view
          </span>
        </div>
      )}

      <div
        style={{
          fontFamily: 'var(--font-body)',
          fontSize: 'var(--text-sm)',
          color: 'var(--text-primary)',
          lineHeight: 1.7,
        }}
      >
        {expanded || autoExpand ? (
          hasPlayback ? (
            words.map((w, i) => {
              const isActive = i === activeWordIdx;
              return (
                <span
                  key={i}
                  ref={isActive ? activeWordRef : undefined}
                  style={{
                    background: isActive ? 'var(--accent-muted)' : 'transparent',
                    borderRadius: isActive ? 'var(--radius-sm)' : undefined,
                    padding: isActive ? '1px 2px' : undefined,
                    transition: 'background 100ms ease',
                  }}
                >
                  {w.word}{' '}
                </span>
              );
            })
          ) : (
            segments.map((seg, i) => {
              if (seg.kind === 'feedback' && seg.feedbackItem) {
                return (
                  <FeedbackAnnotation
                    key={i}
                    item={seg.feedbackItem}
                    text={seg.text}
                  />
                );
              }
              if (seg.kind === 'filler') {
                return (
                  <mark
                    key={i}
                    style={{
                      background: 'var(--accent-muted)',
                      borderRadius: 'var(--radius-sm)',
                      padding: '1px 3px',
                      color: 'inherit',
                    }}
                  >
                    {seg.text}
                  </mark>
                );
              }
              return <span key={i}>{seg.text}</span>;
            })
          )
        ) : (
          <span>
            {transcript.slice(0, PREVIEW_LENGTH)}
            {isLong && '…'}
          </span>
        )}
      </div>

      {showToggle && (
        <button
          onClick={onToggle}
          style={{
            marginTop: 'var(--space-2)',
            background: 'none',
            border: 'none',
            color: 'var(--accent)',
            fontFamily: 'var(--font-body)',
            fontSize: 'var(--text-sm)',
            fontWeight: 500,
            cursor: 'pointer',
            padding: 0,
          }}
        >
          {expanded ? 'Show less' : 'Show more'}
        </button>
      )}
    </div>
  );
}
