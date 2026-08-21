import { StyleSheet } from 'react-native';
import { COLORS, Shapes } from '@config';

export const styles = StyleSheet.create({
  wrapper: {
    backgroundColor: COLORS.PRIMARY,
    height: '100%',
  },
  backgroundImage: {
    ...(StyleSheet.absoluteFill as any),
  },
  logo: {
    width: 53,
    height: 53,
    marginBottom: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  openfyMark: {
    width: 34,
    height: 53,
  },
  container: {
    paddingHorizontal: 35,
    height: '100%',
    justifyContent: 'flex-end',
    alignItems: 'center',
  },
  pressable: {
    backgroundColor: COLORS.TINT,
    paddingVertical: 18,
    paddingHorizontal: 24,
    borderRadius: Shapes.CIRCLE,
    width: '100%',
  },
  text: {
    fontSize: 16,
    fontWeight: '600',
    color: COLORS.SECONDARY,
    textAlign: 'center',
  },
  content: {
    alignItems: 'center',
    marginBottom: 20,
  },
  title: {
    color: COLORS.WHITE,
    fontFamily: 'Avenir Next',
    fontSize: 35,
    fontWeight: '700',
    textAlign: 'center',
    marginBottom: 25,
  },
  note: {
    color: COLORS.GREY,
    textAlign: 'center',
    lineHeight: 22,
    fontSize: 12,
    marginTop: 10,
    marginBottom: 150,
    fontStyle: 'italic',
  },
});
