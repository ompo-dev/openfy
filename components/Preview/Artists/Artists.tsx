import * as React from 'react';
import { Pressable, Text, View } from 'react-native';
import { Image } from 'expo-image';
import { Href, useRouter } from 'expo-router';

import { ArtistModel } from '@models';

import { styles } from './styles';

export type ArtistsPropsType = {
  artists: ArtistModel[] | null;
};

export const Artists = ({ artists }: ArtistsPropsType) => {
  const router = useRouter();
  const handlePress = React.useCallback(
    (artistId: string) => {
      router.push(`/artists/${artistId}` as Href);
    },
    [router]
  );

  const checkArtistIDisEmpty = React.useMemo(
    () => artists && artists.some((artist) => !artist.id),
    [artists]
  );

  if (!artists || checkArtistIDisEmpty) {
    return null;
  }

  return artists.map(({ id, imageURL, name }) => (
    <Pressable
      style={styles.link}
      onPress={() => handlePress(id)}
      key={id}
      testID={`artist-link-${id}`}
    >
      <View style={styles.container}>
        <View style={styles.imageView}>
          <Image
            style={styles.image}
            source={{ uri: imageURL }}
            testID="artist-image"
          />
        </View>
        <View>
          <Text style={styles.text} testID="artist-name">
            {name}
          </Text>
        </View>
      </View>
    </Pressable>
  ));
};
