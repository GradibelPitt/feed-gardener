export type ApiProvider = {
  id: string;
  name: string;
  description: string;
  fields: {
    id: string;
    label: string;
    secret?: boolean;
    required?: boolean;
    placeholder?: string;
  }[];
};

export const API_PROVIDERS: ApiProvider[] = [
  {
    id: 'youtube',
    name: 'YouTube',
    description: 'Official video search with YouTube Data API.',
    fields: [{ id: 'apiKey', label: 'API key', secret: true, required: true }],
  },
  {
    id: 'github',
    name: 'GitHub',
    description: 'Repository discovery and live topic suggestions.',
    fields: [{ id: 'apiKey', label: 'Personal access token', secret: true, required: true }],
  },
  {
    id: 'scholar',
    name: 'Google Scholar',
    description: 'Academic search powered by SerpApi.',
    fields: [{ id: 'apiKey', label: 'SerpApi key', secret: true, required: true }],
  },
  {
    id: 'typesafe',
    name: 'TypeSafe',
    description: 'Jev relevance scoring for your interests.',
    fields: [
      { id: 'apiKey', label: 'API key', secret: true, required: true },
      { id: 'baseUrl', label: 'API endpoint', placeholder: 'https://api.typesafe.ai/v1/systemone' },
      { id: 'model', label: 'Model', placeholder: 'jev-latest' },
    ],
  },
  {
    id: 'multimodal',
    name: 'AI / Multimodal',
    description: 'Content analysis through an OpenAI-compatible API.',
    fields: [
      { id: 'apiKey', label: 'API key', secret: true, required: true },
      {
        id: 'baseUrl',
        label: 'Base URL',
        required: true,
        placeholder: 'https://api.openai.com/v1',
      },
      { id: 'model', label: 'Model', required: true, placeholder: 'Enter a model ID' },
    ],
  },
  {
    id: 'instagram',
    name: 'Instagram',
    description: 'Import public posts through your oEmbed connection.',
    fields: [
      { id: 'apiKey', label: 'Access token', secret: true, required: true },
      {
        id: 'baseUrl',
        label: 'oEmbed endpoint',
        required: true,
        placeholder: 'https://graph.facebook.com/…/instagram_oembed',
      },
    ],
  },
];

export const CUSTOM_API_FIELDS: ApiProvider['fields'] = [
  { id: 'apiKey', label: 'API key / token', secret: true, required: true },
  { id: 'baseUrl', label: 'Base URL', placeholder: 'https://api.example.com/v1' },
  { id: 'model', label: 'Model (optional)' },
];

export type ApiConfigurationSummary = {
  id: string;
  name: string;
  configured: boolean;
  source: 'saved' | 'environment' | 'none';
  values: Record<string, string>;
  secrets: string[];
  custom: boolean;
};
