jest.mock('../../model/db-query');
jest.mock('../../services/users');
jest.mock('../../services/machineTranslation');
jest.mock('../../utils/sendmail');
jest.mock('resend', () => ({
  Resend: jest.fn().mockImplementation(() => ({})),
}));

import supertest from 'supertest';
import jwt from 'jsonwebtoken';
import app from '../../app';
import env from '../../lib/env';
import type { SanitizedUser } from '@alexandria/shared';
import users from '../../services/users';
import machineTranslation from '../../services/machineTranslation';

const api = supertest(app);

const mockedUsers = jest.mocked(users);
const mockedMachineTranslation = jest.mocked(machineTranslation);

const validToken = jwt.sign({ id: 1 }, env.SECRET);
const authHeader = `Bearer ${validToken}`;

const mockUser: SanitizedUser = {
  id: 1,
  username: 'testuser',
  email: 'test@test.com',
  knownLanguageId: 'en',
  learnLanguageId: 'es',
  verified: true,
};

beforeEach(() => {
  jest.clearAllMocks();
  mockedUsers.getById.mockResolvedValue(mockUser);
  mockedMachineTranslation.isConfigured.mockReturnValue(true);
});

describe('GET /api/machinetranslations', () => {
  it('rejects requests without a token', async () => {
    const response = await api
      .get('/api/machinetranslations')
      .query({ word: 'frío', sourceLanguageId: 'es', targetLanguageId: 'en' });

    expect(response.status).toBe(401);
  });

  it('rejects requests with missing query parameters', async () => {
    const response = await api
      .get('/api/machinetranslations')
      .query({ word: 'frío' })
      .set('Authorization', authHeader);

    expect(response.status).toBe(400);
  });

  it('returns the translation from the service', async () => {
    mockedMachineTranslation.translateWord.mockResolvedValue('cold');

    const response = await api
      .get('/api/machinetranslations')
      .query({ word: 'frío', sourceLanguageId: 'es', targetLanguageId: 'en' })
      .set('Authorization', authHeader);

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ translation: 'cold' });
    expect(mockedMachineTranslation.translateWord).toHaveBeenCalledWith(
      'frío',
      'es',
      'en'
    );
  });

  it('returns a null translation when the service has no result', async () => {
    mockedMachineTranslation.translateWord.mockResolvedValue(null);

    const response = await api
      .get('/api/machinetranslations')
      .query({ word: 'frío', sourceLanguageId: 'es', targetLanguageId: 'en' })
      .set('Authorization', authHeader);

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ translation: null });
  });

  it('responds 501 when no DeepL API key is configured', async () => {
    mockedMachineTranslation.isConfigured.mockReturnValue(false);

    const response = await api
      .get('/api/machinetranslations')
      .query({ word: 'frío', sourceLanguageId: 'es', targetLanguageId: 'en' })
      .set('Authorization', authHeader);

    expect(response.status).toBe(501);
    expect(mockedMachineTranslation.translateWord).not.toHaveBeenCalled();
  });
});
