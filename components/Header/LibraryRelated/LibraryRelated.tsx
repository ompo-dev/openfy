import * as React from 'react';
import { View, StyleSheet, useColorScheme } from 'react-native';
import { ScrollView } from 'react-native-gesture-handler';

import { CategoryPressable } from './CategoryPressable';
import { useLibrarySelectedCategory } from '@context';
import { Categories } from '@config';
import { translations } from '@data';
import { styles } from './styles';
import {
  IOS_NATIVE_ENABLED,
  SwiftHost,
  SwiftPicker,
  SwiftText,
  swiftPickerStyle,
  swiftTag,
} from '../../native';

export const LibraryRelated = () => {
  const { librarySelectedCategory, setLibrarySelectedCategory } =
    useLibrarySelectedCategory();
  const scheme = useColorScheme() === 'dark' ? 'dark' : 'light';

  const categoryList = (Object.values(Categories) as Categories[]).filter(
    (c): c is Exclude<Categories, Categories.ALL> => c !== Categories.ALL
  );

  if (IOS_NATIVE_ENABLED) {
    return (
      <View style={iosStyles.wrapper}>
        <SwiftHost
          style={iosStyles.host}
          colorScheme={scheme}
          matchContents={{ horizontal: false, vertical: true }}
        >
          <SwiftPicker
            selection={librarySelectedCategory}
            onSelectionChange={(next: string) =>
              setLibrarySelectedCategory(next as Categories)
            }
            modifiers={[swiftPickerStyle('segmented')]}
          >
            {categoryList.map((cat) => (
              <SwiftText key={cat} modifiers={[swiftTag(cat)]}>
                {translations.libraryCategories[cat]}
              </SwiftText>
            ))}
          </SwiftPicker>
        </SwiftHost>
      </View>
    );
  }

  return (
    <ScrollView
      style={styles.scrollView}
      horizontal
      showsHorizontalScrollIndicator={false}
    >
      <View style={styles.scrollViewContainer}>
        {categoryList.map((currentCategory) => (
          <CategoryPressable
            key={currentCategory}
            currentCategory={currentCategory}
          />
        ))}
      </View>
    </ScrollView>
  );
};

const iosStyles = StyleSheet.create({
  wrapper: {
    paddingHorizontal: 16,
    paddingVertical: 6,
  },
  host: {
    height: 36,
    alignSelf: 'stretch',
  },
});
