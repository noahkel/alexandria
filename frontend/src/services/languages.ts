import axios from 'axios';
import { Language } from '@alexandria/shared';
import host from './host';

const baseUrl = `${host}/api/languages`;

const getAllLanguages = async function () {
  const request = await axios.get(baseUrl);

  // Guard against non-array responses (e.g. an HTML error page from a
  // misconfigured API), so callers that iterate this can't crash the app.
  return Array.isArray(request.data) ? (request.data as Array<Language>) : [];
};

export default {
  getAllLanguages,
};
