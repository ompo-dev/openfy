/**
 * HomeCategories Component
 * SwiftUI / Apple Design filter pills (All, Music, Podcasts, Audiobooks)
 */

import * as React from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

const CATEGORIES = ['All', 'Music', 'Podcasts', 'Audiobooks'];

type HomeCategoriesProps = {
  selectedCategory?: string;
  onSelectCategory?: (category: string) => void;
};

export const HomeCategories = ({
  selectedCategory = 'All',
  onSelectCategory,
}: HomeCategoriesProps) => {
  const [selected, setSelected] = React.useState(selectedCategory);

  const handlePress = (category: string) => {
    setSelected(category);
    onSelectCategory?.(category);
  };

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
            <Pressable
              key={category}
              onPress={() => handlePress(category)}
              style={[
                styles.pill,
                isSelected ? styles.pillSelected : styles.pillUnselected,
              ]}
            >
              <Text
                style={[
                  styles.pillText,
                  isSelected ? styles.pillTextSelected : styles.pillTextUnselected,
                ]}
              >
                {category}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
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
    borderWidth: 1,
  },
  pillSelected: {
    backgroundColor: '#2A2A2A',
    borderColor: '#404040',
  },
  pillUnselected: {
    backgroundColor: '#181818',
    borderColor: '#282828',
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
