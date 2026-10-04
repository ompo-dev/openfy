/**
 * HomeCategories Component
 * Renders native Apple UISegmentedControl on iOS (SwiftPicker) and Glass Pills on Android/Web.
 */

import * as React from 'react';
import { ScrollView, StyleSheet, Text, View, useColorScheme } from 'react-native';
import {
  IOS_NATIVE_ENABLED,
  SwiftHost,
  SwiftPicker,
  SwiftText,
  swiftPickerStyle,
  swiftTag,
  GlassSurface,
  LoggedPressable,
} from '../../native';

const CATEGORIES = ['Tudo', 'Músicas', 'Podcasts', 'Audiobooks'];

type HomeCategoriesProps = {
  selectedCategory?: string;
  onSelectCategory?: (category: string) => void;
};

export const HomeCategories = ({
  selectedCategory = 'Tudo',
  onSelectCategory,
}: HomeCategoriesProps) => {
  const [selected, setSelected] = React.useState(selectedCategory);
  const scheme = useColorScheme() === 'dark' ? 'dark' : 'light';

  const handlePress = (category: string) => {
    setSelected(category);
    onSelectCategory?.(category);
  };

  if (IOS_NATIVE_ENABLED) {
    return (
      <View style={styles.iosWrapper}>
        <SwiftHost
          style={styles.iosHost}
          colorScheme={scheme}
          matchContents={{ horizontal: false, vertical: true }}
        >
          <SwiftPicker
            selection={selected}
            onSelectionChange={handlePress}
            modifiers={[swiftPickerStyle('segmented')]}
          >
            {CATEGORIES.map((cat) => (
              <SwiftText key={cat} modifiers={[swiftTag(cat)]}>
                {cat}
              </SwiftText>
            ))}
          </SwiftPicker>
        </SwiftHost>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
      >
        {CATEGORIES.map((category) => {
          const isSelected = selected === category;
          return (
            <LoggedPressable
              key={category}
              onPress={() => handlePress(category)}
              accessibilityRole="button"
              accessibilityState={{ selected: isSelected }}
            >
              <GlassSurface glass={isSelected ? 'regular' : 'clear'} isInteractive style={styles.pill}>
              <Text
                style={[
                  styles.pillText,
                  isSelected
                    ? styles.pillTextSelected
                    : styles.pillTextUnselected,
                ]}
              >
                {category}
              </Text>
              </GlassSurface>
            </LoggedPressable>
          );
        })}
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  iosWrapper: {
    paddingHorizontal: 16,
    paddingVertical: 6,
  },
  iosHost: {
    height: 36,
    alignSelf: 'stretch',
  },
  container: {
    height: 48,
    justifyContent: 'center',
  },
  scrollContent: {
    paddingHorizontal: 16,
    gap: 8,
    alignItems: 'center',
  },
  pill: {
    paddingHorizontal: 18,
    paddingVertical: 8,
    borderRadius: 20,
  },
  pillText: {
    fontSize: 13,
    fontFamily: 'SF-Semibold',
    fontWeight: '600',
  },
  pillTextSelected: {
    color: '#FFFFFF',
  },
  pillTextUnselected: {
    color: '#A7A7A7',
  },
});
