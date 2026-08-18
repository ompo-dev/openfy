import * as React from 'react';
import { Redirect } from 'expo-router';

import { getSessionToken } from '@api';

export default function App() {
  const [isLoading, setIsLoading] = React.useState(true);
  const [token, setToken] = React.useState<string | null>(null);

  React.useEffect(() => {
    (async () => {
      try {
        const storedToken = await getSessionToken();
        setToken(storedToken);
      } catch (error) {
        console.error(error);
      } finally {
        setIsLoading(false);
      }
    })();
  }, []);

  if (isLoading) {
    return null;
  }

  return <Redirect href={{ pathname: '/home', params: {} }} />;
}
