import { createContext, useContext, useReducer, type ReactNode } from 'react';
import type { PresentationExpectations, PresentationResults } from '../types';

interface AppState {
  pdfFile: File | null;
  expectations: PresentationExpectations | null;
  audioBlob: Blob | null;
  slideTimestamps: number[];
  totalSlides: number;
  presentationId: string | null;
  results: PresentationResults | null;
  previousAttemptId: string | null;
}

type AppAction =
  | { type: 'SET_PDF_FILE'; payload: File }
  | { type: 'SET_TOTAL_SLIDES'; payload: number }
  | { type: 'SET_EXPECTATIONS'; payload: PresentationExpectations }
  | { type: 'SET_RECORDING_DATA'; payload: { audio: Blob; timestamps: number[]; totalSlides: number } }
  | { type: 'SET_PRESENTATION_ID'; payload: string }
  | { type: 'SET_RESULTS'; payload: PresentationResults }
  | { type: 'START_PRACTICE_AGAIN'; payload: string }
  | { type: 'RESET_ALL' };

interface AppActions {
  setPdfFile: (file: File) => void;
  setTotalSlides: (count: number) => void;
  setExpectations: (exp: PresentationExpectations) => void;
  setRecordingData: (audio: Blob, timestamps: number[], totalSlides: number) => void;
  setPresentationId: (id: string) => void;
  setResults: (results: PresentationResults) => void;
  startPracticeAgain: (previousId: string) => void;
  resetAll: () => void;
}

const initialState: AppState = {
  pdfFile: null,
  expectations: null,
  audioBlob: null,
  slideTimestamps: [],
  totalSlides: 0,
  presentationId: null,
  results: null,
  previousAttemptId: null,
};

function reducer(state: AppState, action: AppAction): AppState {
  switch (action.type) {
    case 'SET_PDF_FILE':
      return { ...state, pdfFile: action.payload };
    case 'SET_TOTAL_SLIDES':
      return { ...state, totalSlides: action.payload };
    case 'SET_EXPECTATIONS':
      return { ...state, expectations: action.payload };
    case 'SET_RECORDING_DATA':
      return {
        ...state,
        audioBlob: action.payload.audio,
        slideTimestamps: action.payload.timestamps,
        totalSlides: action.payload.totalSlides,
      };
    case 'SET_PRESENTATION_ID':
      return { ...state, presentationId: action.payload };
    case 'SET_RESULTS':
      return { ...state, results: action.payload };
    case 'START_PRACTICE_AGAIN':
      return {
        ...initialState,
        pdfFile: state.pdfFile,
        expectations: state.expectations,
        totalSlides: state.totalSlides,
        previousAttemptId: action.payload,
      };
    case 'RESET_ALL':
      return { ...initialState };
    default:
      return state;
  }
}

const StateContext = createContext<AppState>(initialState);
const ActionsContext = createContext<AppActions | null>(null);

export function AppProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(reducer, initialState);

  const actions: AppActions = {
    setPdfFile: (file) => dispatch({ type: 'SET_PDF_FILE', payload: file }),
    setTotalSlides: (count) => dispatch({ type: 'SET_TOTAL_SLIDES', payload: count }),
    setExpectations: (exp) => dispatch({ type: 'SET_EXPECTATIONS', payload: exp }),
    setRecordingData: (audio, timestamps, totalSlides) =>
      dispatch({ type: 'SET_RECORDING_DATA', payload: { audio, timestamps, totalSlides } }),
    setPresentationId: (id) => dispatch({ type: 'SET_PRESENTATION_ID', payload: id }),
    setResults: (results) => dispatch({ type: 'SET_RESULTS', payload: results }),
    startPracticeAgain: (previousId) => dispatch({ type: 'START_PRACTICE_AGAIN', payload: previousId }),
    resetAll: () => dispatch({ type: 'RESET_ALL' }),
  };

  return (
    <StateContext.Provider value={state}>
      <ActionsContext.Provider value={actions}>
        {children}
      </ActionsContext.Provider>
    </StateContext.Provider>
  );
}

export function useAppState() {
  return useContext(StateContext);
}

export function useAppActions() {
  const ctx = useContext(ActionsContext);
  if (!ctx) throw new Error('useAppActions must be used within AppProvider');
  return ctx;
}
