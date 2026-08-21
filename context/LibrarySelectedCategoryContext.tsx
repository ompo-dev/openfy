import * as React from 'react';

import { Categories } from '@config';
import { SharedValue, useSharedValue } from 'react-native-reanimated';

export type LibrarySelectedCategoryProviderPropsType = {
  children: React.ReactNode;
};

export type LibraryView = 'songs' | 'playlists' | 'albums' | 'artists';

const nextLibraryView: Record<LibraryView, LibraryView> = {
  songs: 'playlists',
  playlists: 'albums',
  albums: 'artists',
  artists: 'songs',
};

export const LibrarySelectedCategoryContext = React.createContext<{
  librarySelectedCategory: Categories;
  setLibrarySelectedCategory: React.Dispatch<React.SetStateAction<Categories>>;
  animatedValue: SharedValue<number> | null;
  librarySearchQuery: string;
  setLibrarySearchQuery: React.Dispatch<React.SetStateAction<string>>;
  librarySort: 'recent' | 'title';
  setLibrarySort: React.Dispatch<React.SetStateAction<'recent' | 'title'>>;
  toggleLibrarySort: () => void;
  libraryView: LibraryView;
  setLibraryView: React.Dispatch<React.SetStateAction<LibraryView>>;
  toggleLibraryView: () => void;
  libraryRevision: number;
  refreshLibrary: () => void;
}>({
  librarySelectedCategory: Categories.DOWNLOADED,
  setLibrarySelectedCategory: () => {},
  animatedValue: null,
  librarySearchQuery: '',
  setLibrarySearchQuery: () => {},
  librarySort: 'recent',
  setLibrarySort: () => {},
  toggleLibrarySort: () => {},
  libraryView: 'songs',
  setLibraryView: () => {},
  toggleLibraryView: () => {},
  libraryRevision: 0,
  refreshLibrary: () => {},
});

export const LibrarySelectedCategoryProvider = ({
  children,
}: LibrarySelectedCategoryProviderPropsType) => {
  const [librarySelectedCategory, setLibrarySelectedCategory] =
    React.useState<Categories>(Categories.DOWNLOADED);
  const [librarySearchQuery, setLibrarySearchQuery] = React.useState('');
  const [librarySort, setLibrarySort] = React.useState<'recent' | 'title'>(
    'recent'
  );
  const [libraryView, setLibraryView] = React.useState<LibraryView>(
    'songs'
  );
  const [libraryRevision, setLibraryRevision] = React.useState(0);
  const animatedValue = useSharedValue(1);

  return (
    <LibrarySelectedCategoryContext.Provider
      value={{
        librarySelectedCategory,
        setLibrarySelectedCategory,
        animatedValue: animatedValue as SharedValue<number>,
        librarySearchQuery,
        setLibrarySearchQuery,
        librarySort,
        setLibrarySort,
        toggleLibrarySort: () =>
          setLibrarySort((sort) => (sort === 'recent' ? 'title' : 'recent')),
        libraryView,
        setLibraryView,
        toggleLibraryView: () => setLibraryView((view) => nextLibraryView[view]),
        libraryRevision,
        refreshLibrary: () => setLibraryRevision((revision) => revision + 1),
      }}
    >
      {children}
    </LibrarySelectedCategoryContext.Provider>
  );
};

export const useLibrarySelectedCategory = (): {
  librarySelectedCategory: Categories;
  setLibrarySelectedCategory: React.Dispatch<React.SetStateAction<Categories>>;
  animatedValue: SharedValue<number>;
  librarySearchQuery: string;
  setLibrarySearchQuery: React.Dispatch<React.SetStateAction<string>>;
  librarySort: 'recent' | 'title';
  setLibrarySort: React.Dispatch<React.SetStateAction<'recent' | 'title'>>;
  toggleLibrarySort: () => void;
  libraryView: LibraryView;
  setLibraryView: React.Dispatch<React.SetStateAction<LibraryView>>;
  toggleLibraryView: () => void;
  libraryRevision: number;
  refreshLibrary: () => void;
} => {
  const context = React.useContext(LibrarySelectedCategoryContext);

  if (
    context.animatedValue === null ||
    !context.librarySelectedCategory ||
    !context.setLibrarySelectedCategory
  ) {
    throw new Error('Failed to access context values');
  }

  return { ...context, animatedValue: context.animatedValue };
};
