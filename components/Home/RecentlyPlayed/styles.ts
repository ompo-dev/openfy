import { COLORS } from '@config';
import { StyleSheet } from 'react-native';

export const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  link: {
    borderRadius: 0,
    backgroundColor: COLORS.SECONDARY,
    flexDirection: 'row',
    alignItems: 'center',
    overflow: 'hidden',
    padding: 0,
  },
  imageView: {
    marginRight: 10,
  },
  image: {
    ...(StyleSheet.absoluteFill as any),
  },
  text: {
    fontFamily: 'SF-Bold',
    fontSize: 14,
    fontWeight: '700',
    color: COLORS.WHITE,
    paddingRight: 20,
  },
});
