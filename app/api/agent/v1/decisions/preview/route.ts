import { withAccountContext } from '@/lib/account-context';
import {
  CandidateDecisionInputError,
  decideCandidate,
  validateCandidateDecisionInput,
} from '@/lib/candidate-decision';
import { apiError, apiSuccess } from '@/lib/api-contract';

export const runtime = 'nodejs';

async function handlePOST(request: Request) {
  try {
    const input = validateCandidateDecisionInput(await request.json());
    const decision = await decideCandidate(input);
    return apiSuccess(
      {
        decision,
        boundary:
          input.platform === 'feeder'
            ? 'Title relevance is for Feeder simulation only; it does not verify content or authorize a source-platform action.'
            : 'This endpoint recommends only. A separately verified Runner, current consent, identity checks, and action-specific policy gates are still required.',
      },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  } catch (error) {
    if (error instanceof CandidateDecisionInputError || error instanceof SyntaxError) {
      return apiError(422, 'INVALID_DECISION_INPUT', error.message);
    }
    const message = error instanceof Error ? error.message : String(error);
    if (message === 'JEV_MODEL_NOT_CONFIGURED') {
      return apiError(
        503,
        message,
        'Configure the server-side TypeSafe API key before requiring Jev.',
      );
    }
    if (message === 'JEV_INVALID_RESPONSE') {
      return apiError(502, message, 'Scoring provider returned an invalid score or confidence.');
    }
    return apiError(502, 'DECISION_PROVIDER_FAILED', 'Decision provider failed.', true);
  }
}

export async function POST(request: Request) { return withAccountContext(handlePOST, false)(request); }
