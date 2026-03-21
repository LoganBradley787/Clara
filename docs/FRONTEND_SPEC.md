# Clara — Frontend Specification

React + Vite + TypeScript frontend. This document is the complete reference for Cursor to implement without guessing.

---

## Tech Stack

- React 18+ with TypeScript
- Vite build tool
- react-pdf (for slide rendering)
- CSS Modules or Tailwind CSS (developer choice)
- Fetch API for HTTP requests
- MediaRecorder API for audio capture

---

## Page Structure

```
/                → Landing Page
/setup           → Setup Page (PDF upload + expectations)
/present         → Recording Page (slide display + audio recording)
/processing      → Processing Page (upload + polling state)
/results/:id     → Results Page (slide carousel + side panel)
```

Use React Router for navigation. No nested layouts required.

---

## Page 1: Landing Page (`/`)

**Purpose:** Explain what Clara does and how to use it.

**Layout:**
```
┌─────────────────────────────────────────┐
│              Clara                      │
│     Presentation Telemetry Platform     │
│                                         │
│  ┌───────────────────────────────────┐  │
│  │  How It Works                     │  │
│  │  1. Upload your slides (PDF)      │  │
│  │  2. Set your presentation context │  │
│  │  3. Record your talk              │  │
│  │  4. Get slide-by-slide telemetry  │  │
│  └───────────────────────────────────┘  │
│                                         │
│  ┌───────────────────────────────────┐  │
│  │  What You'll Get                  │  │
│  │  • Words per minute per slide     │  │
│  │  • Filler word detection          │  │
│  │  • Pause analysis                 │  │
│  │  • Repetition tracking            │  │
│  │  • Targeted speaking feedback     │  │
│  └───────────────────────────────────┘  │
│                                         │
│         [ Get Started → ]               │
│                                         │
└─────────────────────────────────────────┘
```

**Behavior:**
- "Get Started" navigates to `/setup`
- No API calls on this page
- Clean, minimal design — no animations or heavy graphics

---

## Page 2: Setup Page (`/setup`)

**Purpose:** Upload PDF and set presentation expectations.

**Layout:**
```
┌─────────────────────────────────────────┐
│  ← Back to Home                         │
│                                         │
│  Upload Your Slides                     │
│  ┌───────────────────────────────────┐  │
│  │                                   │  │
│  │    Drop PDF here or click to      │  │
│  │    browse                         │  │
│  │                                   │  │
│  │    [ uploaded_file.pdf ✓ ]        │  │
│  └───────────────────────────────────┘  │
│                                         │
│  Presentation Context                   │
│                                         │
│  Tone:  [ Formal ▼ ]                   │
│                                         │
│  Expected Duration: [ 10 ] minutes     │
│                                         │
│  Context:                               │
│  ┌───────────────────────────────────┐  │
│  │ Brief description of your         │  │
│  │ presentation and audience...      │  │
│  └───────────────────────────────────┘  │
│                                         │
│         [ Start Presenting → ]          │
│                                         │
└─────────────────────────────────────────┘
```

**Components:**
- PDF drop zone: accepts `.pdf` files only, max 50MB
- Tone selector: dropdown with options `Formal`, `Casual`, `Informative`, `Persuasive`
- Duration input: number input, min 1, max 120
- Context textarea: max 500 characters, with character counter
- Submit button: disabled until PDF uploaded and all fields filled

**State to carry forward:**
- PDF file object (store in React state or context)
- Expectations object: `{tone, expected_duration_minutes, context}`

**Validation:**
- PDF must be a valid PDF (check MIME type)
- All fields required
- Show inline validation errors

**Navigation:** "Start Presenting" → `/present` (carry state via React context or prop drilling)

---

## Page 3: Recording Page (`/present`)

**Purpose:** Display slides and record the presentation.

**Layout:**
```
┌─────────────────────────────────────────┐
│  Recording ● 02:34        Slide 3/10   │
│                                         │
│  ┌───────────────────────────────────┐  │
│  │                                   │  │
│  │                                   │  │
│  │         SLIDE CONTENT             │  │
│  │         (react-pdf)               │  │
│  │                                   │  │
│  │                                   │  │
│  └───────────────────────────────────┘  │
│                                         │
│  [ ← Prev ]              [ Next → ]    │
│                                         │
│         [ End Presentation ]            │
│                                         │
└─────────────────────────────────────────┘
```

**Behavior:**

1. **On page load:**
   - Start `MediaRecorder` with `{ mimeType: 'audio/webm' }`
   - Initialize `slideTimestamps = [0.0]`
   - Start elapsed time counter
   - Display slide 0

2. **On "Next" click:**
   - Calculate elapsed seconds since recording start
   - Append to `slideTimestamps`
   - Advance to next slide in react-pdf
   - If on last slide, disable "Next"

3. **On "Prev" click:**
   - Go back one slide in display only
   - Do NOT modify `slideTimestamps` — previous timestamps are immutable
   - Do NOT record a new timestamp for going back

4. **On "End Presentation" click:**
   - Stop `MediaRecorder`
   - Collect audio blob
   - Navigate to upload/processing flow

**Important implementation notes:**
- `slideTimestamps` only grows on "Next" clicks. Going back and forward again adds a new timestamp.
- The timer shows elapsed time in `MM:SS` format
- The recording indicator (●) should pulse/blink to indicate active recording
- Slide counter shows current display position / total slides
- react-pdf renders one page at a time from the uploaded PDF

**State captured:**
- `audioBlob: Blob`
- `slideTimestamps: number[]`
- `totalSlides: number` (from PDF page count, not timestamp count)

**Edge case:** If the user navigates back and forward, `slideTimestamps` will have more entries than `totalSlides`. This is expected. The frontend sends all recorded timestamps, and `total_slides` is always set to the PDF page count. The backend truncates `slide_timestamps` to the first `total_slides` entries before indexing.

---

## Page 4: Processing Page (`/processing`)

**Purpose:** Show processing progress while backend works.

**Layout:**
```
┌─────────────────────────────────────────┐
│                                         │
│           Analyzing Your                │
│           Presentation                  │
│                                         │
│  ┌───────────────────────────────────┐  │
│  │  ✓ Upload received                │  │
│  │  ● Transcribing audio...          │  │
│  │  ○ Indexing transcript            │  │
│  │  ○ Analyzing & generating feedback │  │
│  │  ○ Combining results              │  │
│  └───────────────────────────────────┘  │
│                                         │
│           Step 2 of 5                   │
│                                         │
└─────────────────────────────────────────┘
```

**Behavior:**

1. **On page load:**
   - If coming from recording page: construct `FormData` and `POST /api/presentations`
   - Store returned `presentation_id`
   - Begin polling `GET /api/presentations/{id}/status` every 2 seconds

2. **On each poll response:**
   - Update step indicators (✓ completed, ● current, ○ pending)
   - Update step counter text

3. **On `status: "completed"`:**
   - Stop polling
   - Navigate to `/results/{id}`

4. **On `status: "failed"`:**
   - Stop polling
   - Show error message from response
   - Show "Try Again" button → navigate back to `/setup`

**Step mapping:**

Use the `stage` field from the status response to drive the UI. Map stages to display text using the frontend's own labels (do **not** rely on `progress.step_name` from the API — it exists for debugging, not display):

| Stage | Display Text |
|-------|-------------|
| `received` | Upload received |
| `transcribing` | Transcribing audio |
| `indexing` | Indexing transcript |
| `analyzing` | Analyzing patterns & generating feedback |
| `aggregating` | Combining results |

---

## Page 5: Results Page (`/results/:id`)

**Purpose:** Display slide-by-slide telemetry and feedback.

**Layout:**
```
┌──────────────────────────────────────────────────────┐
│  Clara Results                    Overall: 150 WPM   │
│                                   Duration: 9:45/10  │
│                                   Fillers: 12        │
│                                                      │
│  ┌─────────────────────┬────────────────────────────┐│
│  │                     │                            ││
│  │                     │  Slide 3 of 10             ││
│  │                     │                            ││
│  │    SLIDE PREVIEW    │  Metrics                   ││
│  │    (react-pdf)      │  ┌──────────────────────┐  ││
│  │                     │  │ WPM: 142 (normal)    │  ││
│  │                     │  │ Words: 98            │  ││
│  │                     │  │ Duration: 41s        │  ││
│  │                     │  │ Fillers: 1 (um)      │  ││
│  │                     │  │ Pauses: 0            │  ││
│  │                     │  └──────────────────────┘  ││
│  │                     │                            ││
│  │                     │  Feedback                  ││
│  │                     │  ┌──────────────────────┐  ││
│  │                     │  │ [pacing] Normal pace  │  ││
│  │                     │  │ well-suited to this   │  ││
│  │                     │  │ informational slide.  │  ││
│  │                     │  │                      │  ││
│  │                     │  │ [repetition] "data   │  ││
│  │                     │  │ shows" used here and │  ││
│  │                     │  │ on slides 1, 5.      │  ││
│  │                     │  └──────────────────────┘  ││
│  │                     │                            ││
│  │                     │  Transcript                ││
│  │                     │  ┌──────────────────────┐  ││
│  │                     │  │ "Today I want to     │  ││
│  │                     │  │ show you the data..." │  ││
│  │                     │  └──────────────────────┘  ││
│  │                     │                            ││
│  └─────────────────────┴────────────────────────────┘│
│                                                      │
│  ┌──────────────────────────────────────────────────┐│
│  │ [1] [2] [■3] [4] [5] [6] [7] [8] [9] [10]      ││
│  └──────────────────────────────────────────────────┘│
│                                                      │
└──────────────────────────────────────────────────────┘
```

**Two-column layout:**
- **Left (40-50%):** Slide preview rendered via react-pdf
- **Right (50-60%):** Metrics panel, feedback list, transcript excerpt

**Slide navigation bar:**
- Horizontal row of numbered buttons at the bottom
- Current slide highlighted
- Click to jump to any slide

**Metrics panel:**
- Compact display of key numbers
- `speaking_pace` shown as colored badge: green (normal), yellow (slow/fast)
- Filler words: show count and list the specific words
- Pauses: show count, click to expand durations

**Feedback panel:**
- Each feedback item shows `[category]` tag + comment text
- Category tags are color-coded:
  - `pacing` → blue
  - `repetition` → orange
  - `clarity` → green
  - `diction` → purple
  - `structure` → gray
  - `timing` → red
- Severity `observation` → normal weight; `suggestion` → bold or highlighted

**Transcript panel:**
- Collapsible section showing the full slide transcript
- Filler words highlighted in the transcript text (e.g., yellow background)
- Default: collapsed, showing first 2 lines with "Show more"

**Overall metrics bar (top):**
- Average WPM across all slides
- Actual vs expected duration
- Total filler count
- Compact, single-line display

**API usage:**
- On page load: `GET /api/presentations/{id}/results`
- If returns 409 (not ready): redirect to `/processing` (which will resume polling if it still has the presentation ID in state)
- If returns 404: show error, link to home

---

## Aesthetic Goals

- **Clean, professional** — think developer tools (Linear, Vercel dashboard), not consumer apps
- **Information-dense but not cluttered** — every pixel earns its place
- **Monochromatic base** with accent colors only for semantic meaning (pace badges, category tags)
- **Typography-driven** — clear hierarchy via font size and weight, minimal borders
- **Dark mode optional** — light mode primary

---

## Information Density Rules

1. **Metrics first, feedback second** — numbers are scannable, text requires reading
2. **No empty states without guidance** — if a slide has no fillers, show "No filler words detected" not just 0
3. **Progressive disclosure** — transcript collapsed by default, expandable
4. **No charts for single values** — a bar chart for one WPM number adds nothing. Use charts only for comparative data (e.g., WPM across all slides in overall view)
5. **Category tags are scan anchors** — colored tags let the eye skip to relevant feedback

---

## Interaction Behavior

| Action | Result |
|--------|--------|
| Click slide in carousel | Update right panel with that slide's data |
| Click filler word count | Scroll transcript to first filler, highlight all |
| Click pause count | Expand pause details (timestamps, durations) |
| Click "Show more" on transcript | Expand full transcript for this slide |
| Hover on feedback category tag | No tooltip needed — the comment is right there |
| Click "New Presentation" | Navigate to `/setup`, clear all state |

---

## State Management

Use React Context or a lightweight state manager. Key state:

```typescript
interface AppState {
  // Setup
  pdfFile: File | null;
  expectations: {
    tone: "formal" | "casual" | "informative" | "persuasive";
    expected_duration_minutes: number;
    context: string;
  } | null;

  // Recording
  audioBlob: Blob | null;
  slideTimestamps: number[];
  totalSlides: number;

  // Results
  presentationId: string | null;
  results: PresentationResults | null;
}
```

State resets when user starts a new presentation.

---

## API Integration Summary

| Page | Endpoint | Method | When |
|------|----------|--------|------|
| Processing | `/api/presentations` | POST | On entering processing page |
| Processing | `/api/presentations/{id}/status` | GET | Poll every 2 seconds |
| Results | `/api/presentations/{id}/results` | GET | On page load |
