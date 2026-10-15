import { withAccountContext } from '@/lib/account-context';
import {
  analyzeObservation,
  ObservationInputError,
  validateObservationInput,
} from '@/lib/agent-observation';
import { apiError, apiSuccess } from '@/lib/api-contract';

export const runtime = 'nodejs';

async function handlePOST(request: Request) {
  try {
    const input = validateObservationInput(await request.json());
    const analysis = await analyzeObservation(input);
    return apiSuccess({ analysis }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    if (error instanceof ObservationInputError || error instanceof SyntaxError) {
      return apiError(422, 'INVALID_OBSERVATION', error.message);
    }
    const message = error instanceof Error ? error.message : String(error);
    if (message === 'MULTIMODAL_MODEL_NOT_CONFIGURED') {
      return apiError(
        503,
        message,
        'Configure the server-side multimodal provider before using this endpoint.',
      );
    }
    return apiError(502, 'OBSERVATION_ANALYSIS_FAILED', 'Observation analysis failed.', true);
  }
}

export async function POST(request: Request) { return withAccountContext(handlePOST, false)(request); }
