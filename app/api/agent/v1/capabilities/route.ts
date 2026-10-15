import { withAccountContext } from '@/lib/account-context';
import { apiSetting } from '@/lib/api-settings';
import { AGENT_CONTRACT_VERSION, API_INTERFACES, apiSuccess } from '@/lib/api-contract';
import { behaviorSignalKeys, defaultBehaviorWeights } from '@/lib/strategy';
import { CANDIDATE_SCORE_POLICY, isJevConfigured } from '@/lib/candidate-decision';

export const runtime = 'nodejs';

async function handleGET() {
  const multimodalConfigured = Boolean(
    apiSetting('multimodal', 'baseUrl') &&
    apiSetting('multimodal') &&
    apiSetting('multimodal', 'model'),
  );
  return apiSuccess(
    {
      contractVersion: AGENT_CONTRACT_VERSION,
      interfaces: {
        multimodal_api: {
          status: multimodalConfigured ? 'configured_unverified' : 'not_configured',
          endpoint: API_INTERFACES.analyzeObservation.path,
          role: 'content observation only; never executes account actions',
        },
        local_agent: {
          status: 'contract_ready',
          endpoint: API_INTERFACES.createPlan.path,
          skillPath: 'agents/feed-gardener/SKILL.md',
          role: 'creates bounded plans; a separately verified local runner must execute them',
        },
        decision_api: {
          status: isJevConfigured() ? 'jev_configured_unverified' : 'deterministic_fallback',
          endpoint: API_INTERFACES.previewDecision.path,
          provider: isJevConfigured() ? 'jev' : 'deterministic',
          role: 'Jev scores title relevance; application code maps scores to candidate actions; never authorizes execution',
          scorePolicy: CANDIDATE_SCORE_POLICY,
          relevanceScale: { min: 1, max: 10, evidenceBasis: 'title_only' },
        },
      },
      modes: {
        simple: {
          behaviorWeights: 'default_only',
          runObservations: 'summary_only',
        },
        expert: {
          behaviorWeights: 'user_configurable',
          runObservations: 'per_run_and_aggregate',
        },
      },
      evaluationEndpoint: API_INTERFACES.previewEvaluation.path,
      platforms: {
        simulator: { execution: 'tested_simulator', recommendationEffect: 'simulator_only' },
        youtube: {
          connection: {
            endpoint: API_INTERFACES.youtubeConnection.path,
            permission: 'youtube.readonly',
          },
          execution: 'blocked_external',
          recommendationEffect: 'not_evaluated',
        },
        bilibili: { execution: 'blocked_external', recommendationEffect: 'not_evaluated' },
      },
      behaviorSignals: behaviorSignalKeys,
      defaultBehaviorWeights,
      invariants: [
        'agent events never update explicit user preferences',
        'model output never carries executable code or selectors',
        'execution, account-state verification, and recommendation effect are separate results',
        'platform cookies and passwords are never accepted by this API',
        'Jev only scores title relevance; application policy and a separate Runner control actions',
      ],
    },
    { headers: { 'Cache-Control': 'no-store' } },
  );
}

export async function GET(request: Request) { return withAccountContext(handleGET, false)(request); }
