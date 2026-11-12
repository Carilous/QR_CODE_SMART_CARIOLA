import axios from 'axios';

const api = axios.create({
  baseURL: '/api',
  withCredentials: true,
});

export function getApiError(error, fallback = 'Something went wrong. Please try again.') {
  const e = error?.response?.data?.error;
  if (typeof e === 'string') return e;
  if (e && typeof e.message === 'string') return e.message;
  if (typeof error?.response?.data?.message === 'string') return error.response.data.message;
  return fallback;
}

export default api;