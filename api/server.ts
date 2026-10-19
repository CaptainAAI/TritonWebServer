const apiUrl = process.env.API_URL?.endsWith('/') ? process.env.API_URL : process.env.API_URL + '/';
const apiAuthHeader = process.env.API_AUTH_HEADER;

export default function fetchServer(path: string, options?: RequestInit) {
  const headers = new Headers(options?.headers);
  headers.set('Authorization', apiAuthHeader || '');
  return fetch(apiUrl + path, {
    ...options,
    headers,
  } as RequestInit);
}
