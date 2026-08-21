import axios, { type AxiosRequestConfig, type AxiosResponse } from 'axios';

import { getSessionlessToken } from './getSessionlessToken';

const request = async <Response>(
  url: string,
  config: AxiosRequestConfig,
  forceRefresh: boolean
): Promise<AxiosResponse<Response>> => {
  const { token } = await getSessionlessToken(forceRefresh);

  if (!token) {
    throw new Error('Não foi possível autenticar com o Spotify.');
  }

  return axios.get<Response>(url, {
    ...config,
    headers: {
      ...config.headers,
      Authorization: `Bearer ${token}`,
    },
  });
};

/** Retries once with a fresh client token when Spotify invalidates the cache. */
export const spotifyGet = async <Response>(
  url: string,
  config: AxiosRequestConfig = {}
): Promise<AxiosResponse<Response>> => {
  try {
    return await request<Response>(url, config, false);
  } catch (error) {
    if (!axios.isAxiosError(error) || error.response?.status !== 401) {
      throw error;
    }

    return request<Response>(url, config, true);
  }
};
