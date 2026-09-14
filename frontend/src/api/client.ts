import axios from 'axios';
import { getApiBaseUrl } from './baseUrl';

const api = axios.create({
  baseURL: getApiBaseUrl(),
});

// Add interceptor for JWT
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('access_token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

export default api;
