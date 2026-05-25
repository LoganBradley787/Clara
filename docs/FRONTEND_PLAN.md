# Clara — Frontend Implementation Plan

> **Historical document.** This was the original build plan written before the frontend existed. The shipped frontend has evolved past it: features like ChatPanel, CoachingSummary, CoverageChecklist, PresentationTimeline, and the Comparison page are not described here, and the feedback taxonomy below (`category` / `severity` with `pacing` / `clarity` / `diction` / `structure` / `timing`) was replaced with `{type, text, detail}` and four flag types (`REPETITION`, `HEDGE_STACK`, `FALSE_START`, `SLIDE_READING`) plus a separate `observations[]` array.
>
> For current frontend behavior, see [`FRONTEND_SPEC.md`](FRONTEND_SPEC.md). Kept for reference — useful for design-system rationale and the original build sequencing.

A complete build plan for the React + Vite + TypeScript frontend. Every section references the relevant spec document. Nothing is invented — every feature traces back to `FRONTEND_SPEC.md`, `API_SPEC.md`, or `DATA_SCHEMAS.md`.

---

## Table of Contents

1. [Design System](#1-design-system)
2. [Project Scaffolding](#2-project-scaffolding)
3. [TypeScript Types](#3-typescript-types)
4. [API Client](#4-api-client)
5. [State Management](#5-state-management)
6. [Routing](#6-routing)
7. [Custom Hooks](#7-custom-hooks)
8. [Page-by-Page Implementation](#8-page-by-page-implementation)
9. [Shared Components](#9-shared-components)
10. [Animation System](#10-animation-system)
11. [Build Sequence](#11-build-sequence)

---

## 1. Design System

### Inspiration

The visual language draws from editorial print design and luxury brand presentation — warm, confident, and typographically driven. Think research journal meets mission control: dense with information but never cluttered, atmospheric but never decorative.

### Color Palette

All colors defined as CSS custom properties on `:root`. No magic values in component styles.

```css
:root {
  /* Backgrounds — warm, layered, never flat */
  --bg-base: #FAF6F1;            /* Warm parchment — primary surface */
  --bg-elevated: #F3ECE4;        /* Slightly deeper — cards, panels */
  --bg-recessed: #EAE0D5;        /* Inset areas — code blocks, transcript wells */
  --bg-deep: #3B1215;            /* Deep burgundy — hero sections, dark panels */
  --bg-deep-muted: #4A1E21;      /* Lighter variant of deep for hover states */

  /* Text */
  --text-primary: #2C1810;       /* Near-black warm brown — body text */
  --text-secondary: #6B5547;     /* Muted warm — labels, captions */
  --text-tertiary: #9A8677;      /* Subtle — placeholders, disabled */
  --text-on-dark: #FAF6F1;       /* Light text on dark backgrounds */
  --text-on-dark-muted: #C4A98F; /* Muted light text on dark backgrounds */

  /* Accent — burgundy family */
  --accent: #7A2C30;             /* Primary burgundy accent — CTAs, active states */
  --accent-hover: #922F34;       /* Lighter on hover */
  --accent-muted: #7A2C3033;     /* Transparent burgundy — subtle highlights */

  /* Semantic — feedback category tags (from FRONTEND_SPEC.md) */
  --cat-pacing: #2B5F8A;         /* Steel blue */
  --cat-repetition: #B5652A;     /* Burnt sienna */
  --cat-clarity: #3A7D5E;        /* Forest green */
  --cat-diction: #6B4C8A;        /* Muted plum */
  --cat-structure: #7A7067;      /* Warm gray */
  --cat-timing: #A13B3B;         /* Deep red */

  /* Semantic — pace badges (from FRONTEND_SPEC.md) */
  --pace-slow: #B5862A;          /* Amber/gold */
  --pace-normal: #3A7D5E;        /* Forest green (same as clarity for semantic match) */
  --pace-fast: #B5862A;          /* Amber/gold (same as slow — both are "notable") */

  /* Severity */
  --severity-observation: var(--text-secondary);
  --severity-suggestion: var(--accent);

  /* Borders and dividers */
  --border-subtle: #D9CFC4;
  --border-strong: #B5A898;

  /* Surfaces */
  --surface-glass: rgba(250, 246, 241, 0.7);
}
```

**Gradient treatments** (for backgrounds with depth — `frontend.mdc` mandates no flat backgrounds):

```css
.bg-warm-gradient {
  background: linear-gradient(
    165deg,
    var(--bg-base) 0%,
    #F0E4D8 40%,
    #E8D5C8 100%
  );
}

.bg-deep-gradient {
  background: linear-gradient(
    165deg,
    var(--bg-deep) 0%,
    #4A1E21 50%,
    #2C1810 100%
  );
}
```

**Noise texture overlay** — apply via a pseudo-element on key background surfaces for that analog/editorial grain:

```css
.textured::after {
  content: '';
  position: absolute;
  inset: 0;
  opacity: 0.03;
  background-image: url("data:image/svg+xml,..."); /* tiny noise pattern */
  pointer-events: none;
}
```

### Typography

Two-font system: expressive serif display + highly legible sans body.

| Role | Font | Weight | Usage |
|------|------|--------|-------|
| Display | **Instrument Serif** | 400 regular | Page titles, hero text, large headings |
| Display italic | **Instrument Serif** | 400 italic | Emphasis in headings, section subtitles, decorative moments |
| Body | **IBM Plex Sans** | 300–600 | All body text, labels, data values, UI elements |
| Mono | **IBM Plex Mono** | 400–500 | Metric numbers, timestamps, code-like data |

Load via Google Fonts:

```html
<link href="https://fonts.googleapis.com/css2?family=Instrument+Serif:ital@0;1&family=IBM+Plex+Sans:wght@300;400;500;600&family=IBM+Plex+Mono:wght@400;500&display=swap" rel="stylesheet">
```

**Typographic scale** — define as CSS custom properties:

```css
:root {
  --font-display: 'Instrument Serif', Georgia, serif;
  --font-body: 'IBM Plex Sans', system-ui, sans-serif;
  --font-mono: 'IBM Plex Mono', 'Menlo', monospace;

  --text-xs: 0.75rem;     /* 12px — micro labels */
  --text-sm: 0.8125rem;   /* 13px — captions, secondary labels */
  --text-base: 0.9375rem; /* 15px — body text */
  --text-lg: 1.125rem;    /* 18px — emphasized body, section intros */
  --text-xl: 1.5rem;      /* 24px — section headings */
  --text-2xl: 2rem;        /* 32px — page headings */
  --text-3xl: 2.75rem;    /* 44px — display/hero */
  --text-4xl: 3.5rem;     /* 56px — landing hero */
}
```

**Font feature settings:**

```css
.metric-value {
  font-family: var(--font-mono);
  font-variant-numeric: tabular-nums;
}

.category-label {
  font-family: var(--font-body);
  font-weight: 500;
  letter-spacing: 0.02em;
  text-transform: uppercase;
  font-size: var(--text-xs);
}
```

### Spacing System

8px base grid. All spacing uses these tokens:

```css
:root {
  --space-1: 0.25rem;   /* 4px */
  --space-2: 0.5rem;    /* 8px */
  --space-3: 0.75rem;   /* 12px */
  --space-4: 1rem;      /* 16px */
  --space-5: 1.5rem;    /* 24px */
  --space-6: 2rem;      /* 32px */
  --space-7: 3rem;      /* 48px */
  --space-8: 4rem;      /* 64px */
  --space-9: 6rem;      /* 96px */
}
```

### Border Radii

Subtle, not bubbly. This is an analytical tool, not a consumer app.

```css
:root {
  --radius-sm: 4px;
  --radius-md: 6px;
  --radius-lg: 10px;
  --radius-xl: 16px;
}
```

### Shadow System

Warm-toned shadows that feel like natural light, not CSS defaults:

```css
:root {
  --shadow-sm: 0 1px 3px rgba(44, 24, 16, 0.06);
  --shadow-md: 0 4px 12px rgba(44, 24, 16, 0.08);
  --shadow-lg: 0 8px 30px rgba(44, 24, 16, 0.12);
  --shadow-inner: inset 0 1px 3px rgba(44, 24, 16, 0.06);
}
```

---

## 2. Project Scaffolding

### Initialize

```bash
npm create vite@latest frontend -- --template react-ts
cd frontend
```

### Dependencies

Per `REPO_STRUCTURE.md` and `FRONTEND_SPEC.md`:

```json
{
  "dependencies": {
    "react": "^18",
    "react-dom": "^18",
    "react-router-dom": "^6",
    "react-pdf": "^9",
    "motion": "^12"
  },
  "devDependencies": {
    "typescript": "^5",
    "vite": "^6",
    "@types/react": "^18",
    "@types/react-dom": "^18",
    "tailwindcss": "^4",
    "@tailwindcss/vite": "^4"
  }
}
```

**Why these specific libraries:**
- `react-pdf` v9 — PDF rendering (`FRONTEND_SPEC.md` requirement). Uses `pdfjs-dist` under the hood; needs worker configuration.
- `motion` (Framer Motion) — orchestrated animations (`frontend.mdc` mandates it for page transitions, staggered reveals, layout animations).
- `tailwindcss` v4 — utility CSS, but **must be heavily customized** (`frontend.mdc` bans default Tailwind palette). Configure with custom design tokens above.

### Tailwind Configuration

Extend Tailwind v4 with the design tokens. All default colors replaced with the Clara palette. The default fontFamily is overridden entirely — no Inter, no system defaults leaking through.

### react-pdf Worker Setup

```typescript
import { pdfjs } from 'react-pdf';
pdfjs.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.min.mjs',
  import.meta.url,
).toString();
```

### Vite Config

```typescript
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:8000',
        changeOrigin: true
      }
    }
  }
});
```

The proxy avoids CORS issues in development — requests to `/api/*` forward to the FastAPI server.

### File Structure

Matches `REPO_STRUCTURE.md` exactly:

```
frontend/src/
├── main.tsx
├── App.tsx
├── router.tsx
├── context/
│   └── AppContext.tsx
├── pages/
│   ├── LandingPage.tsx
│   ├── SetupPage.tsx
│   ├── RecordingPage.tsx
│   ├── ProcessingPage.tsx
│   └── ResultsPage.tsx
├── components/
│   ├── SlideViewer.tsx
│   ├── AudioRecorder.tsx
│   ├── SlideCarousel.tsx
│   ├── MetricsPanel.tsx
│   ├── FeedbackPanel.tsx
│   ├── TranscriptPanel.tsx
│   ├── OverallMetrics.tsx
│   ├── ProcessingSteps.tsx
│   └── ExpectationsForm.tsx
├── hooks/
│   ├── useAudioRecorder.ts
│   └── usePolling.ts
├── api/
│   └── client.ts
├── types/
│   └── index.ts
└── styles/
    └── index.css
```

---

## 3. TypeScript Types

Derived directly from `DATA_SCHEMAS.md`. Every field, every type, every nesting level must match exactly. See `api-contracts.mdc` §TypeScript/Pydantic Parity.

```typescript
// === API Request Types ===

export interface PresentationExpectations {
  tone: 'formal' | 'casual' | 'informative' | 'persuasive';
  expected_duration_minutes: number;
  context: string;
}

export interface PresentationMetadata {
  slide_timestamps: number[];
  expectations: PresentationExpectations;
  total_slides: number;
}

// === API Response Types ===

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

// === Results Types (DATA_SCHEMAS.md §7) ===

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
  category: 'pacing' | 'repetition' | 'clarity' | 'diction' | 'structure' | 'timing';
  comment: string;
  severity: 'observation' | 'suggestion';
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

export interface PresentationResults {
  presentation_id: string;
  total_slides: number;
  total_duration_seconds: number;
  overall_metrics: OverallMetrics;
  slides: Record<string, SlideResult>;
}

// === Error Types (API_SPEC.md §Standard Error Format) ===

export interface ApiError {
  error: string;
  message: string;
  field?: string;
  status?: string;
  presentation_id?: string;
}

// === App State Types (FRONTEND_SPEC.md §State Management) ===

export type FeedbackCategory = FeedbackItem['category'];
export type SpeakingPace = SlideMetrics['speaking_pace'];
export type Tone = PresentationExpectations['tone'];
export type ProcessingStage = StatusResponseProcessing['stage'];
```

---

## 4. API Client

Single file: `src/api/client.ts`. All API calls centralized here per `frontend.mdc`. No inline fetch calls in components.

### Functions

```typescript
const BASE_URL = '/api';

// POST /api/presentations — API_SPEC.md §POST
async function submitPresentation(
  audio: Blob,
  metadata: PresentationMetadata
): Promise<SubmitResponse>

// GET /api/presentations/{id}/status — API_SPEC.md §GET status
async function getStatus(
  presentationId: string
): Promise<StatusResponse>

// GET /api/presentations/{id}/results — API_SPEC.md §GET results
async function getResults(
  presentationId: string
): Promise<PresentationResults>
```

### Implementation Details

**`submitPresentation`:**
1. Create `FormData` object.
2. Append `audio` blob as `audio` field.
3. Append `JSON.stringify(metadata)` as `metadata` field.
4. `POST` with no explicit `Content-Type` header (browser sets `multipart/form-data` boundary automatically).
5. On 202: return parsed `SubmitResponse`.
6. On 400: throw with parsed `ApiError` including `field`.
7. On 413: throw with parsed `ApiError`.

**`getStatus`:**
1. `GET /api/presentations/${id}/status`.
2. On 200: parse and return discriminated union `StatusResponse` based on `status` field.
3. On 404: throw with parsed `ApiError`.

**`getResults`:**
1. `GET /api/presentations/${id}/results`.
2. On 200: parse and return `PresentationResults`.
3. On 404: throw with parsed `ApiError`.
4. On 409: throw with parsed `ApiError` (contains `status: "processing"`).

**Error handling pattern:**
- All functions throw a custom `ApiError` on non-success responses.
- Components catch and display appropriate UI (inline validation, error banners, redirect).

---

## 5. State Management

React Context with a single provider wrapping the app. Per `FRONTEND_SPEC.md` §State Management.

### Context Shape

```typescript
interface AppState {
  // Setup phase
  pdfFile: File | null;
  expectations: PresentationExpectations | null;

  // Recording phase
  audioBlob: Blob | null;
  slideTimestamps: number[];
  totalSlides: number;

  // Results phase
  presentationId: string | null;
  results: PresentationResults | null;
}

interface AppActions {
  setPdfFile: (file: File) => void;
  setExpectations: (exp: PresentationExpectations) => void;
  setRecordingData: (audio: Blob, timestamps: number[], totalSlides: number) => void;
  setPresentationId: (id: string) => void;
  setResults: (results: PresentationResults) => void;
  resetAll: () => void;
}
```

### Provider

`src/context/AppContext.tsx` — uses `useReducer` internally for clean state transitions. Exports `useAppState()` and `useAppActions()` hooks to avoid unnecessary re-renders (split the value from the dispatcher).

### State Lifecycle

```
LandingPage → (no state)
SetupPage → sets pdfFile, expectations
RecordingPage → reads pdfFile, sets audioBlob + slideTimestamps + totalSlides
ProcessingPage → reads audioBlob + slideTimestamps + totalSlides + expectations, sets presentationId
ResultsPage → reads presentationId, sets results
"New Presentation" → resetAll() → navigate to /setup
```

### Guard Rails

- `RecordingPage` redirects to `/setup` if `pdfFile` is null.
- `ProcessingPage` redirects to `/setup` if `audioBlob` is null.
- `ResultsPage` fetches from API using URL param `:id` — does not require context state (allows direct URL access and refresh).

---

## 6. Routing

`src/router.tsx` using React Router v6 per `FRONTEND_SPEC.md`:

```typescript
const routes = [
  { path: '/',            element: <LandingPage /> },
  { path: '/setup',       element: <SetupPage /> },
  { path: '/present',     element: <RecordingPage /> },
  { path: '/processing',  element: <ProcessingPage /> },
  { path: '/results/:id', element: <ResultsPage /> },
];
```

Page transitions animated with Motion's `AnimatePresence` and `motion.div` wrapper. Each page gets a fade + slight vertical shift on enter/exit.

---

## 7. Custom Hooks

### `useAudioRecorder`

`src/hooks/useAudioRecorder.ts`

Encapsulates the MediaRecorder API per `FRONTEND_SPEC.md` §Recording Page and `PIPELINE.md` §Step 1.

```typescript
interface UseAudioRecorderReturn {
  isRecording: boolean;
  elapsedSeconds: number;     // continuously updated timer
  startRecording: () => Promise<void>;
  stopRecording: () => Promise<Blob>;
}
```

**Internal behavior:**
1. `startRecording()`: request `navigator.mediaDevices.getUserMedia({ audio: true })`, create `MediaRecorder({ mimeType: 'audio/webm' })`, start collecting chunks in an array, start a `setInterval` timer updating `elapsedSeconds` every 100ms.
2. `stopRecording()`: stop the MediaRecorder, wait for `ondataavailable` and `onstop` events, construct and return a `Blob` from collected chunks with type `audio/webm`.
3. Cleanup: on unmount, stop recording and release media stream tracks.

### `usePolling`

`src/hooks/usePolling.ts`

Encapsulates the 2-second polling loop per `api-contracts.mdc` §6–8.

```typescript
interface UsePollingReturn {
  stage: ProcessingStage | null;
  currentStep: number;
  totalSteps: number;
  isComplete: boolean;
  isFailed: boolean;
  errorMessage: string | null;
}

function usePolling(presentationId: string | null): UsePollingReturn
```

**Internal behavior:**
1. When `presentationId` is non-null, start a `setInterval` at 2000ms calling `getStatus()`.
2. On `status: "processing"`: update `stage`, `currentStep`, `totalSteps` from the response.
3. On `status: "completed"`: set `isComplete = true`, clear interval.
4. On `status: "failed"`: set `isFailed = true`, store `errorMessage`, clear interval.
5. Cleanup interval on unmount or when polling stops.

---

## 8. Page-by-Page Implementation

### 8.1 Landing Page (`/`)

**Spec reference:** `FRONTEND_SPEC.md` §Page 1

**No API calls.** Pure static content with navigation.

**Layout strategy:**

A warm editorial splash. Full viewport height. Two content blocks stacked vertically over a warm gradient background with noise texture.

- Top: "Clara" wordmark in Instrument Serif (display size, `--text-4xl`), subtitle "Presentation Telemetry" in IBM Plex Sans small caps.
- Middle: Two side-by-side panels (on desktop, stacked on mobile):
  - "How It Works" — numbered steps, each with a short label. Use Instrument Serif italic for the step numbers. Steps are: (1) Upload your slides, (2) Set your presentation context, (3) Record your talk, (4) Get slide-by-slide telemetry.
  - "What You'll Get" — bullet list of capabilities: WPM per slide, filler word detection, pause analysis, repetition tracking, targeted speaking feedback.
- Bottom: Primary CTA "Get Started" — large, burgundy background (`--accent`), light text, subtle hover animation.

**Motion:** Staggered fade-in of elements on page load (200ms delay between groups). CTA button has a slight scale-up on hover.

**Design notes:**
- Background uses `bg-warm-gradient` with noise texture overlay.
- The two content panels sit on `--bg-elevated` with `--shadow-md` and `--radius-lg`.
- No images. Typography and color do the work.

### 8.2 Setup Page (`/setup`)

**Spec reference:** `FRONTEND_SPEC.md` §Page 2

**No API calls.** Collects PDF + expectations, stores in context.

**Layout strategy:**

Single-column form layout, centered (max-width ~640px), on the warm gradient background. Feels like filling out a research submission form.

**Sections:**

1. **Back link** — "← Back to Home" in `--text-secondary`, navigates to `/`.

2. **PDF Upload Zone:**
   - Large drop area with dashed border (`--border-subtle`).
   - Idle state: "Drop your slides here or click to browse" with a subtle PDF icon.
   - Drag-over state: border becomes solid `--accent`, background tints with `--accent-muted`.
   - Uploaded state: shows filename with checkmark, file size, and a "Remove" button to clear.
   - Validation: only `.pdf` files accepted (`accept=".pdf"`), max 50MB client-side check. Shows inline error if invalid.
   - Uses a hidden `<input type="file">` triggered by click on the drop zone.

3. **Expectations Form** (`ExpectationsForm` component):
   - **Tone** — custom-styled `<select>` dropdown. Options: Formal, Casual, Informative, Persuasive. Maps to API values `formal`, `casual`, `informative`, `persuasive`.
   - **Expected Duration** — number input with "minutes" label. Min 1, max 120. Step 1.
   - **Context** — textarea with character counter showing `{count}/500`. Placeholder: "Describe your presentation — audience, subject, purpose."
   - All fields required. Inline validation messages below each field.

4. **Submit button** — "Start Presenting →". Disabled (visually muted with `--text-tertiary` and `--bg-recessed`) until PDF is uploaded AND all form fields are valid. Enabled state uses `--accent` background.

**State management:**
- On PDF upload: call `setPdfFile(file)`. Also parse page count from the PDF using `pdfjs.getDocument()` to store `totalSlides`.
- On form complete + submit: call `setExpectations({...})`, then `navigate('/present')`.

**Motion:** Form fields fade in with stagger on mount. Upload zone has a gentle pulse animation when in drag-over state.

### 8.3 Recording Page (`/present`)

**Spec reference:** `FRONTEND_SPEC.md` §Page 3, `PIPELINE.md` §Step 1

**No API calls.** Records audio and tracks slide navigation.

**Layout strategy:**

Full-viewport immersive layout. The slide takes center stage — this is the "presenting" experience.

**Top bar:**
- Left: recording indicator — a red dot (`#D94040`) that **pulses** via CSS `animation: pulse 1.5s ease-in-out infinite` + elapsed time in `MM:SS` format using `--font-mono`.
- Right: slide counter "Slide {current} / {total}" in `--text-secondary`.

**Center: Slide Viewer** (`SlideViewer` component):
- Renders the current page of the uploaded PDF using `react-pdf`'s `<Document>` and `<Page>` components.
- The PDF `File` object comes from context. Convert to URL via `URL.createObjectURL()`.
- Sized to fill available space while maintaining aspect ratio (use `width` prop on `<Page>`, calculate to fit within viewport minus header/footer).
- Sits on a slightly elevated card (`--shadow-lg`, `--radius-lg`, `--bg-elevated`).

**Bottom controls:**
- "← Prev" and "Next →" buttons flanking the slide viewer.
  - **Next** appends `performance.now() / 1000` (relative to recording start) to `slideTimestamps` per `FRONTEND_SPEC.md` §Behavior.
  - **Prev** changes display slide only. Does NOT modify timestamps. Does NOT record a new timestamp.
  - "Next" is disabled on the last slide. "Prev" is disabled on slide 0.
- "End Presentation" button centered below — distinct styling (outlined in `--accent`, not filled) to differentiate from navigation. Clicking stops recording, collects blob, stores data in context, navigates to `/processing`.

**Hook usage:** `useAudioRecorder` for recording. Slide navigation is local `useState`.

**Critical implementation details from FRONTEND_SPEC.md:**
- `slideTimestamps` starts as `[0.0]` on page load.
- Only "Next" clicks append timestamps. Going back then forward again appends a new timestamp, so `slideTimestamps.length` may exceed `totalSlides`. This is expected per `FRONTEND_SPEC.md` §Edge case.
- Timer starts when recording starts (immediately on page load).
- The `totalSlides` sent to the API is always the PDF page count, not the timestamp array length.

**Guard:** If `pdfFile` is null in context, redirect to `/setup`.

**Motion:** Recording dot pulses. Slide transitions use a subtle crossfade via Motion `AnimatePresence` with `mode="wait"`.

### 8.4 Processing Page (`/processing`)

**Spec reference:** `FRONTEND_SPEC.md` §Page 4, `PIPELINE.md` §Step 2

**API calls:**
- `POST /api/presentations` — on mount (once)
- `GET /api/presentations/{id}/status` — poll every 2 seconds via `usePolling`

**Layout strategy:**

Centered single-column layout on a warm gradient. The processing steps are the visual focus — a vertical progress indicator that animates through stages.

**Content:**

1. **Title** — "Analyzing Your Presentation" in Instrument Serif (`--text-2xl`), centered.

2. **Processing Steps** (`ProcessingSteps` component):
   - 5-step vertical list, each with an icon, label, and state indicator.
   - States: completed (✓ checkmark in `--pace-normal`), active (● pulsing dot in `--accent`), pending (○ empty circle in `--text-tertiary`).
   - Labels from `FRONTEND_SPEC.md` §Step mapping (frontend-owned labels, NOT from `progress.step_name`):

   | Stage | Display Label |
   |-------|--------------|
   | `received` | Upload received |
   | `transcribing` | Transcribing audio |
   | `indexing` | Indexing transcript |
   | `analyzing` | Analyzing patterns & generating feedback |
   | `aggregating` | Combining results |

3. **Step counter** — "Step {current} of 5" in `--text-secondary` below the list.

**Behavior flow:**

1. On mount, check context for `audioBlob`, `slideTimestamps`, `expectations`, `totalSlides`. If any missing, redirect to `/setup`.
2. Construct `FormData`:
   - `audio`: the audio blob from context.
   - `metadata`: JSON string with `{ slide_timestamps, expectations, total_slides }`.
3. Call `submitPresentation()`. On success, store `presentationId` in context and begin polling.
4. On each poll: update the step indicators via `usePolling` state.
5. On `completed`: navigate to `/results/${presentationId}`.
6. On `failed`: show error message in a red-tinted banner (`--cat-timing` background at low opacity), display "Try Again" button that navigates to `/setup` and calls `resetAll()`.

**Error handling:**
- If `POST` fails with 400 or 413: show the error message inline, offer "Try Again".
- If polling returns 404: show "Presentation not found", offer "Start Over".

**Motion:**
- Each step transitions from pending → active → completed with a smooth icon swap animation.
- Active step has a subtle shimmer/pulse effect.
- On completion, all checkmarks do a staggered "pop" animation before navigating.

### 8.5 Results Page (`/results/:id`)

**Spec reference:** `FRONTEND_SPEC.md` §Page 5

**API calls:**
- `GET /api/presentations/{id}/results` — on mount

This is the most complex and information-dense page. It must feel like a professional analytical dashboard.

**Layout strategy:**

Three horizontal zones stacked vertically:

```
┌──────────────────────────────────────────────┐
│ OVERALL METRICS BAR (compact, single row)    │
├──────────────────────┬───────────────────────┤
│                      │                       │
│   SLIDE PREVIEW      │   DATA PANEL          │
│   (react-pdf)        │   ├─ Metrics          │
│   ~45% width         │   ├─ Feedback         │
│                      │   └─ Transcript       │
│                      │       ~55% width      │
├──────────────────────┴───────────────────────┤
│ SLIDE CAROUSEL (horizontal numbered buttons) │
└──────────────────────────────────────────────┘
```

**Zone 1: Overall Metrics Bar** (`OverallMetrics` component):

A compact horizontal strip at the top with a dark background (`--bg-deep` with gradient) and light text. Contains:
- Average WPM value (mono font, large)
- Actual vs expected duration — formatted as `"9:45 / 10:00"` with deviation shown as `"(-15s)"` or `"(+30s)"`
- Total filler count
- Total pause count
- "New Presentation" link/button in the far right — navigates to `/setup`, calls `resetAll()`

Each metric is a small labeled block: label in `--text-on-dark-muted` small caps, value in `--text-on-dark` mono font.

**Zone 2: Two-Column Split**

Built with CSS Grid: `grid-template-columns: 45% 55%` with a gap.

**Left column: Slide Preview** (`SlideViewer` component, reused):
- Renders the current slide from the PDF.
- Wait — the PDF is not stored server-side and won't survive a page refresh. Two approaches:
  - If context has `pdfFile`, render it. If not (direct URL access / refresh), show a placeholder: "Slide preview unavailable — upload not in memory." with a muted visual.
  - This is acceptable per the constraints (no persistence, in-memory only).
- The slide displayed corresponds to the currently selected slide in the carousel.

**Right column: Data Panel** — Three stacked sections:

**A) Metrics Panel** (`MetricsPanel` component):
- Grid of metric cells, compact.
- **WPM**: value + pace badge. Badge is color-coded: `--pace-normal` (green) for "normal", `--pace-slow` / `--pace-fast` (amber) for slow/fast. Badge text: "slow", "normal", "fast" in small caps.
- **Word count**: plain number.
- **Duration**: formatted as seconds (e.g., "45.2s").
- **Filler words**: count displayed. If count > 0, show comma-separated list of specific words in parentheses (e.g., "2 (um, like)"). Clickable — per `FRONTEND_SPEC.md` §Interaction Behavior, clicking scrolls transcript to first filler and highlights all.
- **Pauses**: count displayed. Clickable — expands to show a mini-list of pause instances with timestamps and durations.
- **Repeated phrases**: if any, show as small inline tags with count badges.

If a metric has zero instances, show descriptive text per `FRONTEND_SPEC.md` §Information Density Rules: "No filler words detected" not just "0".

**B) Feedback Panel** (`FeedbackPanel` component):
- Vertical list of feedback items for the selected slide.
- Each item:
  - **Category tag**: colored pill/badge using the category color map (`--cat-pacing`, `--cat-repetition`, etc.). Label in small caps.
  - **Comment text**: body font. `severity: "observation"` → normal weight. `severity: "suggestion"` → semibold with a subtle left border accent.
- If no feedback for this slide: "No feedback generated for this slide."

**C) Transcript Panel** (`TranscriptPanel` component):
- Collapsible. Default: collapsed, showing first ~2 lines with "Show more" toggle.
- Expanded: full transcript text for the slide.
- Filler words highlighted with a warm tint background (`--accent-muted`).
- Per `FRONTEND_SPEC.md` §Interaction Behavior: clicking filler word count in MetricsPanel should scroll here and highlight fillers.

**Zone 3: Slide Carousel** (`SlideCarousel` component):
- Horizontal row of numbered buttons: `[1] [2] [3] ... [N]`.
- Current slide button is highlighted (filled `--accent` background).
- Other buttons are outline style (`--border-subtle`).
- Clicking a button updates the right panel with that slide's data and updates the slide preview.
- If many slides, the carousel should be horizontally scrollable with subtle fade edges.

**Data loading:**
1. On mount: extract `id` from URL params. Call `getResults(id)`.
2. On success: store in context (or local state), render.
3. On 409 (not ready): redirect to `/processing`. If `presentationId` is in context, processing page can resume polling. Otherwise show a "still processing" message with a link back.
4. On 404: show "Presentation not found" error state with a link to home.

**State:** Local state tracks `selectedSlideIndex` (default 0). The slide data is derived: `results.slides[`slide_${selectedSlideIndex}`]`.

**Motion:**
- On initial load: stagger the overall metrics bar, then the two-column area, then the carousel (per `frontend.mdc` §High-impact moments #2).
- Slide carousel selection: smooth layout transition when switching slides (per `frontend.mdc` §High-impact moments #3).
- Metric badges appear with a subtle pop animation when switching slides (per `frontend.mdc` §High-impact moments #5).

---

## 9. Shared Components

### `SlideViewer`

Used on both RecordingPage and ResultsPage.

```typescript
interface SlideViewerProps {
  file: File | string | null;   // PDF source
  pageNumber: number;           // 1-indexed (react-pdf uses 1-indexed pages)
  width?: number;               // pixel width for rendering
}
```

- Wraps `<Document>` and `<Page>` from react-pdf.
- Handles loading state (subtle shimmer, not a skeleton loader — `frontend.mdc` bans skeleton loaders that never resolve).
- Handles error state (corrupted PDF).

### `ExpectationsForm`

Used on SetupPage. Self-contained form with local validation state.

```typescript
interface ExpectationsFormProps {
  onSubmit: (expectations: PresentationExpectations) => void;
  disabled?: boolean;
}
```

- Tone dropdown, duration input, context textarea with character counter.
- Inline validation on blur and on submit.
- All field constraints per `API_SPEC.md` validation rules.

### `ProcessingSteps`

Used on ProcessingPage. Renders the 5-step progress indicator.

```typescript
interface ProcessingStepsProps {
  currentStage: ProcessingStage | null;
}
```

- Maps `stage` value to which steps are completed/active/pending.
- Ordering: `received` < `transcribing` < `indexing` < `analyzing` < `aggregating`.

### `MetricsPanel`

Used on ResultsPage. Displays per-slide metrics.

```typescript
interface MetricsPanelProps {
  metrics: SlideMetrics;
  duration: number;           // slide-level duration_seconds
  onFillerClick: () => void;  // scroll to transcript + highlight
  onPauseClick: () => void;   // expand pause details
}
```

### `FeedbackPanel`

Used on ResultsPage. Displays per-slide feedback items.

```typescript
interface FeedbackPanelProps {
  feedback: FeedbackItem[];
}
```

### `TranscriptPanel`

Used on ResultsPage. Collapsible transcript with filler highlighting.

```typescript
interface TranscriptPanelProps {
  transcript: string;
  fillerWords: FillerInstance[];
  expanded?: boolean;
  onToggle: () => void;
}
```

- Uses the filler instances to find and highlight filler words in the transcript text.
- Collapsed: first ~100 characters with "…" and "Show more" link.
- Expanded: full text with highlighted fillers.

### `OverallMetrics`

Used on ResultsPage. Top bar with aggregate metrics.

```typescript
interface OverallMetricsProps {
  metrics: OverallMetrics;
  onNewPresentation: () => void;
}
```

### `SlideCarousel`

Used on ResultsPage. Horizontal slide selector.

```typescript
interface SlideCarouselProps {
  totalSlides: number;
  selectedIndex: number;
  onSelect: (index: number) => void;
}
```

---

## 10. Animation System

Per `frontend.mdc`, Motion (Framer Motion) is used for orchestrated animations, and CSS transitions handle simple state changes.

### Page Transitions

Wrap route content in `AnimatePresence` in `App.tsx`:

```tsx
<AnimatePresence mode="wait">
  <Routes location={location} key={location.pathname}>
    {/* routes */}
  </Routes>
</AnimatePresence>
```

Each page component wraps its content in:

```tsx
<motion.div
  initial={{ opacity: 0, y: 12 }}
  animate={{ opacity: 1, y: 0 }}
  exit={{ opacity: 0, y: -8 }}
  transition={{ duration: 0.3, ease: 'easeOut' }}
>
  {/* page content */}
</motion.div>
```

### Staggered Reveals (Results Page)

Use Motion's `staggerChildren` for the results page initial load:

```tsx
const container = {
  animate: { transition: { staggerChildren: 0.1 } }
};

const item = {
  initial: { opacity: 0, y: 16 },
  animate: { opacity: 1, y: 0 }
};
```

### Processing Step Animations

Each step uses `AnimatePresence` for icon transitions (pending circle → active pulse → completed check):

```tsx
<AnimatePresence mode="wait">
  {state === 'completed' && (
    <motion.span
      key="check"
      initial={{ scale: 0 }}
      animate={{ scale: 1 }}
      transition={{ type: 'spring', stiffness: 300, damping: 20 }}
    >✓</motion.span>
  )}
  {/* similar for active and pending */}
</AnimatePresence>
```

### CSS Animations

**Recording pulse:**
```css
@keyframes pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.4; }
}

.recording-dot {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  background: #D94040;
  animation: pulse 1.5s ease-in-out infinite;
}
```

**Hover / focus transitions** — all interactive elements get:
```css
transition: all 150ms ease;
```

---

## 11. Build Sequence

Ordered by dependency. Each phase produces a testable artifact.

### Phase 0: Scaffolding (~30 min)
1. `npm create vite@latest frontend -- --template react-ts`
2. Install all dependencies.
3. Configure Vite (proxy, plugins).
4. Set up Tailwind v4 with custom theme tokens.
5. Add font imports to `index.html`.
6. Create the CSS custom properties file (`styles/index.css`).
7. Create all empty files per the file structure.
8. Set up React Router in `router.tsx` and `App.tsx` with placeholder pages.
9. Set up `AppContext.tsx` with initial empty state.
10. **Test:** App boots, routes work, fonts load, colors render.

### Phase 1: Types + API Client (~30 min)
1. Define all TypeScript interfaces in `types/index.ts`.
2. Implement `api/client.ts` with all three functions.
3. **Test:** Types compile. API client can be tested against a mock server or with `curl` once the backend is running.

### Phase 2: Landing Page (~45 min)
1. Build `LandingPage.tsx` with full design — typography, gradients, content panels, CTA.
2. Add page transition animation wrapper.
3. **Test:** Visual inspection. Navigation to `/setup` works.

### Phase 3: Setup Page + ExpectationsForm (~1.5 hr)
1. Build `ExpectationsForm.tsx` component with validation.
2. Build PDF upload drop zone with drag-and-drop handling.
3. Build `SetupPage.tsx` composing both.
4. Wire up context: `setPdfFile`, `setExpectations`, `totalSlides` from PDF page count.
5. **Test:** Upload a PDF, fill form, verify state is stored, navigation to `/present` works.

### Phase 4: Recording Page + Audio (~2 hr)
1. Implement `useAudioRecorder.ts` hook.
2. Build `SlideViewer.tsx` component (react-pdf rendering).
3. Build `RecordingPage.tsx`:
   - Slide display from PDF via SlideViewer.
   - Top bar with recording indicator + timer + slide counter.
   - Bottom controls with Prev/Next/End.
   - Timestamp tracking logic.
4. Wire up context: `setRecordingData` on end.
5. **Test:** Record a short presentation, verify audio blob is captured, verify timestamps are correct, verify prev/next behavior.

### Phase 5: Processing Page + Polling (~1.5 hr)
1. Implement `usePolling.ts` hook.
2. Build `ProcessingSteps.tsx` component with step state animations.
3. Build `ProcessingPage.tsx`:
   - Upload submission on mount.
   - Polling visualization.
   - Completion → navigate to results.
   - Failure → error display + retry.
4. **Test:** Submit to backend (once running), verify polling works, verify navigation on completion.

### Phase 6: Results Page (~3 hr)
1. Build `OverallMetrics.tsx` — top bar with aggregate data.
2. Build `MetricsPanel.tsx` — per-slide metrics with pace badges, filler details, pause expansion.
3. Build `FeedbackPanel.tsx` — category-tagged feedback list.
4. Build `TranscriptPanel.tsx` — collapsible transcript with filler highlighting.
5. Build `SlideCarousel.tsx` — horizontal numbered slide selector.
6. Build `ResultsPage.tsx` composing all of the above:
   - Two-column CSS Grid layout.
   - Slide selection state driving all panels.
   - API fetch on mount with error handling (404, 409).
   - Staggered animation on load.
7. **Test:** Load results for a completed presentation, verify all panels update on slide selection, verify transcript expand/collapse, verify filler click interaction.

### Phase 7: Polish (~1 hr)
1. Add all Motion animations that weren't added inline (page transitions, stagger on results, processing step transitions).
2. Responsive tweaks — ensure the two-column results layout stacks on narrow viewports.
3. Error state coverage — every page handles the "went wrong" case with clear messaging.
4. Verify no banned fonts are used anywhere.
5. Verify no banned aesthetics are present.
6. Verify all API interactions match `API_SPEC.md` exactly.
7. Verify all TypeScript types match `DATA_SCHEMAS.md` exactly.

**Estimated total: ~10 hours of implementation.**

---

## Appendix A: Category Color Map Reference

From `FRONTEND_SPEC.md` §Feedback panel, with specific hex values from the design system:

| Category | CSS Variable | Hex | Visual |
|----------|-------------|-----|--------|
| pacing | `--cat-pacing` | `#2B5F8A` | Steel blue |
| repetition | `--cat-repetition` | `#B5652A` | Burnt sienna |
| clarity | `--cat-clarity` | `#3A7D5E` | Forest green |
| diction | `--cat-diction` | `#6B4C8A` | Muted plum |
| structure | `--cat-structure` | `#7A7067` | Warm gray |
| timing | `--cat-timing` | `#A13B3B` | Deep red |

## Appendix B: Pace Badge Rendering

From `FRONTEND_SPEC.md`: green for normal, yellow (amber) for slow/fast.

```tsx
function PaceBadge({ pace }: { pace: SpeakingPace }) {
  const colors = {
    slow:   { bg: 'var(--pace-slow)',   label: 'slow' },
    normal: { bg: 'var(--pace-normal)', label: 'normal' },
    fast:   { bg: 'var(--pace-fast)',   label: 'fast' },
  };
  // Render as small-caps pill with the background color
}
```

## Appendix C: Duration Formatting Utilities

```typescript
function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

function formatDeviation(deviation: number): string {
  const sign = deviation >= 0 ? '+' : '';
  return `(${sign}${Math.round(deviation)}s)`;
}
```
