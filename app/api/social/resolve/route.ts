import { withAccountContext } from '@/lib/account-context';
import { apiError, apiSuccess } from '@/lib/api-contract';
import { resolveSocialUrl, SocialResolveError } from '@/lib/crawler/social';

export const runtime = 'nodejs';

async function handlePOST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return apiError(400, 'INVALID_JSON', '请求体必须是 JSON。');
  }
  const url =
    body && typeof body === 'object' && typeof (body as { url?: unknown }).url === 'string'
      ? (body as { url: string }).url.trim()
      : '';
  if (!url || url.length > 2_048) {
    return apiError(400, 'INVALID_URL', '请提供长度合理的公开帖子链接。');
  }

  try {
    return apiSuccess(
      { item: await resolveSocialUrl(url) },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  } catch (error) {
    if (error instanceof SocialResolveError) {
      return apiError(error.status, error.code, error.message, error.status >= 500);
    }
    return apiError(
      502,
      'UPSTREAM_ERROR',
      error instanceof Error ? error.message : '上游服务暂时不可用。',
      true,
    );
  }
}

export async function POST(request: Request) { return withAccountContext(handlePOST, false)(request); }
