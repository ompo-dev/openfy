import * as React from 'react';
import { Pressable, Text } from 'react-native';
import Animated, {
  interpolateColor,
  runOnJS,
  useAnimatedStyle,
  withTiming,
} from 'react-native-reanimated';

import { useLibrarySelectedCategory } from '@context';
import { Categories, COLORS } from '@config';
import { translations } from '@data';

import { styles } from './styles';
import { GlassSurface } from '../../../native';

export type CategoryPressablePropsType = {
  currentCategory: Exclude<Categories, Categories.ALL>;
};

const CategoryPressable = React.memo(
  ({ currentCategory }: CategoryPressablePropsType) => {
    const {
      librarySelectedCategory,
      setLibrarySelectedCategory,
      animatedValue,
    } = useLibrarySelectedCategory();

    const handleCategoryChange = React.useCallback(
      (newCategory: Categories) => {
        if (librarySelectedCategory === newCategory) {
          return;
        }

        animatedValue.value = withTiming(0, { duration: 100 }, (isFinished) => {
          if (!isFinished) {
            return;
          }

          runOnJS(setLibrarySelectedCategory)(newCategory);
          animatedValue.value = withTiming(1, { duration: 300 });
        });
      },
      [animatedValue, librarySelectedCategory, setLibrarySelectedCategory]
    );

    const animatedPressableStyles = useAnimatedStyle(() => ({
      backgroundColor: interpolateColor(
        currentCategory === librarySelectedCategory ? animatedValue.value : 0,
        [0, 1],
        ['rgba(30,30,32,0.12)', 'rgba(29,185,84,0.28)']
      ),
    }));

    const animatedTextStyles = useAnimatedStyle(() => ({
      color: interpolateColor(
        currentCategory === librarySelectedCategory ? animatedValue.value : 0,
        [0, 0.2, 1],
        [COLORS.WHITE, COLORS.WHITE, COLORS.WHITE]
      ),
    }));

    const AnimatedPressable = Animated.createAnimatedComponent(Pressable);
    const AnimatedText = Animated.createAnimatedComponent(Text);

    return (
      <AnimatedPressable
        style={[styles.pressable, animatedPressableStyles]}
        accessibilityRole="button"
        accessibilityState={{ selected: currentCategory === librarySelectedCategory }}
        onPress={() => handleCategoryChange(currentCategory)}
      >
        <GlassSurface glass={currentCategory === librarySelectedCategory ? 'regular' : 'clear'}
          isInteractive style={styles.category}>
        <AnimatedText style={[styles.categoryText, animatedTextStyles]}>
          {translations.libraryCategories[currentCategory]}
        </AnimatedText>
        </GlassSurface>
      </AnimatedPressable>
    );
  }
);

CategoryPressable.displayName = 'CategoryPressable';

export { CategoryPressable };
