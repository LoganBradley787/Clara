# Clara — Frontend Specification

React + Vite + TypeScript frontend. This document is the complete reference for what is shipped and how it behaves. The frontend is implemented; this spec describes the actual surface, not a wish list.

---

## Tech Stack

- **React 19.2** with **TypeScript 5.9**
- **Vite 8** build tool
- **react-router-dom 7** (data routers, `createBrowserRouter`)
- **react-pdf 10** for slide rendering (pdfjs worker loaded from `pdfjs-dist/build/pdf.worker.min.mjs`)
- **Tailwind CSS v4** via `@tailwindcss/vite` (mandatory — not optional). CSS custom properties (`--accent`, `--bg-elevated`, `--cat-*`, etc.) drive theming. Inline `style={...}` objects + `className="category-label" / "metric-value" / "bg-warm-gradient" / "bg-deep-gradient" / "textured" / "loading-shimmer"` utility classes do the heavy lifting.
- **motion 12.38** (the successor to Framer Motion — imported as `motion/react`) for page transitions, staggered reveals, and the chat drawer
- **Fetch API** for HTTP — wrapped in `src/api/client.ts`
- **MediaRecorder API** for audio capture (webm output)

Backend LLM provider: **OpenAI** (the chat drawer footer says so verbatim — "Responses are generated from your presentation data via OpenAI.").

---

## Page Structure

```
/                          → LandingPage
/setup                     → SetupPage          (PDF upload + expectations)
/present                   → RecordingPage      (slide display + audio recording)
/processing                → ProcessingPage     (upload + polling state)
/results/:id               → ResultsPage        (full debrief)
/compare/:id1/:id2         → ComparisonPage     (two-attempt diff)
```

Routes are declared in `src/router.tsx` via `createBrowserRouter`. No nested layouts — each route renders a self-contained page.

---

## Page 1: Landing Page (`/`)

**Purpose:** Marketing entry point. Explain what Clara does and convert to `/setup`.

**Sections (top to bottom):**

1. **Hero** — Dark gradient (`#3B1215` → `#4A1E21` → `#2C1810`) with a radial glow behind the "Clara" wordmark. CTA button "Start a Session →" navigates to `/setup`. A floating 4-tile metrics preview (WPM, Filler Words, Pauses, Repeated) drifts on a perspective tilt to hint at the product.
2. **Why It Matters** — "The Problem" section with three problem cards: Pacing is invisible, Filler words hide in plain speech, Generic advice doesn't help.
3. **How It Works** — Three numbered steps (01 Upload & Configure, 02 Present Naturally, 03 Receive Telemetry) on a vertical timeline.
4. **What You Get** — Six capability cards, each tagged with a colored pill: Words Per Minute, Filler Word Detection, Pause Analysis, Repetition Tracking, Targeted Feedback, Slide-by-Slide Breakdown.
5. **Closing CTA** — Repeat of the dark gradient with a final "Get Started →" button.

**Behavior:**
- Both CTAs (`Start a Session →` and `Get Started →`) navigate to `/setup`
- No API calls
- All sections use motion staggered reveals with `whileInView` triggers

---

## Page 2: Setup Page (`/setup`)

**Purpose:** Upload a PDF deck and capture presentation expectations.

**Top-level sequence:** back link → page heading → PDF drop zone → `ExpectationsForm` → submit button.

### PDF Drop Zone
- Accepts `.pdf` / `application/pdf` only
- 50 MB max (`MAX_FILE_SIZE`)
- Drag-and-drop + click-to-browse
- On selection, the file is parsed with `pdfjs.getDocument` to extract `numPages`; that count is stored in context as `totalSlides`
- Upload card shows filename, size in human units, and page count
- "Remove" button clears the file and resets `totalSlides`
- Errors: non-PDF MIME, oversize, or unreadable PDF

### Expectations Form (`ExpectationsForm` component)
Three fields:

| Field | Type | Validation |
|-------|------|-----------|
| Tone | Radio group (5 cards) | Required |
| Expected Duration | Number input | 1–120 minutes, required |
| Context | Textarea | Required, ≤500 chars (live counter) |

**Tone values — these are the canonical enum** (must match the backend exactly):

| Value | Label | Description |
|-------|-------|-------------|
| `professional` | Professional | Board rooms, client reviews, formal reports |
| `conversational` | Conversational | Team syncs, demos, casual updates |
| `educational` | Educational | Lectures, workshops, training sessions |
| `persuasive` | Persuasive | Pitches, proposals, fundraising asks |
| `storytelling` | Storytelling | Keynotes, narratives, personal talks |

**Submit:** the form ID is `expectations-form`; the page's "Start Presenting →" button is `type="submit" form="expectations-form"`. It's disabled until a PDF is selected AND the form reports `onValidityChange(true)`. On submit, expectations are stored in context and the user navigates to `/present`.

---

## Page 3: Recording Page (`/present`)

**Purpose:** Display slides and record the presentation audio.

**Guards:** if `pdfFile` is missing from context (e.g. on direct navigation/refresh), redirect to `/setup`.

**Layout:**
- Top bar: pulsing red dot (when recording) + `MM:SS` elapsed time on the left, "Slide N / Total" on the right.
- Center: `SlideViewer` renders the current PDF page at `min(window.innerWidth * 0.8, 800)` px wide, wrapped in a motion fade/scale transition keyed on `currentSlide`.
- Footer: `← Prev` and `Next →` buttons, plus a secondary "End Presentation" button below.

**Behavior:**

1. **On page mount** (once `pdfFile` is present): `useAudioRecorder().startRecording()` opens the mic, creates a `MediaRecorder({ mimeType: 'audio/webm' })`, and starts a 100 ms-resolution elapsed-time timer. `slideTimestamps` is initialized to `[0.0]`.
2. **On `Next` click:** push `elapsedSeconds` onto `slideTimestamps` (a `useRef` array — not state, intentionally immutable to React renders), then advance display index. Disabled on the last slide.
3. **On `Prev` click:** display index decreases only. `slideTimestamps` is **never** mutated by Prev — past timestamps are immutable. Disabled at slide 0.
4. **On `End Presentation` click:** `stopRecording()` resolves with the blob, `setRecordingData(blob, slideTimestamps.current, totalSlides)` writes to context, navigate to `/processing`.

**Edge case:** if the user clicks Prev then Next again, `slideTimestamps` gains an extra entry. The backend truncates to the first `total_slides` entries before indexing. This is by design.

---

## Page 4: Processing Page (`/processing`)

**Purpose:** Submit the recording, then poll for status.

**Guards:** if any of `audioBlob`, `slideTimestamps`, `expectations`, or `totalSlides` is missing, redirect to `/setup`.

**Behavior:**

1. **On first mount only** (`submittedRef` guard prevents double-submit under StrictMode): construct `PresentationMetadata` from context and call `submitPresentation(audioBlob, metadata, pdfFile)`. The PDF file is forwarded as the optional `slides` multipart field so the backend can run SLIDE_READING and CONTENT_COVERAGE analysis.
2. Store the returned `presentation_id` in context. `usePolling(presentationId)` immediately starts polling `GET /api/presentations/{id}/status` every 2 seconds.
3. Render `ProcessingSteps` with the current `stage`. Steps below the active one show empty circles; the active step shows a pulsing dot; completed steps show green check circles with a connecting green line.
4. On `status === 'completed'`, branch:
   - If `previousAttemptId` is set in context → navigate `replace` to `/compare/{previousAttemptId}/{newId}`
   - Otherwise → navigate `replace` to `/results/{newId}`
5. On `status === 'failed'` or any submit error: render an error card with the message and a "Try Again" button that `resetAll()`s context and returns to `/setup`.

**Stage → display label mapping** (driven by `ProcessingSteps`):

| Stage | Display Text |
|-------|-------------|
| `received` | Upload received |
| `transcribing` | Transcribing audio |
| `indexing` | Indexing transcript |
| `analyzing` | Analyzing patterns & generating feedback |
| `aggregating` | Combining results |

Do **not** use `progress.step_name` from the API for display — it exists for debugging.

---

## Page 5: Results Page (`/results/:id`)

**Purpose:** Full debrief — overall metrics, audio playback synchronized with a per-slide timeline, coaching priorities, per-slide drill-down, and an "Ask Clara" chat drawer.

**Data fetch:**
- If `results` is already in context (came from `/processing`), use it.
- Otherwise call `GET /api/presentations/{id}/results`. On `status: 'processing'` redirect to `/processing`. On `error: 'not_found'` show a friendly "Presentation not found" empty state. Other errors render a generic "Something went wrong" page.

**Audio source resolution (in this order):**
1. If `audioBlob` is in context (just finished recording), `URL.createObjectURL(blob)`.
2. Otherwise call `getAudioUrl(id)` which `GET`s `/api/presentations/{id}/audio` and returns a blob URL.
3. The blob URL is fed into `useAudioPlayer`, which manages an `HTMLAudioElement` plus rAF-driven `currentTime` updates.

**Layout (top to bottom):**

### Zone 1 — `OverallMetrics` (dark gradient bar)
Displays Avg WPM, Duration (`actual / expected` plus `(±Ns)` deviation), Filler Words count, Pauses count. Right side has two buttons:
- **Practice Again** (accent color) → calls `startPracticeAgain(id)` on context (preserves `pdfFile`, `expectations`, `totalSlides`; stores `id` as `previousAttemptId`; resets everything else) and navigates to `/present`.
- **New Presentation** (translucent) → `resetAll()` + navigate to `/setup`.

### Zone 2 — `AudioPlayer` + `PresentationTimeline`
Rendered only when an `audioSrc` is available.

- **`AudioPlayer`** — play/pause button, current time, click-to-seek progress bar, total duration. Bound to the shared `useAudioPlayer` instance.
- **`PresentationTimeline`** — single horizontal bar segmented by slide width-proportional-to-duration:
  - Each segment colored by `metrics.speaking_pace` (`--pace-slow`, `--pace-normal`, `--pace-fast`) at 0.35 opacity, hover bumps to 0.55, with the slide number rendered at the bottom of each segment.
  - **Filler markers:** small accent-colored diamonds (5×5px, rotated 45°) at each `filler_words.instances[].timestamp`.
  - **Pause markers:** translucent warning-color bars spanning each pause's `start → end`.
  - **Playhead:** thin 2px vertical line at the current time.
  - Click anywhere on the bar to seek; click a segment to seek to that slide's `start_time` AND select that slide.
  - Legend on the right: slow / normal / fast dots, filler diamond, pause bar.

### Zone 3 — `CoachingSummary` ("Clara's Debrief")
Rendered when `coaching_summary.length > 0`. Each `CoachingTip` is a card with:
- A large faded `01` / `02` / `03` numeral in the corner
- A bold accent-colored title
- An explanation paragraph
- A row of clickable "Slide N" chips parsed from `slide_references` (e.g. `slide_3` → "Slide 4"). Clicking a chip calls `onSlideClick(idx)` on the page, which selects that slide in the drill-down below.

Grid auto-sizes to `min(tips.length, 3)` columns.

### Zone 4 — Two-column drill-down (CSS class `.results-grid`)

**Left column:**
- `SlideViewer` rendering page `selectedSlideIndex + 1` of `pdfFile`
- Caption: "Slide N of Total"

**Right column:** wrapped in `<AnimatePresence mode="wait">` keyed on the current `slide_${i}` so the panel cross-fades when the selected slide changes.

1. **Metrics card** → `MetricsPanel` with a 3-column grid showing:
   - WPM + pace pill (`Slow` / `Normal` / `Fast`)
   - Word count
   - Slide duration
   - Filler Words: count + unique filler words list, clickable when count > 0 (triggers `onFillerClick` which expands the transcript and scrolls to it)
   - Pauses: count + "longest" pill; the whole cell switches to a warning-tinted background when count > 0 and toggles an expanded list of pause durations
   - Repeated Phrases: pill list of `phrase (count)` chips

2. **Content Coverage card** → `CoverageChecklist` (only if a `CONTENT_COVERAGE` observation exists on the slide). Shows "N of M concepts addressed", a wrap of pill chips for `evidence.concepts_covered` (green check style) and `evidence.concepts_missed` (red strike-through style), and the observation `detail` text below.

3. **Transcript card** → `TranscriptPanel` with the slide's transcript. See the Transcript section below for full behavior.

### Zone 5 — `SlideCarousel`
Bottom horizontal row of numbered buttons (1..total). Selected slide is highlighted with the accent color. Click to jump.

### Floating — `ChatPanel`
A right-edge vertical tab labeled "Ask Clara" that, when clicked, slides in a 420px (max 90vw) right drawer. See the Chat section below.

### Auto-advance behavior
A `useEffect` watches `player.currentTime` while `isPlaying`. It walks slide bounds from the end backward looking for the largest `start_time ≤ currentTime` and sets `selectedSlideIndex` to that. The drill-down and `SlideViewer` follow audio playback automatically.

---

## Page 6: Comparison Page (`/compare/:id1/:id2`)

**Purpose:** Compare two consecutive practice attempts. Reached only when the user clicks "Practice Again" on a results page — `startPracticeAgain(prevId)` stores the previous ID, and after the next presentation completes processing, the user lands here instead of `/results`.

**Data fetch:** `Promise.all([getResults(id1), getResults(id2)])`. `id1` is the previous attempt; `id2` is the new one. Errors fall back to a generic empty state.

**Layout:**

### Header (dark gradient bar)
- Title "Practice Comparison" + subtitle "See how you improved between attempts"
- "View Latest Results" button → `/results/{id2}`
- "Practice Again" button → `startPracticeAgain(id2)` then `/present`

### Overall Metrics section
Grid of four `ComparisonMetric` / `DurationMetric` cards:

- Avg WPM (closer-to-prev means improvement)
- Total Filler Words (lower is better)
- Total Pauses (lower is better)
- Duration (smaller `|duration_deviation_seconds|` is better)

Each card shows the new value prominently, the delta with a colored arrow (`↓` improved → green; `↑` regressed → warning red; `–` no change → muted), and "was N" beneath.

### Per-Slide Breakdown
For each slide index up to `max(prev.total_slides, curr.total_slides)`, render a row with:
- "Slide N" label (left)
- Four `MiniCompare` / `PaceCompare` cells: WPM, Fillers (lower-better), Pauses (lower-better), Pace pill (capitalized, colored by `--pace-{slow|normal|fast}`).

Rows where either side lacks that slide index are skipped.

---

## Components Reference

The frontend ships **13 components** in `src/components/`. None are dead code.

| Component | Used on | Responsibility |
|-----------|---------|---------------|
| `AudioPlayer` | Results | Play/pause + click-to-seek scrubber bound to a `useAudioPlayer` instance |
| `ChatPanel` | Results | Floating right-edge "Ask Clara" trigger + slide-in drawer. POSTs to `/chat`, renders user/assistant message thread, includes 4 suggested-question buttons in the empty state |
| `CoachingSummary` | Results | "Clara's Debrief" card with up to 3 `CoachingTip` cards (title, explanation, clickable slide chips) |
| `CoverageChecklist` | Results | Visualizes a `CONTENT_COVERAGE` `ObservationItem`: covered/missed concept pills + detail text |
| `ExpectationsForm` | Setup | Radio-card tone picker (5 options), duration input, context textarea with char counter. Reports validity via `onValidityChange` |
| `FeedbackPanel` | (Available — feedback is currently rendered inline in `TranscriptPanel`. `FeedbackPanel` is the standalone list view that owns the canonical `--cat-*` color mapping.) | Renders a list of `FeedbackItem`s with left border + pill in the type's color |
| `MetricsPanel` | Results | 3-column grid of slide-level metric cells: WPM + pace pill, words, duration, fillers (clickable), pauses (toggleable list), repeated phrases |
| `OverallMetrics` | Results | Top dark-gradient bar with Avg WPM / Duration / Fillers / Pauses + "Practice Again" and "New Presentation" buttons |
| `PresentationTimeline` | Results | Pace-colored per-slide segments, filler diamonds, pause bars, playhead, click-to-seek, click-segment-to-select |
| `ProcessingSteps` | Processing | Vertical 5-step list (received → transcribing → indexing → analyzing → aggregating) with green check / pulsing accent / empty-circle states and a connecting line that turns green as it progresses |
| `SlideCarousel` | Results | Horizontal scrollable row of numbered slide buttons |
| `SlideViewer` | Recording, Results | `react-pdf` renderer with shimmer placeholder, `ResizeObserver`-driven auto width, and error fallback |
| `TranscriptPanel` | Results | Renders the slide transcript. Two render modes: live (word-by-word karaoke highlight tied to `currentTime`) when `words` and `currentTime` are provided, OR static with inline `<mark>` annotations for filler words and feedback (clickable `InlineAnnotationMark` reveals the `detail` tooltip). Auto-expands when transcript is short and has annotations |

### Hooks (3, in `src/hooks/`)

| Hook | Returns | Used by |
|------|---------|---------|
| `useAudioRecorder()` | `{ isRecording, elapsedSeconds, startRecording, stopRecording }` — wraps `MediaRecorder` with `audio/webm`, 250 ms chunk timeslices, 100 ms elapsed-time timer | RecordingPage |
| `useAudioPlayer(src, fallbackDuration?)` | `{ isPlaying, currentTime, duration, isReady, play, pause, toggle, seek }` — wraps an `HTMLAudioElement` with rAF-driven `currentTime` polling. Falls back to `fallbackDuration` (the server-reported `total_duration_seconds`) when the audio element hasn't yet reported its own duration | ResultsPage / AudioPlayer / PresentationTimeline / TranscriptPanel |
| `usePolling(presentationId)` | `{ stage, currentStep, totalSteps, isComplete, isFailed, errorMessage }` — polls `GET /status` every 2 s, stops on completed/failed | ProcessingPage |

---

## Feedback Model

The frontend renders **two distinct streams** off each `SlideResult`:

### `feedback: FeedbackItem[]`

```typescript
interface FeedbackItem {
  type: 'REPETITION' | 'HEDGE_STACK' | 'FALSE_START' | 'SLIDE_READING';
  text: string;    // the literal span in the transcript this points to (≤ ~200 chars)
  detail: string;  // human-readable explanation (≤ 200 chars)
}
```

Feedback is rendered **inline** inside `TranscriptPanel` — `text` is located within the transcript via case-insensitive substring search, wrapped in an `InlineAnnotationMark`, underlined in the type's color with a small pill tag, and reveals `detail` in a popover on click. `FeedbackPanel` is the standalone list variant available for cases where inline placement isn't desired.

**Type → color mapping** (defined as CSS custom properties; the canonical mapping lives in `FeedbackPanel.tsx` and `TranscriptPanel.tsx`):

| Type | Label | CSS variable |
|------|-------|-------------|
| `REPETITION` | repetition | `--cat-repetition` |
| `HEDGE_STACK` | hedge stack | `--cat-hedge-stack` |
| `FALSE_START` | false start | `--cat-false-start` |
| `SLIDE_READING` | slide reading | `--cat-slide-reading` |

There is **no** `category`, `comment`, or `severity` field. There is no `pacing` / `clarity` / `diction` / `structure` / `timing` taxonomy. Pacing is surfaced via the `speaking_pace` enum on `SlideMetrics`, not feedback.

### `observations: ObservationItem[]`

```typescript
interface ObservationItem {
  type: 'CONTENT_COVERAGE';
  detail: string;
  evidence?: {
    concepts_covered?: string[];
    concepts_missed?: string[];
    [k: string]: unknown;
  };
}
```

Observations live in a **separate array** from feedback. Currently only one type ships: `CONTENT_COVERAGE`, rendered by `CoverageChecklist` between the metrics card and transcript card. It requires that the user uploaded slides (a PDF) — without `slides` in the original submission, the backend can't produce coverage observations.

---

## State Management

A single `AppContext` (in `src/context/AppContext.tsx`) holds all cross-page state using `useReducer`. Two contexts are exposed: read-only `useAppState()` and `useAppActions()`.

```typescript
interface AppState {
  // Setup
  pdfFile: File | null;
  expectations: PresentationExpectations | null;

  // Recording
  audioBlob: Blob | null;
  slideTimestamps: number[];
  totalSlides: number;

  // Results
  presentationId: string | null;
  results: PresentationResults | null;

  // Comparison flow
  previousAttemptId: string | null;
}
```

**Actions:**

| Action | Effect |
|--------|--------|
| `setPdfFile`, `setTotalSlides`, `setExpectations` | Setup writes |
| `setRecordingData(audio, timestamps, totalSlides)` | RecordingPage writes on End |
| `setPresentationId(id)` | ProcessingPage writes after `POST /presentations` |
| `setResults(results)` | ResultsPage caches the fetched payload |
| `startPracticeAgain(previousId)` | **Preserves** `pdfFile`, `expectations`, `totalSlides`; **stores** `previousId` as `previousAttemptId`; **resets** `audioBlob`, `slideTimestamps`, `presentationId`, `results`. Used to enter `/present` for a re-attempt. The next completed processing run routes to `/compare/{previousId}/{newId}` |
| `resetAll()` | Wipes everything to `initialState` |

---

## API Integration Summary

All API calls live in `src/api/client.ts`. Base URL is `import.meta.env.VITE_API_URL || '/api'`. Errors are wrapped in `ApiClientError` carrying the parsed `ApiError` body (`{error, message, field?, status?, presentation_id?}`).

| Endpoint | Method | Called by | Body / Notes |
|----------|--------|-----------|--------------|
| `/presentations` | POST | ProcessingPage | `multipart/form-data` with three fields: `audio` (webm blob, filename `recording.webm`), `metadata` (JSON-stringified `PresentationMetadata`), and optional `slides` (the original PDF File — required for SLIDE_READING feedback and CONTENT_COVERAGE observations). Expects `202` with `{presentation_id, status, message}` |
| `/presentations/{id}/status` | GET | ProcessingPage (via `usePolling`) | Poll every 2 s; one of `processing` / `completed` / `failed` |
| `/presentations/{id}/results` | GET | ResultsPage, ComparisonPage | Returns `PresentationResults`. On `409`/`status: 'processing'`, results page redirects to `/processing`. On `not_found`, shows empty state |
| `/presentations/{id}/audio` | GET | ResultsPage | Returns the original `audio/webm` blob. Client converts to `URL.createObjectURL` for `<audio>` playback. Only called when no in-memory `audioBlob` exists (i.e. after a refresh or when arriving via deep link) |
| `/presentations/{id}/chat` | POST | ChatPanel | `application/json` body `{message: string}`. Returns `{response: string}`. Powered by OpenAI on the backend |

---

## Aesthetic Goals

- **Warm, editorial, document-like.** Hero and CTA sections lean into a deep burgundy gradient (`#3B1215` → `#2C1810`); content sections sit on a warm cream-tinted base (`bg-warm-gradient`) with a subtle paper-grain texture (`.textured`).
- **Typography-driven hierarchy** via three families: `var(--font-display)` (italic serif accents), `var(--font-body)` (sans), `var(--font-mono)` (numerics and category labels).
- **Color is semantic.** Pace colors (`--pace-slow/normal/fast`), pause warnings (`--pause-warning`), and the four feedback type colors (`--cat-*`) are the only saturated colors; everything else is on a warm neutral scale.
- **Motion is restrained.** Staggered reveals on first paint, spring-driven drawer for chat, gentle hover lifts on the tone cards. No looping animations except the recording dot pulse, the processing-step active pulse, and a slow hero-tile float.

---

## Interaction Behavior Cheat Sheet

| Action | Result |
|--------|--------|
| Click slide in `SlideCarousel` | Updates right panel, slide viewer, and resets transcript expand state |
| Click a segment on `PresentationTimeline` | Seeks audio to that slide's `start_time` AND selects the slide |
| Click anywhere else on `PresentationTimeline` | Seeks audio + selects whichever slide owns that time |
| Click a slide chip in a `CoachingTip` | Selects that slide |
| Click a filler-word count in `MetricsPanel` | Expands transcript and scrolls to it |
| Click pause count in `MetricsPanel` | Toggles inline list of pause durations |
| Click an inline `InlineAnnotationMark` in transcript | Toggles a popover with the feedback `detail` |
| Click play in `AudioPlayer` | Begins playback; selected slide auto-advances based on `currentTime`; transcript switches to karaoke word-highlight mode |
| Click "Practice Again" (Results or Comparison header) | `startPracticeAgain(currentId)` → `/present` (reuses pdf + expectations) |
| Click "New Presentation" | `resetAll()` → `/setup` |
| Click "Ask Clara" tab on right edge | Opens chat drawer |

---

## Information Density Rules

1. **Numbers up front, prose underneath.** `OverallMetrics` and `MetricsPanel` are scannable; feedback details live one level deeper (inline annotations + popovers).
2. **Empty states have language.** "No filler words detected", "No notable pauses", "No repeated phrases", "No feedback generated for this slide." — never bare zeros.
3. **Progressive disclosure on transcript.** Long transcripts collapse to a 100-char preview with a "Show more" toggle; short transcripts auto-expand when they carry annotations.
4. **Pause cells escalate visually.** Any pause cell with `count > 0` turns warning-tinted and grows a 3 px inset bar on the left.
5. **Pills are scan anchors.** Pace, filler, pause, and category type pills let the eye find the right metric without reading.

---

## Notable Implementation Details

- **PDF.js worker** is initialized in both `SetupPage` and `SlideViewer` via `new URL('pdfjs-dist/build/pdf.worker.min.mjs', import.meta.url)` so Vite emits and serves it correctly.
- **StrictMode double-mount** on `/processing` is defended against with a `submittedRef` flag so the recording is uploaded exactly once.
- **Audio blob lifecycle:** the blob URL is revoked on unmount via the effect cleanup so memory isn't leaked across navigations.
- **Karaoke transcript mode** only activates when both `words` (with timestamps) and a live `currentTime` are provided — i.e. during audio playback on the Results page.
- **Comparison rows** are skipped silently when either side is missing that slide index, so attempts with different slide counts still render gracefully.
