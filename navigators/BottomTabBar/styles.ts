import { StyleSheet } from 'react-native';
import { COLORS, BOTTOM_NAVIGATION_HEIGHT } from '@config';

export const styles = StyleSheet.create({
  container: {
    ...(StyleSheet.absoluteFill as any),
    top: 'auto',
    height: BOTTOM_NAVIGATION_HEIGHT,
    paddingBottom: 20,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
    elevation: 7,
    shadowColor: COLORS.BLACK,
    shadowOffset: { width: 0, height: -5 },
    shadowOpacity: 0.7,
    shadowRadius: 7,
  },
  gradient: {
    ...(StyleSheet.absoluteFill as any),
  },
  pressable: {
    height: '100%',
    alignItems: 'center',
    justifyContent: 'center',
  },
  linkContainer: {
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  icon: {
    color: COLORS.GREY,
  },
  text: {
    color: COLORS.GREY,
    fontSize: 13,
    lineHeight: 13,
    textAlign: 'center',
    fontFamily: 'SF-Regular',
    marginTop: 5,
  },
  active: {
    color: COLORS.WHITE,
  },
  importButton: {
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 10,
  },
  importButtonInner: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: '#1DB954',
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 4,
    shadowColor: '#1DB954',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.5,
    shadowRadius: 6,
  },
});

