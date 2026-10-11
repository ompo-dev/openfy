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
  const sourceKey = typeof source === 'string' ? source : JSON.stringify(source);
  const currentSource = React.useRef(sourceKey);
  currentSource.current = sourceKey;
  const [loadedSource, setLoadedSource] = React.useState<string>();

  return (
    <View style={[style as StyleProp<ViewStyle>, styles.frame]}>
      <Image
        {...imageProps}
        source={source}
        style={StyleSheet.absoluteFill}
        onLoad={(event) => {
          if (currentSource.current === sourceKey) setLoadedSource(sourceKey);
          onLoad?.(event);
        }}
        onError={(event) => {
          if (currentSource.current === sourceKey) setLoadedSource(sourceKey);
          onError?.(event);
        }}
      />
      {loadedSource !== sourceKey ? (
        <View pointerEvents="none" style={styles.skeleton} />
      ) : null}
    </View>
  );
};

const styles = StyleSheet.create({
  frame: { backgroundColor: '#252529', overflow: 'hidden' },
  skeleton: { ...(StyleSheet.absoluteFill as any), backgroundColor: '#626268' },
});
