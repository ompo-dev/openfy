import { create } from 'zustand';
import type { SetStateAction } from 'react';

import { Categories } from '../config';

export type LibraryView = 'songs' | 'playlists' | 'albums' | 'artists';

const nextLibraryView: Record<LibraryView, LibraryView> = {
  songs: 'playlists',
  playlists: 'albums',
  albums: 'artists',
  artists: 'songs',
};

type LibraryState = {
  librarySelectedCategory: Categories;
  librarySearchQuery: string;
  librarySort: 'recent' | 'title';
  libraryView: LibraryView;
  libraryRevision: number;
  setLibrarySelectedCategory: (value: SetStateAction<Categories>) => void;
  setLibrarySearchQuery: (value: SetStateAction<string>) => void;
  setLibrarySort: (value: SetStateAction<'recent' | 'title'>) => void;
  toggleLibrarySort: () => void;
  setLibraryView: (value: SetStateAction<LibraryView>) => void;
  toggleLibraryView: () => void;
  refreshLibrary: () => void;
};

const resolveUpdate = <Value,>(
  value: SetStateAction<Value>,
  current: Value
) => typeof value === 'function'
  ? (value as (previous: Value) => Value)(current)
  : value;

export const useLibraryStore = create<LibraryState>((set, get) => ({
  librarySelectedCategory: Categories.DOWNLOADED,
  librarySearchQuery: '',
  librarySort: 'recent',
  libraryView: 'songs',
  libraryRevision: 0,
  setLibrarySelectedCategory: (value) => set((state) => ({
    librarySelectedCategory: resolveUpdate(value, state.librarySelectedCategory),
  })),
  setLibrarySearchQuery: (value) => set((state) => ({
    librarySearchQuery: resolveUpdate(value, state.librarySearchQuery),
  })),
  setLibrarySort: (value) => set((state) => ({
    librarySort: resolveUpdate(value, state.librarySort),
  })),
  toggleLibrarySort: () => set((state) => ({
    librarySort: state.librarySort === 'recent' ? 'title' : 'recent',
  })),
  setLibraryView: (value) => set((state) => ({
    libraryView: resolveUpdate(value, state.libraryView),
  })),
  toggleLibraryView: () => set((state) => ({
    libraryView: nextLibraryView[state.libraryView],
  })),
  refreshLibrary: () => set((state) => ({ libraryRevision: state.libraryRevision + 1 })),
}));
