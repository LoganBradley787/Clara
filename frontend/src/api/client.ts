import type {
  PresentationMetadata,
  SubmitResponse,
  StatusResponse,
  PresentationResults,
  ChatResponse,
  ApiError,
} from '../types';

const BASE_URL = import.meta.env.VITE_API_URL || '/api';

class ApiClientError extends Error {
  readonly apiError: ApiError;
  constructor(apiError: ApiError) {
    super(apiError.message);
    this.name = 'ApiClientError';
    this.apiError = apiError;
  }
}

async function parseErrorResponse(res: Response): Promise<ApiError> {
  try {
    return await res.json();
  } catch {
    return { error: 'unknown_error', message: `Request failed with status ${res.status}` };
  }
}

export async function submitPresentation(
  audio: Blob,
  metadata: PresentationMetadata,
  slides?: File | null,
): Promise<SubmitResponse> {
  const formData = new FormData();
  formData.append('audio', audio, 'recording.webm');
  formData.append('metadata', JSON.stringify(metadata));
  if (slides) {
    formData.append('slides', slides, slides.name);
  }

  const res = await fetch(`${BASE_URL}/presentations`, {
    method: 'POST',
    body: formData,
  });

  if (res.status === 202) {
    return res.json();
  }

  throw new ApiClientError(await parseErrorResponse(res));
}

export async function getStatus(presentationId: string): Promise<StatusResponse> {
  const res = await fetch(`${BASE_URL}/presentations/${presentationId}/status`);

  if (res.ok) {
    return res.json();
  }

  throw new ApiClientError(await parseErrorResponse(res));
}

export async function getResults(presentationId: string): Promise<PresentationResults> {
  const res = await fetch(`${BASE_URL}/presentations/${presentationId}/results`);

  if (res.ok) {
    return res.json();
  }

  throw new ApiClientError(await parseErrorResponse(res));
}

export async function getAudioUrl(presentationId: string): Promise<string> {
  const res = await fetch(`${BASE_URL}/presentations/${presentationId}/audio`);
  if (!res.ok) throw new ApiClientError(await parseErrorResponse(res));
  const blob = await res.blob();
  return URL.createObjectURL(blob);
}

export async function sendChatMessage(presentationId: string, message: string): Promise<ChatResponse> {
  const res = await fetch(`${BASE_URL}/presentations/${presentationId}/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message }),
  });

  if (res.ok) {
    return res.json();
  }

  throw new ApiClientError(await parseErrorResponse(res));
}

export { ApiClientError };
