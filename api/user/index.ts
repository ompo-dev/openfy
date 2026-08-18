import axios from 'axios';

import { UserModel } from '@models';
import { UserResponseType } from '@config';
import { parseToUser } from '@utils';

import { BASE_URL, fileSystemMiddleware, getSessionToken } from '../config';

export const getUser = async (): Promise<UserModel> => {
  try {
    const token = await getSessionToken();
    if (!token) {
      return {
        id: 'guest',
        type: 'user',
        displayName: 'Openfy User',
        imageURL: '',
      };
    }
    const response = (await axios.get(`${BASE_URL}/me`, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    })) as { data: UserResponseType };

    return parseToUser(response.data);
  } catch (error) {
    return {
      id: 'guest',
      type: 'user',
      displayName: 'Openfy User',
      imageURL: '',
    };
  }
};

// eslint-disable-next-line
const getUserFromFileSystem = async () =>
  await fileSystemMiddleware<UserModel>('user_profile', getUser);
