import { StyleSheet } from 'react-native';
import { BOTTOM_NAVIGATION_HEIGHT, COLORS } from '@config';

export const styles = StyleSheet.create({
  container: {
    backgroundColor: COLORS.PRIMARY,
  },
  scrollView: {
    height: '100%',
    flex: 1,
    flexDirection: 'column',
    backgroundColor: COLORS.PRIMARY,
    paddingHorizontal: 16,
  },
  flatList: {
    paddingTop: 26,
    paddingBottom: BOTTOM_NAVIGATION_HEIGHT + 80,
  },
  flatListColumnWrapper: {
    alignItems: 'flex-start',
    justifyContent: 'flex-start',
    gap: 12,
  },
});
