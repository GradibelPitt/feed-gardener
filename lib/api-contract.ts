export const API_CONTRACT_VERSION = 'feed-gardener-api/2' as const;
export const AGENT_CONTRACT_VERSION = 'feed-gardener-agent/1' as const;

export const API_INTERFACES = {
  account: { method: 'GET', path: '/api/account' },
  accountAction: { method: 'POST', path: '/api/account' },
  accountData: { method: 'GET', path: '/api/account/data' },
  saveAccountData: { method: 'PUT', path: '/api/account/data' },
  capabilities: { method: 'GET', path: '/api/agent/v1/capabilities' },
  createPlan: { method: 'POST', path: '/api/agent/v1/plans' },
  analyzeObservation: { method: 'POST', path: '/api/agent/v1/observations/analyze' },
  previewDecision: { method: 'POST', path: '/api/agent/v1/decisions/preview' },
  previewEvaluation: { method: 'POST', path: '/api/agent/v1/evaluations/preview' },
  harvestPublicSources: { method: 'GET', path: '/api/harvest' },
  configureYouTubeSearch: { method: 'PUT', path: '/api/harvest' },
  resolveSocialUrl: { method: 'POST', path: '/api/social/resolve' },
  suggestTags: { method: 'POST', path: '/api/tags/suggest' },
  youtubeConnection: { method: 'GET', path: '/api/connections/youtube' },
  connectYouTube: { method: 'POST', path: '/api/connections/youtube' },
  disconnectYouTube: { method: 'DELETE', path: '/api/connections/youtube' },
  youtubeCallback: { method: 'GET', path: '/api/connections/youtube/callback' },
  apiConfigurations: { method: 'GET', path: '/api/settings/providers' },
  saveApiConfiguration: { method: 'PUT', path: '/api/settings/providers' },
  clearApiConfiguration: { method: 'DELETE', path: '/api/settings/providers' },
} as const;

export type YouTubeConnection = {
  status: 'configuration_required' | 'disconnected' | 'connected' | 'expired';
  channel?: { id: string; title: string };
  expiresAt?: string;
  permission: 'youtube.readonly';
  missingConfiguration: string[];
  redirectUri: string;
};

export type ApiError = {
  code: string;
  message: string;
  retryable: boolean;
  details?: Record<string, unknown>;
};

export type ApiMeta = {
  contractVersion: typeof API_CONTRACT_VERSION;
};

export type ApiSuccess<T> = {
  data: T;
  meta: ApiMeta;
};

export type ApiFailure = {
  error: ApiError;
  meta: ApiMeta;
};

export type ApiEnvelope<T> = ApiSuccess<T> | ApiFailure;

function responseInit(init: ResponseInit = {}): ResponseInit {
  const headers = new Headers(init.headers);
  headers.set('X-Feed-Gardener-Contract', API_CONTRACT_VERSION);
  return { ...init, headers };
}

export function apiSuccess<T>(data: T, init: ResponseInit = {}): Response {
  return Response.json(
    { data, meta: { contractVersion: API_CONTRACT_VERSION } } satisfies ApiSuccess<T>,
    responseInit(init),
  );
}

export function apiError(
  status: number,
  code: string,
  message: string,
  retryable = false,
  details?: Record<string, unknown>,
): Response {
  const error: ApiError = { code, message, retryable };
  if (details) error.details = details;
  return Response.json(
    { error, meta: { contractVersion: API_CONTRACT_VERSION } } satisfies ApiFailure,
    responseInit({ status }),
  );
}

export class ApiResponseError extends Error {
  readonly code: string;
  readonly retryable: boolean;
  readonly status: number;

  constructor(error: ApiError, status: number) {
    super(error.message);
    this.name = 'ApiResponseError';
    this.code = error.code;
    this.retryable = error.retryable;
    this.status = status;
  }
}

export async function readApiData<T>(response: Response): Promise<T> {
  const envelope = (await response.json()) as Partial<ApiEnvelope<T>>;
  if (!response.ok || ('error' in envelope && envelope.error)) {
    const error =
      'error' in envelope && envelope.error
        ? envelope.error
        : { code: 'HTTP_ERROR', message: `HTTP ${response.status}`, retryable: false };
    throw new ApiResponseError(error, response.status);
  }
  if (!('data' in envelope)) {
    throw new ApiResponseError(
      { code: 'INVALID_API_ENVELOPE', message: 'Response data is missing.', retryable: false },
      response.status,
    );
  }
  return envelope.data as T;
}
