import { StyleSheet } from 'react-native';
import { COLORS, Shapes } from '@config';

export const styles = StyleSheet.create({
  category: {
    backgroundColor: COLORS.SECONDARY,
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 20,
    minHeight: 38,
    justifyContent: 'center',
    alignItems: 'center',
  },
  categoryText: {
    color: COLORS.WHITE,
    fontSize: 13,
    fontFamily: 'SF-Semibold',
    fontWeight: '600',
    textAlign: 'center',
  },
});
