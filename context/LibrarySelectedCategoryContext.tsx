import * as React from 'react';
import type { SetStateAction } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { SharedValue, useSharedValue } from 'react-native-reanimated';

import type { Categories } from '@config';
import { useLibraryStore, type LibraryView } from '../stores/useLibraryStore';

export type LibrarySelectedCategoryProviderPropsType = {
  children: React.ReactNode;
};
export type { LibraryView };

const LibraryAnimationContext = React.createContext<SharedValue<number> | null>(null);

export const LibrarySelectedCategoryProvider = ({
  children,
}: LibrarySelectedCategoryProviderPropsType) => {
  const animatedValue = useSharedValue(1);
  return (
    <LibraryAnimationContext.Provider value={animatedValue}>
      {children}
    </LibraryAnimationContext.Provider>
  );
};

type LibrarySelectedCategoryValue = {
  librarySelectedCategory: Categories;
  setLibrarySelectedCategory: (value: SetStateAction<Categories>) => void;
  animatedValue: SharedValue<number>;
  librarySearchQuery: string;
  setLibrarySearchQuery: (value: SetStateAction<string>) => void;
  librarySort: 'recent' | 'title';
  setLibrarySort: (value: SetStateAction<'recent' | 'title'>) => void;
  toggleLibrarySort: () => void;
  libraryView: LibraryView;
  setLibraryView: (value: SetStateAction<LibraryView>) => void;
  toggleLibraryView: () => void;
  libraryRevision: number;
  refreshLibrary: () => void;
};

export const useLibrarySelectedCategory = (): LibrarySelectedCategoryValue => {
  const animatedValue = React.useContext(LibraryAnimationContext);
  const state = useLibraryStore(useShallow((current) => ({
    librarySelectedCategory: current.librarySelectedCategory,
    setLibrarySelectedCategory: current.setLibrarySelectedCategory,
    librarySearchQuery: current.librarySearchQuery,
    setLibrarySearchQuery: current.setLibrarySearchQuery,
    librarySort: current.librarySort,
    setLibrarySort: current.setLibrarySort,
    toggleLibrarySort: current.toggleLibrarySort,
    libraryView: current.libraryView,
    setLibraryView: current.setLibraryView,
    toggleLibraryView: current.toggleLibraryView,
    libraryRevision: current.libraryRevision,
    refreshLibrary: current.refreshLibrary,
  })));

  if (!animatedValue) {
    throw new Error('useLibrarySelectedCategory must be used inside its provider');
  }
  return { ...state, animatedValue };
};
