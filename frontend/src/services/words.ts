import axios from 'axios';
import { UserWord } from '@alexandria/shared';
import getToken from '../utils/getToken';
import host from './host';

const baseUrl = `${host}/api/words`;

const getUserwordsInText = async function (
  currentTextId: string,
  targetLanguageId: string
): Promise<Array<UserWord>> {
  const token = getToken();

  const request = await axios.get(
    `${baseUrl}/text/${currentTextId}/language/${targetLanguageId}/`,
    {
      headers: { Authorization: `bearer ${token}` },
    }
  );

  // Guard against non-array responses so callers can't crash on .forEach/.filter.
  return Array.isArray(request.data) ? (request.data as Array<UserWord>) : [];
};

const getUserwordsByLanguage = async function (
  languageId: string
): Promise<Array<UserWord>> {
  const token = getToken();

  const request = await axios.get(`${baseUrl}/language/${languageId}/`, {
    headers: { Authorization: `bearer ${token}` },
  });

  // Guard against non-array responses so callers can't crash on .forEach/.filter.
  return Array.isArray(request.data) ? (request.data as Array<UserWord>) : [];
};

const addWordWithTranslation = async function (word: UserWord) {
  const token = getToken();

  const request = await axios.post(`${baseUrl}/`, word, {
    headers: { Authorization: `bearer ${token}` },
  });

  const response = request.data;
  return response;
};

const updateStatus = async function (word: UserWord) {
  const token = getToken();
  const { id, status } = word;

  const response = await axios.put(
    `${baseUrl}/${id}`,
    { status },
    {
      headers: { Authorization: `bearer ${token}` },
    }
  );

  return response;
};

export default {
  getUserwordsInText,
  getUserwordsByLanguage,
  addWordWithTranslation,
  updateStatus,
};
