import axios, { type AxiosRequestConfig, type AxiosResponse } from 'axios';

import { getSessionToken } from './getSessionToken';
import { getSessionlessToken } from './getSessionlessToken';

const request = async <Response>(
  url: string,
  config: AxiosRequestConfig,
  forceRefresh: boolean
): Promise<AxiosResponse<Response>> => {
  const userToken = forceRefresh ? null : await getSessionToken();
  const { token: sessionlessToken } = userToken
    ? { token: null }
    : await getSessionlessToken(forceRefresh);
  const token = userToken || sessionlessToken;

  if (!token) {
    throw new Error('Entre no Spotify para carregar esses dados.');
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
