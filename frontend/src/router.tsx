import { createBrowserRouter } from 'react-router-dom';
import LandingPage from './pages/LandingPage';
import SetupPage from './pages/SetupPage';
import RecordingPage from './pages/RecordingPage';
import ProcessingPage from './pages/ProcessingPage';
import ResultsPage from './pages/ResultsPage';
import ComparisonPage from './pages/ComparisonPage';

export const router = createBrowserRouter([
  { path: '/', element: <LandingPage /> },
  { path: '/setup', element: <SetupPage /> },
  { path: '/present', element: <RecordingPage /> },
  { path: '/processing', element: <ProcessingPage /> },
  { path: '/results/:id', element: <ResultsPage /> },
  { path: '/compare/:id1/:id2', element: <ComparisonPage /> },
]);
