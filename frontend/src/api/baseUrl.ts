export function getApiBaseUrl() {
  const configuredUrl = import.meta.env.VITE_API_URL;

  if (!configuredUrl || configuredUrl === 'same-origin') {
    return window.location.origin;
  }

  return configuredUrl;
}
