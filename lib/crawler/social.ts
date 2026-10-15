import { apiSetting } from '../api-settings.ts';
import { classifyDomain, cleanText, fetchWithTimeout, keywordTags, stableId } from './core.ts';
import type { HarvestItem, LiveSource, SourceHealth } from './types.ts';

type SocialPlatform = 'tiktok' | 'instagram' | 'x';

type OEmbedPayload = {
  title?: string;
  author_name?: string;
  author_url?: string;
  html?: string;
  thumbnail_url?: string;
  url?: string;
};

export class SocialResolveError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(message: string, status: number, code: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

export function detectSocialPlatform(value: string): { platform: SocialPlatform; url: URL } {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new SocialResolveError('请输入完整的公开帖子链接。', 400, 'INVALID_URL');
  }
  if (url.protocol !== 'https:') {
    throw new SocialResolveError('只接受 HTTPS 公开链接。', 400, 'HTTPS_REQUIRED');
  }
  const host = url.hostname.toLowerCase();
  if (host === 'tiktok.com' || host.endsWith('.tiktok.com')) return { platform: 'tiktok', url };
  if (['x.com', 'www.x.com', 'twitter.com', 'www.twitter.com', 'mobile.twitter.com'].includes(host))
    return { platform: 'x', url };
  if (host === 'instagram.com' || host.endsWith('.instagram.com'))
    return { platform: 'instagram', url };
  throw new SocialResolveError(
    '目前只接受 TikTok、Instagram 或 X 的公开链接。',
    400,
    'HOST_NOT_ALLOWED',
  );
}

function socialItem(
  source: LiveSource,
  canonicalUrl: string,
  payload: OEmbedPayload,
  sourceUrl: string,
): HarvestItem {
  const title = cleanText(payload.title || payload.html).slice(0, 320) || `${source} public post`;
  const summary = cleanText(payload.html).slice(0, 620) || title;
  const [domain, domainKeywords] = classifyDomain(title, summary);
  return {
    id: `${source.toLowerCase().replace(/\s/g, '-')}-${stableId(canonicalUrl)}`,
    section: 'social',
    source,
    title,
    summary,
    author: cleanText(payload.author_name) || source,
    url: canonicalUrl,
    publishedAt: null,
    tags: [...new Set([source, ...keywordTags(`${title} ${summary}`)])].slice(0, 6),
    domain,
    domainKeywords,
    imageUrl: payload.thumbnail_url,
    provenance: {
      mode: 'public_oembed',
      sourceUrl,
      fetchedAt: new Date().toISOString(),
    },
  };
}

export async function resolveSocialUrl(value: string): Promise<HarvestItem> {
  const { platform, url } = detectSocialPlatform(value.trim());
  if (platform === 'tiktok') {
    const endpoint = new URL('https://www.tiktok.com/oembed');
    endpoint.searchParams.set('url', url.toString());
    const response = await fetchWithTimeout(endpoint.toString(), {}, 15_000);
    if (!response.ok)
      throw new SocialResolveError(`TikTok 返回 HTTP ${response.status}`, 502, 'UPSTREAM_ERROR');
    return socialItem(
      'TikTok',
      url.toString(),
      (await response.json()) as OEmbedPayload,
      endpoint.origin + endpoint.pathname,
    );
  }

  if (platform === 'x') {
    const endpoint = new URL('https://publish.twitter.com/oembed');
    endpoint.searchParams.set('url', url.toString());
    endpoint.searchParams.set('omit_script', 'true');
    endpoint.searchParams.set('dnt', 'true');
    const response = await fetchWithTimeout(endpoint.toString(), {}, 15_000);
    if (!response.ok)
      throw new SocialResolveError(`X 返回 HTTP ${response.status}`, 502, 'UPSTREAM_ERROR');
    const payload = (await response.json()) as OEmbedPayload;
    return socialItem(
      'X',
      cleanText(payload.url) || url.toString(),
      payload,
      endpoint.origin + endpoint.pathname,
    );
  }

  const endpointValue = apiSetting('instagram', 'baseUrl')?.trim();
  const token = apiSetting('instagram')?.trim();
  if (!endpointValue || !token) {
    throw new SocialResolveError(
      'Instagram 官方 oEmbed 服务端连接尚未配置；项目不会改用页面抓取或收集账号 Cookie。',
      503,
      'INSTAGRAM_CONFIGURATION_REQUIRED',
    );
  }
  const endpoint = new URL(endpointValue);
  endpoint.searchParams.set('url', url.toString());
  endpoint.searchParams.set('access_token', token);
  const response = await fetchWithTimeout(endpoint.toString(), {}, 15_000);
  if (!response.ok)
    throw new SocialResolveError(`Instagram 返回 HTTP ${response.status}`, 502, 'UPSTREAM_ERROR');
  return socialItem(
    'Instagram',
    url.toString(),
    (await response.json()) as OEmbedPayload,
    endpoint.origin + endpoint.pathname,
  );
}

export function socialHealth(): SourceHealth[] {
  const instagramReady = Boolean(
    apiSetting('instagram', 'baseUrl')?.trim() && apiSetting('instagram')?.trim(),
  );
  return [
    {
      source: 'TikTok',
      section: 'social',
      state: 'limited',
      label: '公开链接导入可用',
      labelEn: 'Public URL import available',
      detail: '通过 TikTok 官方 oEmbed 读取单条公开视频元数据；不是关键词搜索或账号主页爬取。',
      detailEn:
        'Uses TikTok oEmbed for one public URL; this is not search or account-feed crawling.',
      itemCount: 0,
    },
    {
      source: 'Instagram',
      section: 'social',
      state: instagramReady ? 'limited' : 'configuration_required',
      label: instagramReady ? '官方连接已配置' : '需要官方服务端连接',
      labelEn: instagramReady
        ? 'Official connection configured'
        : 'Official server connection required',
      detail: instagramReady
        ? '可通过已配置的 Meta oEmbed 服务端连接导入单条公开帖子。'
        : '未配置 Meta oEmbed endpoint/token；不会抓取登录页或读取 Cookie。',
      detailEn: instagramReady
        ? 'Can import a public post through the configured Meta oEmbed connection.'
        : 'Meta oEmbed endpoint/token is not configured; no login-page scraping or cookie access.',
      itemCount: 0,
    },
    {
      source: 'X',
      section: 'social',
      state: 'limited',
      label: '公开链接导入可用',
      labelEn: 'Public URL import available',
      detail:
        '通过 X Publish oEmbed 读取单条公开帖子；关键词/时间线采集仍需要单独的官方 API 授权。',
      detailEn:
        'Uses X Publish oEmbed for one public post; search and timeline collection still need API access.',
      itemCount: 0,
    },
  ];
}
