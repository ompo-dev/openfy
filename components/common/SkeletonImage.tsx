import * as React from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { Image, type ImageProps } from 'expo-image';

type SkeletonImageProps = Omit<ImageProps, 'style'> & {
  style?: ImageProps['style'];
};

export const SkeletonImage = ({
  onError,
  onLoad,
  source,
  style,
  ...imageProps
}: SkeletonImageProps) => {
  const [loaded, setLoaded] = React.useState(false);
  const sourceKey = typeof source === 'string' ? source : JSON.stringify(source);

  React.useEffect(() => {
    setLoaded(false);
  }, [sourceKey]);

  return (
    <View style={[style as StyleProp<ViewStyle>, styles.frame]}>
      <Image
        {...imageProps}
        source={source}
        style={StyleSheet.absoluteFill}
        onLoad={(event) => {
          setLoaded(true);
          onLoad?.(event);
        }}
        onError={(event) => {
          setLoaded(true);
          onError?.(event);
        }}
      />
      {!loaded ? (
        <View pointerEvents="none" style={styles.skeleton} />
      ) : null}
    </View>
  );
};

const styles = StyleSheet.create({
  frame: { backgroundColor: '#252529', overflow: 'hidden' },
  skeleton: { ...(StyleSheet.absoluteFill as any), backgroundColor: '#626268' },
});
