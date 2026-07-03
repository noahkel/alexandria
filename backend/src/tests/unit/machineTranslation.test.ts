jest.mock('../../lib/env', () => ({
  __esModule: true,
  default: {
    SECRET: 'testsecret',
    DATABASE_URL: 'postgres://localhost/test',
    PORT: 3000,
    HOST: '0.0.0.0',
    NODE_ENV: 'test',
    DATABASE_SSL: false,
    CORS_ORIGIN: '*',
    DEEPL_API_KEY: 'test-key:fx',
  },
}));

import machineTranslation from '../../services/machineTranslation';
import env from '../../lib/env';

const mockFetch = jest.fn();
global.fetch = mockFetch as unknown as typeof fetch;

describe('translateWord', () => {
  beforeEach(() => jest.clearAllMocks());

  it('returns the DeepL translation with uppercased language codes', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        translations: [{ detected_source_language: 'ES', text: 'cold' }],
      }),
    });

    const result = await machineTranslation.translateWord('frío', 'es', 'en');

    expect(result).toBe('cold');
    expect(mockFetch.mock.calls[0][0]).toBe(
      'https://api-free.deepl.com/v2/translate'
    );
    const requestBody = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(requestBody).toEqual({
      text: ['frío'],
      source_lang: 'ES',
      target_lang: 'EN',
    });
  });

  it('caches successful lookups', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ translations: [{ text: 'sun' }] }),
    });

    const first = await machineTranslation.translateWord('sol', 'es', 'en');
    const second = await machineTranslation.translateWord('sol', 'es', 'en');

    expect(first).toBe('sun');
    expect(second).toBe('sun');
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it('returns null when DeepL responds with an error', async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 456,
      text: async () => 'Quota exceeded',
    });

    const result = await machineTranslation.translateWord('luna', 'es', 'en');

    expect(result).toBeNull();
  });

  it('returns null when the request fails', async () => {
    mockFetch.mockRejectedValue(new Error('network down'));

    const result = await machineTranslation.translateWord(
      'estrella',
      'es',
      'en'
    );

    expect(result).toBeNull();
  });

  it('returns null without calling DeepL when no API key is configured', async () => {
    const mockedEnv = env as { DEEPL_API_KEY?: string };
    const savedKey = mockedEnv.DEEPL_API_KEY;
    mockedEnv.DEEPL_API_KEY = undefined;

    const result = await machineTranslation.translateWord('mar', 'es', 'en');

    expect(result).toBeNull();
    expect(mockFetch).not.toHaveBeenCalled();
    expect(machineTranslation.isConfigured()).toBe(false);

    mockedEnv.DEEPL_API_KEY = savedKey;
    expect(machineTranslation.isConfigured()).toBe(true);
  });
});
