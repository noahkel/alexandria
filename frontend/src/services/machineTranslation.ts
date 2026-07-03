import axios from 'axios';
import getToken from '../utils/getToken';
import host from './host';

const backendUrl = `${host}/api/machinetranslations`;

// MyMemory is a free, keyless translation API (https://mymemory.translated.net)
// used as a fallback when the backend has no DeepL key or the user is not
// logged in (e.g. demo mode)
const myMemoryUrl = 'https://api.mymemory.translated.net/get';

const cache = new Map<string, string | null>();

// once the backend responds 501 (no DeepL key configured), skip it for the
// rest of the session
let isBackendConfigured = true;

const lookupFromBackend = async function (
  word: string,
  sourceLanguageId: string,
  targetLanguageId: string
): Promise<string | null> {
  const token = getToken();
  if (!token || !isBackendConfigured) return null;

  try {
    const response = await axios.get(backendUrl, {
      params: { word, sourceLanguageId, targetLanguageId },
      headers: { Authorization: `bearer ${token}` },
    });

    return typeof response.data?.translation === 'string'
      ? response.data.translation
      : null;
  } catch (error) {
    if (axios.isAxiosError(error) && error.response?.status === 501) {
      isBackendConfigured = false;
    }
    return null;
  }
};

interface MyMemoryMatch {
  segment?: string;
  translation?: string;
  quality?: string | number;
}

const normalize = function (text: string): string {
  return text.trim().toLowerCase();
};

// MyMemory's "translation memory" contains crowd-sourced entries that can be
// badly mis-aligned (e.g. 'descubierta' -> 'outdoor comer en el exterior'),
// so candidates need sanity checks before being shown to the user
const isReasonableTranslation = function (
  candidate: string,
  word: string
): boolean {
  const translation = normalize(candidate);
  const query = normalize(word);

  if (!translation || translation === query) return false;
  if (candidate.toUpperCase().includes('MYMEMORY WARNING')) return false;

  // a translation vastly longer than the query is a mis-aligned memory
  // entry for some larger segment, not a translation of this word
  const queryTokens = query.split(/\s+/).length;
  const translationTokens = translation.split(/\s+/).length;
  return translationTokens <= Math.max(3, queryTokens * 3);
};

// some memory entries are stored in ALL CAPS; match the casing of the query
const matchCasing = function (candidate: string, word: string): string {
  return candidate === candidate.toUpperCase() && word !== word.toUpperCase()
    ? candidate.toLowerCase()
    : candidate;
};

const lookupFromMyMemory = async function (
  word: string,
  sourceLanguageId: string,
  targetLanguageId: string
): Promise<string | null> {
  try {
    const response = await axios.get(myMemoryUrl, {
      params: {
        q: word,
        langpair: `${sourceLanguageId}|${targetLanguageId}`,
      },
    });

    const { data } = response;
    if (Number(data?.responseStatus) !== 200) return null;

    // candidates in order of preference: the primary result first, then
    // exact-segment memory matches by descending quality
    const matches: Array<MyMemoryMatch> = Array.isArray(data?.matches)
      ? [...data.matches]
      : [];

    const candidates: Array<unknown> = [
      data?.responseData?.translatedText,
      ...matches
        .filter(
          (match) =>
            typeof match?.translation === 'string' &&
            typeof match?.segment === 'string' &&
            normalize(match.segment) === normalize(word)
        )
        .sort((a, b) => Number(b.quality ?? 0) - Number(a.quality ?? 0))
        .map((match) => match.translation),
    ];

    for (const candidate of candidates) {
      if (typeof candidate === 'string') {
        const trimmed = candidate.trim();
        if (isReasonableTranslation(trimmed, word)) {
          return matchCasing(trimmed, word);
        }
      }
    }

    return null;
  } catch {
    return null;
  }
};

const lookupTranslation = async function (
  word: string,
  sourceLanguageId: string,
  targetLanguageId: string
): Promise<string | null> {
  const cacheKey = `${sourceLanguageId}|${targetLanguageId}|${word.toLowerCase()}`;

  const cached = cache.get(cacheKey);
  if (cache.has(cacheKey)) {
    return cached ?? null;
  }

  const result =
    (await lookupFromBackend(word, sourceLanguageId, targetLanguageId)) ??
    (await lookupFromMyMemory(word, sourceLanguageId, targetLanguageId));

  cache.set(cacheKey, result);
  return result;
};

export default {
  lookupTranslation,
};
