import { create } from 'zustand';
import {
  getFollowedArtists, getFollowedArtistsSnapshot, subscribeFollowedArtists,
  type FollowedArtist,
} from '../services/library/followedArtists';

type FollowedArtistsState = {
  artists: FollowedArtist[];
  ready: boolean;
  revision: number;
  hydrate: () => Promise<void>;
};

export const useFollowedArtistsStore = create<FollowedArtistsState>((set) => ({
  artists: getFollowedArtistsSnapshot(), ready: false, revision: 0,
  hydrate: async () => {
    await getFollowedArtists();
    set({ ready: true });
  },
}));

subscribeFollowedArtists((artists) => useFollowedArtistsStore.setState((state) => ({
  artists, ready: true, revision: state.revision + 1,
})));
