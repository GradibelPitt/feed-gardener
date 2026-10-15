import { withAccountContext } from '@/lib/account-context';
import { createHash } from 'node:crypto';
import { apiError, apiSuccess } from '@/lib/api-contract';
import {
  compileStrategyPlan,
  isStrategyInterface,
  isStrategyPlatform,
  type BehaviorWeights,
} from '@/lib/strategy';

export const runtime = 'nodejs';

async function handlePOST(request: Request) {
  let raw: Record<string, unknown>;
  try {
    raw = (await request.json()) as Record<string, unknown>;
  } catch {
    return apiError(400, 'INVALID_JSON', 'Expected JSON.');
  }
  if (!isStrategyPlatform(raw.platform) || !isStrategyInterface(raw.interface)) {
    return apiError(422, 'INVALID_PLAN_REQUEST', 'platform or interface is unsupported.');
  }

  const plan = compileStrategyPlan({
    platform: raw.platform,
    interface: raw.interface,
    strategyMode: raw.strategyMode === 'expert' ? 'expert' : 'simple',
    goalTags: Array.isArray(raw.goalTags) ? (raw.goalTags as string[]) : [],
    weights:
      raw.weights && typeof raw.weights === 'object'
        ? (raw.weights as Partial<BehaviorWeights>)
        : undefined,
    sessionMinutes: typeof raw.sessionMinutes === 'number' ? raw.sessionMinutes : undefined,
    maxVideos: typeof raw.maxVideos === 'number' ? raw.maxVideos : undefined,
  });
  if (!plan.goalTags.length) {
    return apiError(422, 'GOAL_TAGS_REQUIRED', 'At least one goal tag is required.');
  }
  const planHash = createHash('sha256').update(JSON.stringify(plan)).digest('hex');
  return apiSuccess(
    { plan: { ...plan, planHash } },
    { status: plan.executionStatus === 'policy_blocked' ? 409 : 201 },
  );
}

export async function POST(request: Request) { return withAccountContext(handlePOST, false)(request); }
