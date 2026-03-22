export interface PresentationExpectations {
  tone: 'professional' | 'conversational' | 'educational' | 'persuasive' | 'storytelling';
  expected_duration_minutes: number;
  context: string;
}

export interface PresentationMetadata {
  slide_timestamps: number[];
  expectations: PresentationExpectations;
  total_slides: number;
}

export interface SubmitResponse {
  presentation_id: string;
  status: 'processing';
  message: string;
}

export interface StatusResponseProcessing {
  presentation_id: string;
  status: 'processing';
  stage: 'received' | 'transcribing' | 'indexing' | 'analyzing' | 'aggregating';
  progress: {
    current_step: number;
    total_steps: number;
    step_name: string;
  };
}

export interface StatusResponseCompleted {
  presentation_id: string;
  status: 'completed';
}

export interface StatusResponseFailed {
  presentation_id: string;
  status: 'failed';
  error: string;
  message: string;
}

export type StatusResponse =
  | StatusResponseProcessing
  | StatusResponseCompleted
  | StatusResponseFailed;

export interface WordTimestamp {
  word: string;
  start: number;
  end: number;
}

export interface FillerInstance {
  word: string;
  timestamp: number;
}

export interface PauseInstance {
  start: number;
  end: number;
  duration_seconds: number;
}

export interface RepeatedPhrase {
  phrase: string;
  count: number;
}

export interface SlideMetrics {
  word_count: number;
  wpm: number;
  filler_words: {
    count: number;
    instances: FillerInstance[];
  };
  pauses: {
    count: number;
    instances: PauseInstance[];
  };
  repeated_phrases: RepeatedPhrase[];
  speaking_pace: 'slow' | 'normal' | 'fast';
}

export interface FeedbackItem {
  type: 'REPETITION' | 'HEDGE_STACK' | 'FALSE_START' | 'SLIDE_READING';
  text: string;
  detail: string;
}

export type ObservationType = 'CONTENT_COVERAGE';

export interface ObservationItem {
  type: ObservationType;
  detail: string;
  evidence?: Record<string, any>;
}

export interface SlideResult {
  slide_index: number;
  start_time: number;
  end_time: number;
  duration_seconds: number;
  transcript: string;
  words: WordTimestamp[];
  metrics: SlideMetrics;
  feedback: FeedbackItem[];
  observations: ObservationItem[];
}

export interface OverallMetrics {
  total_word_count: number;
  average_wpm: number;
  total_filler_count: number;
  total_pause_count: number;
  expected_duration_seconds: number;
  actual_duration_seconds: number;
  duration_deviation_seconds: number;
}

export interface CoachingTip {
  title: string;
  explanation: string;
  slide_references: string[];
}

export interface PresentationResults {
  presentation_id: string;
  total_slides: number;
  total_duration_seconds: number;
  overall_metrics: OverallMetrics;
  coaching_summary: CoachingTip[];
  slides: Record<string, SlideResult>;
}

export interface ChatResponse {
  response: string;
}

export interface ApiError {
  error: string;
  message: string;
  field?: string;
  status?: string;
  presentation_id?: string;
}

export type FeedbackType = FeedbackItem['type'];
export type SpeakingPace = SlideMetrics['speaking_pace'];
export type Tone = PresentationExpectations['tone'];
export type ProcessingStage = StatusResponseProcessing['stage'];
