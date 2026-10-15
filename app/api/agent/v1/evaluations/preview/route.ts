import { withAccountContext } from '@/lib/account-context';
import {
  evaluateObservedRuns,
  FeedObservationError,
  parseObservedRuns,
} from '@/lib/feed-observation';
import { apiError, apiSuccess } from '@/lib/api-contract';

export const runtime = 'nodejs';

async function handlePOST(request: Request) {
  try {
    const body = (await request.json()) as { runs?: unknown };
    const runs = parseObservedRuns(body.runs);
    return apiSuccess(
      { report: evaluateObservedRuns(runs) },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  } catch (error) {
    if (error instanceof FeedObservationError || error instanceof SyntaxError) {
      return apiError(422, 'INVALID_FEED_OBSERVATION', error.message);
    }
    return apiError(500, 'FEED_EVALUATION_FAILED', 'Evaluation failed.');
  }
}

export async function POST(request: Request) { return withAccountContext(handlePOST, false)(request); }
