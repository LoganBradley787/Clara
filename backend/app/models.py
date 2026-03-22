from pydantic import BaseModel, Field
from typing import Dict, List, Optional
from enum import Enum

# --- Enums ---

class Tone(str, Enum):
    professional = "professional"
    conversational = "conversational"
    educational = "educational"
    persuasive = "persuasive"
    storytelling = "storytelling"

class SpeakingPace(str, Enum):
    slow = "slow"
    normal = "normal"
    fast = "fast"

class FeedbackType(str, Enum):
    repetition = "REPETITION"
    hedge_stack = "HEDGE_STACK"
    false_start = "FALSE_START"
    slide_reading = "SLIDE_READING"

class ProcessingStatus(str, Enum):
    processing = "processing"
    completed = "completed"
    failed = "failed"

class PipelineStage(str, Enum):
    received = "received"
    transcribing = "transcribing"
    indexing = "indexing"
    analyzing = "analyzing"
    aggregating = "aggregating"

# --- Whisper types ---

class WordTimestamp(BaseModel):
    word: str
    start: float
    end: float

# --- Request types ---

class Expectations(BaseModel):
    tone: Tone
    expected_duration_minutes: float = Field(gt=0, le=120)
    context: str = Field(min_length=1, max_length=500)

class PresentationMetadata(BaseModel):
    slide_timestamps: List[float]
    expectations: Expectations
    total_slides: int = Field(ge=1, le=100)

# --- Indexer output ---

class SlideTranscript(BaseModel):
    slide_index: int
    start_time: float
    end_time: float
    words: List[WordTimestamp]
    text: str

# --- Manual analytics output ---

class FillerInstance(BaseModel):
    word: str
    timestamp: float

class FillerInfo(BaseModel):
    count: int
    instances: List[FillerInstance]

class PauseInstance(BaseModel):
    start: float
    end: float
    duration_seconds: float

class PauseInfo(BaseModel):
    count: int
    instances: List[PauseInstance]

class RepeatedPhrase(BaseModel):
    phrase: str
    count: int

class SlideMetrics(BaseModel):
    word_count: int
    wpm: float
    duration_seconds: float
    filler_words: FillerInfo
    pauses: PauseInfo
    repeated_phrases: List[RepeatedPhrase]
    speaking_pace: SpeakingPace

# --- LLM feedback output ---

class FeedbackItem(BaseModel):
    type: FeedbackType
    text: str = Field(max_length=200)
    detail: str = Field(max_length=200)

class SlideFeedback(BaseModel):
    feedback: List[FeedbackItem]

# --- Aggregated output ---

class AggregatedSlide(BaseModel):
    slide_index: int
    start_time: float
    end_time: float
    duration_seconds: float
    transcript: str
    words: List[WordTimestamp]
    metrics: Dict[str, object]  # SlideMetrics fields minus duration_seconds
    feedback: List[FeedbackItem]

class OverallMetrics(BaseModel):
    total_word_count: int
    average_wpm: float
    total_filler_count: int
    total_pause_count: int
    expected_duration_seconds: float
    actual_duration_seconds: float
    duration_deviation_seconds: float

class CoachingTip(BaseModel):
    title: str = Field(max_length=100)
    explanation: str = Field(max_length=300)
    slide_references: List[str]

class PresentationResults(BaseModel):
    presentation_id: str
    total_slides: int
    total_duration_seconds: float
    overall_metrics: OverallMetrics
    coaching_summary: List[CoachingTip]
    slides: Dict[str, AggregatedSlide]

# --- API response types ---

class UploadResponse(BaseModel):
    presentation_id: str
    status: str = "processing"
    message: str = "Presentation received. Poll status endpoint for progress."

class ProgressInfo(BaseModel):
    current_step: int
    total_steps: int = 5
    step_name: str

class StatusResponse(BaseModel):
    presentation_id: str
    status: ProcessingStatus
    stage: Optional[PipelineStage] = None
    progress: Optional[ProgressInfo] = None
    error: Optional[str] = None
    message: Optional[str] = None

class ChatRequest(BaseModel):
    message: str = Field(min_length=1, max_length=1000)

class ChatResponse(BaseModel):
    response: str

class ErrorResponse(BaseModel):
    error: str
    message: str
    field: Optional[str] = None
    status: Optional[str] = None
    presentation_id: Optional[str] = None
