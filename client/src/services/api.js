import axios from 'axios';

const api = axios.create({
  baseURL: '/api',
  withCredentials: true,
});

export function getApiError(error, fallback = 'Something went wrong. Please try again.') {
  return error.response?.data?.error || fallback;
}

export default api;