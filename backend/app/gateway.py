import asyncio
import json
import logging
import os
import tempfile
import uuid
from typing import Any, Dict, Optional, Tuple

import fitz  # PyMuPDF

logger = logging.getLogger("clara.pipeline")

from fastapi import APIRouter, File, Form, Request, UploadFile
from fastapi.responses import JSONResponse, Response

from app.aggregator import aggregate_results
from app.indexer import index_slides
from app.llm_feedback import generate_llm_feedback, generate_coaching_summary, generate_chat_response
from app.manual_analytics import compute_manual_analytics
from app.models import (
    ChatRequest,
    ChatResponse,
    ErrorResponse,
    PipelineStage,
    PresentationMetadata,
    PresentationResults,
    ProcessingStatus,
    ProgressInfo,
    StatusResponse,
    Tone,
    UploadResponse,
)
from app.transcriber import transcribe_audio

router = APIRouter(prefix="/api")

MAX_AUDIO_BYTES = 100 * 1024 * 1024  # 100MB

STAGE_STEPS: Dict[str, Tuple[int, str]] = {
    "received":    (1, "Upload received, queued for processing"),
    "transcribing": (2, "Transcribing audio"),
    "indexing":    (3, "Mapping transcript to slides"),
    "analyzing":   (4, "Running manual analytics + LLM feedback"),
    "aggregating": (5, "Combining results"),
}


def _extract_slide_texts(pdf_bytes: bytes, total_slides: int) -> Dict[str, str]:
    """Extract text from each page of a PDF. Returns dict keyed by slide_id."""
    doc = fitz.open(stream=pdf_bytes, filetype="pdf")
    slide_texts: Dict[str, str] = {}
    for i in range(min(total_slides, len(doc))):
        slide_texts[f"slide_{i}"] = doc[i].get_text().strip()
    doc.close()
    return slide_texts


async def _run_pipeline(
    presentation_id: str,
    audio_bytes: bytes,
    metadata: PresentationMetadata,
    presentations: dict,
    pdf_bytes: Optional[bytes] = None,
) -> None:
    try:
        with tempfile.NamedTemporaryFile(delete=False, suffix=".webm") as f:
            f.write(audio_bytes)
            audio_path = f.name

        try:
            # Stage: transcribing (step 2/5)
            presentations[presentation_id]["stage"] = PipelineStage.transcribing
            whisper_result = await transcribe_audio(audio_path)

            # --- Diagnostic logging ---
            words = whisper_result["words"]
            logger.warning(
                "[DIAG] Whisper returned %d words, duration=%.2f",
                len(words), whisper_result["duration"],
            )
            if words:
                logger.warning(
                    "[DIAG] Word timestamps — first: start=%.3f end=%.3f (%s) | last: start=%.3f end=%.3f (%s)",
                    words[0].start, words[0].end, words[0].word,
                    words[-1].start, words[-1].end, words[-1].word,
                )
                unique_starts = set(w.start for w in words)
                if len(unique_starts) <= 1:
                    logger.warning("[DIAG] ALL word timestamps have the same start value: %s", unique_starts)
            logger.warning(
                "[DIAG] slide_timestamps=%s, total_slides=%d",
                list(metadata.slide_timestamps), metadata.total_slides,
            )

            # Stage: indexing (step 3/5)
            presentations[presentation_id]["stage"] = PipelineStage.indexing
            indexed = index_slides(
                words=whisper_result["words"],
                slide_timestamps=list(metadata.slide_timestamps),
                total_slides=metadata.total_slides,
                recording_duration=whisper_result["duration"],
            )

            for sid, st in indexed.items():
                logger.warning(
                    "[DIAG] %s: range=[%.2f, %.2f) words=%d text=%s",
                    sid, st.start_time, st.end_time, len(st.words),
                    repr(st.text[:80]) if st.text else "(empty)",
                )

            # Extract slide text from PDF (if provided) for SLIDE_READING detection
            slide_texts: Dict[str, str] = {}
            if pdf_bytes:
                slide_texts = await asyncio.to_thread(
                    _extract_slide_texts, pdf_bytes, metadata.total_slides
                )

            # Stage: analyzing (step 4/5) — parallel
            presentations[presentation_id]["stage"] = PipelineStage.analyzing
            metrics, (feedback, observations) = await asyncio.gather(
                asyncio.to_thread(compute_manual_analytics, indexed, metadata.expectations),
                generate_llm_feedback(indexed, metadata.expectations, whisper_result["text"], slide_texts),
            )

            # Stage: aggregating (step 5/5)
            presentations[presentation_id]["stage"] = PipelineStage.aggregating
            results = aggregate_results(
                indexed,
                metrics,
                feedback,
                metadata.expectations,
                total_duration=whisper_result["duration"],
                presentation_id=presentation_id,
                observations=observations,
            )

            # Generate coaching summary (post-aggregation LLM call)
            try:
                coaching_tips = await generate_coaching_summary(results)
                results.coaching_summary = coaching_tips
            except Exception as coaching_exc:
                logger.warning("Coaching summary failed, continuing without: %s", coaching_exc)

            presentations[presentation_id]["status"] = ProcessingStatus.completed
            presentations[presentation_id]["results"] = results
            presentations[presentation_id]["chat_history"] = []

        finally:
            if os.path.exists(audio_path):
                os.remove(audio_path)

    except Exception as e:
        presentations[presentation_id]["status"] = ProcessingStatus.failed
        presentations[presentation_id]["error"] = "processing_failed"
        presentations[presentation_id]["error_message"] = str(e)


def _error(error: str, message: str, status_code: int, field: Optional[str] = None,
           status: Optional[str] = None, presentation_id: Optional[str] = None) -> JSONResponse:
    body: Dict[str, Any] = {"error": error, "message": message}
    if field is not None:
        body["field"] = field
    if status is not None:
        body["status"] = status
    if presentation_id is not None:
        body["presentation_id"] = presentation_id
    return JSONResponse(status_code=status_code, content=body)


@router.post("/presentations", status_code=202)
async def create_presentation(
    request: Request,
    audio: UploadFile = File(...),
    metadata: str = Form(...),
    slides: Optional[UploadFile] = File(None),
) -> JSONResponse:
    # --- Audio validation ---
    audio_bytes = await audio.read()

    if not audio_bytes:
        return _error(
            "validation_error",
            "Audio file must not be empty",
            400,
            field="audio",
        )

    if len(audio_bytes) > MAX_AUDIO_BYTES:
        return _error(
            "file_too_large",
            "Audio file must be under 100MB",
            413,
        )

    # --- Metadata validation ---
    try:
        metadata_dict = json.loads(metadata)
    except json.JSONDecodeError:
        return _error("validation_error", "metadata must be valid JSON", 400, field="metadata")

    try:
        meta = PresentationMetadata(**metadata_dict)
    except Exception as exc:
        # Surface the first Pydantic validation message
        msg = str(exc)
        return _error("validation_error", msg, 400, field="metadata")

    # slide_timestamps sorted ascending
    ts = meta.slide_timestamps
    for i in range(len(ts) - 1):
        if ts[i] > ts[i + 1]:
            return _error(
                "validation_error",
                "slide_timestamps must be sorted ascending",
                400,
                field="slide_timestamps",
            )

    # slide_timestamps length >= total_slides
    if len(ts) < meta.total_slides:
        return _error(
            "validation_error",
            "slide_timestamps length must be >= total_slides",
            400,
            field="slide_timestamps",
        )

    # --- Generate presentation ID and store initial state ---
    presentation_id = str(uuid.uuid4())

    presentations = request.app.presentations  # type: ignore[attr-defined]
    presentations[presentation_id] = {
        "status": ProcessingStatus.processing,
        "stage": PipelineStage.received,
        "metadata": meta,
        "results": None,
        "error_message": None,
        "audio_bytes": audio_bytes,
    }

    # Read optional PDF for SLIDE_READING detection
    pdf_bytes: Optional[bytes] = None
    if slides is not None:
        pdf_bytes = await slides.read()
        if not pdf_bytes:
            pdf_bytes = None

    task = asyncio.create_task(_run_pipeline(presentation_id, audio_bytes, meta, presentations, pdf_bytes))
    presentations[presentation_id]["_task"] = task  # prevent garbage collection

    return JSONResponse(
        status_code=202,
        content=UploadResponse(
            presentation_id=presentation_id,
            status="processing",
            message="Presentation received. Poll status endpoint for progress.",
        ).model_dump(),
    )


@router.get("/presentations/{presentation_id}/status")
async def get_status(presentation_id: str, request: Request) -> JSONResponse:
    presentations = request.app.presentations  # type: ignore[attr-defined]

    record = presentations.get(presentation_id)
    if record is None:
        return _error("not_found", "Presentation not found", 404)

    status: ProcessingStatus = record["status"]

    if status == ProcessingStatus.completed:
        return JSONResponse(
            status_code=200,
            content=StatusResponse(
                presentation_id=presentation_id,
                status=ProcessingStatus.completed,
            ).model_dump(exclude_none=True),
        )

    if status == ProcessingStatus.failed:
        return JSONResponse(
            status_code=200,
            content=StatusResponse(
                presentation_id=presentation_id,
                status=ProcessingStatus.failed,
                error="processing_failed",
                message=record.get("error_message") or "An error occurred during processing",
            ).model_dump(exclude_none=True),
        )

    # status == processing
    stage: PipelineStage = record["stage"]
    step_num, step_name = STAGE_STEPS[stage.value]

    return JSONResponse(
        status_code=200,
        content=StatusResponse(
            presentation_id=presentation_id,
            status=ProcessingStatus.processing,
            stage=stage,
            progress=ProgressInfo(
                current_step=step_num,
                total_steps=5,
                step_name=step_name,
            ),
        ).model_dump(exclude_none=True),
    )


@router.post("/presentations/{presentation_id}/chat")
async def chat(presentation_id: str, request: Request) -> JSONResponse:
    presentations = request.app.presentations  # type: ignore[attr-defined]

    record = presentations.get(presentation_id)
    if record is None:
        return _error("not_found", "Presentation not found", 404)

    if record["status"] != ProcessingStatus.completed:
        return _error(
            "not_ready",
            "Results must be available before starting a chat.",
            409,
            status="processing",
        )

    body = await request.json()
    try:
        chat_req = ChatRequest(**body)
    except Exception as exc:
        return _error("validation_error", str(exc), 400, field="message")

    results: PresentationResults = record["results"]
    chat_history: list = record.get("chat_history", [])

    try:
        response_text = await generate_chat_response(
            results, chat_history, chat_req.message
        )
    except Exception as exc:
        logger.warning("Chat response failed: %s", exc)
        return _error("processing_failed", "Failed to generate chat response", 500)

    chat_history.append({"role": "user", "content": chat_req.message})
    chat_history.append({"role": "assistant", "content": response_text})
    record["chat_history"] = chat_history

    return JSONResponse(
        status_code=200,
        content=ChatResponse(response=response_text).model_dump(),
    )


@router.get("/presentations/{presentation_id}/audio")
async def get_audio(presentation_id: str, request: Request):
    presentations = request.app.presentations  # type: ignore[attr-defined]

    record = presentations.get(presentation_id)
    if record is None:
        return _error("not_found", "Presentation not found", 404)

    if record["status"] == ProcessingStatus.processing:
        return _error("not_ready", "Still processing", 409, status="processing")

    audio = record.get("audio_bytes")
    if not audio:
        return _error("not_found", "Audio not available", 404)

    return Response(content=audio, media_type="audio/webm")


@router.get("/presentations/{presentation_id}/results")
async def get_results(presentation_id: str, request: Request) -> JSONResponse:
    presentations = request.app.presentations  # type: ignore[attr-defined]

    record = presentations.get(presentation_id)
    if record is None:
        return _error("not_found", "Presentation not found", 404)

    status: ProcessingStatus = record["status"]

    if status == ProcessingStatus.processing:
        return _error(
            "not_ready",
            "Processing is still in progress. Poll the status endpoint.",
            409,
            status="processing",
        )

    if status == ProcessingStatus.failed:
        return _error("not_found", "Presentation not found", 404)

    # status == completed
    results: PresentationResults = record["results"]
    return JSONResponse(status_code=200, content=results.model_dump())
