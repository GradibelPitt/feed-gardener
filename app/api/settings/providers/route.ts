import { withAccountContext } from '@/lib/account-context';
import { apiError, apiSuccess } from '@/lib/api-contract';
import {
  clearApiConfiguration,
  listApiConfigurations,
  saveApiConfiguration,
} from '@/lib/api-settings';

export const runtime = 'nodejs';

async function handleGET(request: Request) {
  try {
    return apiSuccess(listApiConfigurations(), { headers: { 'Cache-Control': 'no-store' } });
  } catch {
    return apiError(500, 'SETTINGS_UNAVAILABLE', 'Could not read API settings.');
  }
}

async function mutate(request: Request, remove: boolean) {
  if (!request.headers.get('content-type')?.startsWith('application/json'))
    return apiError(415, 'INVALID_CONTENT_TYPE', 'Expected JSON.');
  const raw = await request.text();
  if (raw.length > 20000) return apiError(413, 'TOO_LARGE', 'Configuration is too large.');
  let body;
  try {
    body = JSON.parse(raw);
  } catch {
    return apiError(400, 'INVALID_JSON', 'Expected JSON.');
  }
  try {
    if (remove) clearApiConfiguration(typeof body?.id === 'string' ? body.id : '');
    else saveApiConfiguration(body);
    return apiSuccess(listApiConfigurations(), { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    // Filesystem and crypto failures must not expose paths or stored values.
    const message =
      error instanceof Error && /^(Invalid |Choose |Enter |Use |The platform)/.test(error.message)
        ? error.message
        : 'Could not save API settings. Please try again.';
    return apiError(422, 'SETTINGS_SAVE_FAILED', message);
  }
}

async function handlePUT(request: Request) {
  return mutate(request, false);
}
async function handleDELETE(request: Request) {
  return mutate(request, true);
}

export async function GET(request: Request) { return withAccountContext(handleGET, true)(request); }

export async function PUT(request: Request) { return withAccountContext(handlePUT, true)(request); }

export async function DELETE(request: Request) { return withAccountContext(handleDELETE, true)(request); }
