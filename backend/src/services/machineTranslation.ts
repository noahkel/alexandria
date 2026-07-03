import env from '../lib/env';

// DeepL free-plan keys end with ':fx' and use a different API host
const apiHost = function (apiKey: string): string {
  return apiKey.endsWith(':fx')
    ? 'https://api-free.deepl.com'
    : 'https://api.deepl.com';
};

interface DeepLResponse {
  translations?: Array<{
    detected_source_language?: string;
    text?: string;
  }>;
}

// translations of single words rarely change, so cache them for the
// lifetime of the process to conserve the DeepL quota
const cache = new Map<string, string | null>();
const MAX_CACHE_ENTRIES = 10000;

const isConfigured = function (): boolean {
  return Boolean(env.DEEPL_API_KEY);
};

const translateWord = async function (
  word: string,
  sourceLanguageId: string,
  targetLanguageId: string
): Promise<string | null> {
  const apiKey = env.DEEPL_API_KEY;
  if (!apiKey) return null;

  const cacheKey = `${sourceLanguageId}|${targetLanguageId}|${word.toLowerCase()}`;
  const cached = cache.get(cacheKey);
  if (cache.has(cacheKey)) return cached ?? null;

  try {
    const response = await fetch(`${apiHost(apiKey)}/v2/translate`, {
      method: 'POST',
      headers: {
        Authorization: `DeepL-Auth-Key ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        text: [word],
        source_lang: sourceLanguageId.toUpperCase(),
        target_lang: targetLanguageId.toUpperCase(),
      }),
    });

    // quota exceeded, invalid key, or unsupported language pair: not fatal,
    // the client falls back to other translation sources
    if (!response.ok) {
      const body = await response.text().catch(() => '');
      console.error(
        `DeepL request failed with status ${response.status}: ${body}`
      );
      return null;
    }

    const data = (await response.json()) as DeepLResponse;
    const translation = data.translations?.[0]?.text?.trim() || null;

    if (cache.size >= MAX_CACHE_ENTRIES) cache.clear();
    cache.set(cacheKey, translation);

    return translation;
  } catch (error) {
    console.error('DeepL request failed:', error);
    return null;
  }
};

export default {
  isConfigured,
  translateWord,
};
