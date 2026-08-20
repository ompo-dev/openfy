/**
 * ListeningFeed — shared listening posts shown below music notes.
 */

import * as React from 'react';
import {
  Image,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';

import { usePlayer, type PlayerTrack } from '@context';
import {
  CompactMusicCards,
  type CompactTrackItem,
} from './CompactMusicCarousel';
import {
  NoteLyricBlocks,
  type NoteLyricSegment,
} from './FriendActivityStatus/NoteLyricLine';

type PostAuthor = {
  name: string;
  avatarUrl: string;
  listeningTo?: string;
};

const DRAKE_TRACKS: CompactTrackItem[] = [
  {
    id: 'post_headlines',
    spotifyId: '2FY7MXti3Mu8Zt597qSz2i',
    title: 'Headlines',
    artist: 'Drake',
    albumName: 'Take Care',
    imageUrl:
      'https://image-cdn-fa.spotifycdn.com/image/ab67616d0000b27326f7f19c7f0381e56156c94a',
    duration_ms: 236000,
    explicit: true,
  },
  {
    id: 'post_die_trying',
    spotifyId: '3ZffCQKLFLUvOCuVsxc364',
    title: 'DIE TRYING',
    artist: 'PARTYNEXTDOOR, Drake, Yebba',
    albumName: 'PARTYMOBILE',
    imageUrl:
      'https://image-cdn-fa.spotifycdn.com/image/ab67616d0000b2738278b782c429712cf757e754',
    duration_ms: 204000,
    explicit: true,
  },
  {
    id: 'post_jungle',
    spotifyId: '1i4ZHCpdAH2iPgq8YQx0lU',
    title: 'Jungle',
    artist: 'Drake',
    albumName: 'If You’re Reading This It’s Too Late',
    imageUrl:
      'https://image-cdn-fa.spotifycdn.com/image/ab67616d0000b2735a0d43a4a2f61c0b347a3f21',
    duration_ms: 205000,
    explicit: false,
  },
];

const PARTY_TRACKS: PlayerTrack[] = [
  {
    spotifyId: '76h9hV2L9L8f5gZ7J99g5a',
    title: 'Show Me You Do',
    artistName: 'Alicia Keys',
    albumName: 'Listening Party',
    imageURL:
      'https://image-cdn-fa.spotifycdn.com/image/ab67616d0000b27376a91eb0625902047ff6535d',
    duration_ms: 242000,
  },
  {
    spotifyId: '1A7ODrG8Zg38f1Aee0wZ11',
    title: 'Canned Heat',
    artistName: 'Jamiroquai',
    albumName: 'Listening Party',
    imageURL:
      'https://image-cdn-fa.spotifycdn.com/image/ab67616d0000b27341ea22e92c68e146eb4a7812',
    duration_ms: 330000,
  },
  {
    spotifyId: '6dOtVTDmmpzgGQ9qd0RMiZ',
    title: 'BIRDS OF A FEATHER',
    artistName: 'Billie Eilish',
    albumName: 'Listening Party',
    imageURL:
      'https://image-cdn-fa.spotifycdn.com/image/ab67616d0000b27371d62ea7ea8a5be92d3c1f62',
    duration_ms: 194000,
  },
];

const LYRIC_TRACK: PlayerTrack = {
  spotifyId: '4RVwu0g32PAqgUiJoXsdF8',
  title: 'Happier Than Ever',
  artistName: 'Billie Eilish',
  albumName: 'Happier Than Ever',
  imageURL:
    'https://image-cdn-fa.spotifycdn.com/image/ab67616d0000b27371d62ea7ea8a5be92d3c1f62',
  duration_ms: 298000,
};

const MUSIC_AUTHOR: PostAuthor = {
  name: 'sdymoondesign',
  avatarUrl:
    'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=160&auto=format&fit=crop&q=80',
  listeningTo: 'Too Late · The Weeknd',
};

const PARTY_AUTHOR: PostAuthor = {
  name: 'she2real',
  avatarUrl:
    'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=160&auto=format&fit=crop&q=80',
};

const LYRIC_AUTHOR: PostAuthor = {
  name: 'mariaduda',
  avatarUrl:
    'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=160&auto=format&fit=crop&q=80',
  listeningTo: 'Happier Than Ever · Billie Eilish',
};

const PARTY_AVATARS = [
  'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=80&auto=format&fit=crop&q=80',
  'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=80&auto=format&fit=crop&q=80',
  'https://images.unsplash.com/photo-1506794778202-cad84cf45f1d?w=80&auto=format&fit=crop&q=80',
];

const getActiveLyricIndex = (
  segments: NoteLyricSegment[],
  positionMs: number
) => {
  const activeIndex = segments.findIndex(
    (segment) =>
      positionMs >= segment.startTimeMs && positionMs < segment.endTimeMs
  );
  if (activeIndex >= 0) return activeIndex;
  return positionMs >= segments[segments.length - 1]?.endTimeMs
    ? segments.length - 1
    : 0;
};

const PostHeader = ({
  author,
  children,
}: {
  author: PostAuthor;
  children?: React.ReactNode;
}) => (
  <View style={styles.postHeader}>
    <Image source={{ uri: author.avatarUrl }} style={styles.authorAvatar} />
    <View style={styles.authorCopy}>
      <Text style={styles.authorName}>{author.name}</Text>
      <View style={styles.authorStatus}>
        {author.listeningTo ? (
          <>
            <Ionicons name="musical-note" size={13} color="#E6E6E6" />
            <Text style={styles.authorListening} numberOfLines={1}>
              {author.listeningTo}
            </Text>
          </>
        ) : (
          children
        )}
      </View>
    </View>
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Mais opções de ${author.name}`}
      hitSlop={8}
      style={styles.moreButton}
    >
      <Ionicons name="ellipsis-horizontal" size={20} color="#86868B" />
    </Pressable>
  </View>
);

const PostActions = ({ initialLikes }: { initialLikes: number }) => {
  const [liked, setLiked] = React.useState(false);
  const [saved, setSaved] = React.useState(false);

  return (
    <View style={styles.postActions}>
      <View style={styles.actionGroup}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={liked ? 'Remover curtida' : 'Curtir post'}
          onPress={() => setLiked((value) => !value)}
          style={styles.actionButton}
        >
          <Ionicons
            name={liked ? 'heart' : 'heart-outline'}
            size={23}
            color={liked ? '#1DB954' : '#A3A3A3'}
          />
          <Text style={[styles.actionCount, liked && styles.actionCountActive]}>
            {initialLikes + Number(liked)}
          </Text>
        </Pressable>
        <View style={styles.actionButton} accessibilityLabel="44 comentários">
          <Ionicons name="chatbubble-outline" size={21} color="#A3A3A3" />
          <Text style={styles.actionCount}>44</Text>
        </View>
        <View style={styles.actionButton} accessibilityLabel="3 compartilhamentos">
          <Ionicons name="paper-plane-outline" size={21} color="#A3A3A3" />
          <Text style={styles.actionCount}>3</Text>
        </View>
      </View>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={saved ? 'Remover dos salvos' : 'Salvar post'}
        onPress={() => setSaved((value) => !value)}
        hitSlop={8}
      >
        <Ionicons
          name={saved ? 'bookmark' : 'bookmark-outline'}
          size={23}
          color={saved ? '#FFFFFF' : '#A3A3A3'}
        />
      </Pressable>
    </View>
  );
};

const MusicShelfPost = () => {
  return (
    <View style={styles.post}>
      <PostHeader author={MUSIC_AUTHOR} />
      <Text style={styles.postTitle}>Minhas faixas favoritas do Drake</Text>
      <View style={styles.postCards}>
        <CompactMusicCards tracks={DRAKE_TRACKS} />
      </View>
      <PostActions initialLikes={161} />
    </View>
  );
};

const PostLyrics = ({ track }: { track: PlayerTrack }) => {
  const {
    currentTrack,
    lyricsData,
    playerState,
    seekToPosition,
  } = usePlayer();
  const isCurrentTrack = currentTrack?.spotifyId === track.spotifyId;
  const lyricSegments =
    isCurrentTrack && lyricsData?.isSynced ? lyricsData.segments : [];

  if (!isCurrentTrack || !playerState.isPlaying) return null;

  if (lyricSegments.length === 0) {
    return (
      <View style={styles.postLyricsLoading}>
        <Text style={styles.postLyricsLoadingText}>Sincronizando letra…</Text>
      </View>
    );
  }

  return (
    <View style={styles.postLyrics}>
      <Text style={styles.postLyricsTrack} numberOfLines={1}>
        Tocando: {track.title}
      </Text>
      <NoteLyricBlocks
        segments={lyricSegments}
        activeIndex={getActiveLyricIndex(
          lyricSegments,
          playerState.positionMs
        )}
        onSeek={(positionMs) => void seekToPosition(positionMs)}
        style={styles.lyricBlocks}
      />
    </View>
  );
};

const ListeningPartyPost = () => {
  const { currentTrack, playerState, playWithQueue, togglePlayPause } = usePlayer();
  const [joined, setJoined] = React.useState(false);
  const partyHasCurrentTrack = PARTY_TRACKS.some(
    (track) => track.spotifyId === currentTrack?.spotifyId
  );
  const partyIsPlaying = partyHasCurrentTrack && playerState.isPlaying;

  const handleJoin = () => {
    setJoined(true);
    if (partyHasCurrentTrack) {
      void togglePlayPause();
      return;
    }
    void playWithQueue(PARTY_TRACKS);
  };

  return (
    <View style={styles.post}>
      <PostHeader author={PARTY_AUTHOR}>
        <Text style={styles.partyStatus}>Listening party</Text>
        <View style={styles.participantStack}>
          {PARTY_AVATARS.map((avatarUrl, index) => (
            <Image
              key={avatarUrl}
              source={{ uri: avatarUrl }}
              style={[styles.participantAvatar, { marginLeft: index ? -7 : 0 }]}
            />
          ))}
        </View>
        <Text style={styles.participantCount}>+346</Text>
      </PostHeader>

      <View style={styles.partyCard}>
        <LinearGradient
          colors={['#183328', '#0B1712', '#101111']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.partyGradient}
        >
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={
              partyHasCurrentTrack
                ? partyIsPlaying
                  ? 'Pausar listening party'
                  : 'Retomar listening party'
                : 'Entrar na listening party'
            }
            onPress={handleJoin}
            style={styles.partySummaryRow}
          >
            <View style={styles.partyCovers}>
              {PARTY_TRACKS.map((track, index) => (
                <Image
                  key={track.spotifyId}
                  source={{ uri: track.imageURL }}
                  style={[styles.partyCover, { marginLeft: index ? -16 : 0 }]}
                />
              ))}
            </View>
            <View style={styles.partyCopy}>
              <Text style={styles.partyEyebrow}>
                {partyIsPlaying ? 'TOCANDO AGORA' : 'PLAYLIST COMPARTILHADA'}
              </Text>
              <Text style={styles.partyTitle}>Junta com a gente</Text>
              <Text style={styles.partySubtitle} numberOfLines={1}>
                {joined
                  ? 'Você está ouvindo junto'
                  : 'Mesmo momento, mesma playlist'}
              </Text>
            </View>
            <View style={styles.partyJoinButton}>
              <Ionicons
                name={partyIsPlaying ? 'pause' : 'play'}
                size={20}
                color="#000000"
              />
            </View>
          </Pressable>
          {partyIsPlaying && currentTrack ? <PostLyrics track={currentTrack} /> : null}
        </LinearGradient>
      </View>
      <PostActions initialLikes={92} />
    </View>
  );
};

const LyricPost = () => {
  const { currentTrack, playerState, playTrack, togglePlayPause } = usePlayer();
  const isCurrentTrack = currentTrack?.spotifyId === LYRIC_TRACK.spotifyId;
  const isPlaying = isCurrentTrack && playerState.isPlaying;

  const handlePlay = () => {
    if (isCurrentTrack) {
      void togglePlayPause();
      return;
    }
    void playTrack(LYRIC_TRACK);
  };

  return (
    <View style={styles.post}>
      <PostHeader author={LYRIC_AUTHOR} />
      <Text style={styles.postTitle}>Essa parte sempre me pega.</Text>
      <View style={[styles.lyricCard, isPlaying && styles.lyricCardExpanded]}>
        <Image
          source={{ uri: LYRIC_TRACK.imageURL }}
          style={styles.lyricArtworkBackground}
          blurRadius={22}
        />
        <LinearGradient
          colors={['rgba(8, 17, 18, 0.48)', 'rgba(4, 12, 13, 0.93)']}
          style={[styles.lyricGradient, isPlaying && styles.lyricGradientExpanded]}
        >
          <View style={styles.lyricTrackRow}>
            <Image source={{ uri: LYRIC_TRACK.imageURL }} style={styles.lyricCover} />
            <View style={styles.lyricTrackCopy}>
              <Text style={styles.lyricTrackTitle} numberOfLines={1}>
                {LYRIC_TRACK.title}
              </Text>
              <Text style={styles.lyricTrackArtist} numberOfLines={1}>
                {LYRIC_TRACK.artistName}
              </Text>
            </View>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={isPlaying ? 'Pausar música' : 'Tocar música'}
              onPress={handlePlay}
              style={styles.lyricPlayButton}
            >
              <Ionicons
                name={isPlaying ? 'pause' : 'play'}
                size={17}
                color="#000000"
                style={!isPlaying ? styles.playIconOffset : undefined}
              />
            </Pressable>
          </View>
          {isPlaying ? <PostLyrics track={LYRIC_TRACK} /> : null}
        </LinearGradient>
      </View>
      <PostActions initialLikes={238} />
    </View>
  );
};

export const ListeningFeed = () => (
  <View style={styles.feed}>
    <MusicShelfPost />
    <ListeningPartyPost />
    <LyricPost />
  </View>
);

const styles = StyleSheet.create({
  feed: {
    marginTop: 8,
  },
  post: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#29292C',
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 12,
  },
  postHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 42,
  },
  authorAvatar: {
    width: 42,
    height: 42,
    borderRadius: 21,
    borderWidth: 2,
    borderColor: '#D78036',
  },
  authorCopy: {
    flex: 1,
    marginLeft: 10,
    overflow: 'hidden',
  },
  authorName: {
    color: '#F4F4F5',
    fontSize: 15,
    fontFamily: 'SF-Bold',
    fontWeight: '700',
  },
  authorStatus: {
    minHeight: 17,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    overflow: 'hidden',
  },
  authorListening: {
    flex: 1,
    color: '#8E8E93',
    fontSize: 12.5,
    fontFamily: 'SF-Regular',
  },
  moreButton: {
    padding: 4,
    marginLeft: 8,
  },
  postTitle: {
    color: '#E4E4E7',
    fontSize: 15,
    lineHeight: 20,
    fontFamily: 'SF-Regular',
    marginTop: 12,
    marginBottom: 10,
  },
  postCards: {
    marginHorizontal: -16,
  },
  playIconOffset: {
    marginLeft: 2,
  },
  postActions: {
    minHeight: 48,
    marginTop: 8,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  actionGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 18,
  },
  actionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  actionCount: {
    color: '#A3A3A3',
    fontSize: 13,
    fontFamily: 'SF-Regular',
  },
  actionCountActive: {
    color: '#1DB954',
  },
  partyStatus: {
    color: '#1DB954',
    fontSize: 12.5,
    fontFamily: 'SF-Bold',
    fontWeight: '700',
  },
  participantStack: {
    flexDirection: 'row',
    marginLeft: 3,
  },
  participantAvatar: {
    width: 18,
    height: 18,
    borderRadius: 9,
    borderWidth: 1.5,
    borderColor: '#121212',
  },
  participantCount: {
    color: '#A3A3A3',
    fontSize: 12,
    fontFamily: 'SF-Regular',
  },
  partyCard: {
    marginTop: 12,
    borderRadius: 14,
    overflow: 'hidden',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.15)',
  },
  partyGradient: {
    minHeight: 110,
    padding: 14,
  },
  partySummaryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 82,
  },
  partyCovers: {
    flexDirection: 'row',
    width: 88,
  },
  partyCover: {
    width: 42,
    height: 58,
    borderRadius: 6,
    borderWidth: 1.5,
    borderColor: '#112117',
  },
  partyCopy: {
    flex: 1,
    marginLeft: 8,
  },
  partyEyebrow: {
    color: '#66D98B',
    fontSize: 9.5,
    fontFamily: 'SF-Bold',
    fontWeight: '700',
    letterSpacing: 0.8,
  },
  partyTitle: {
    color: '#FFFFFF',
    fontSize: 17,
    fontFamily: 'SF-Bold',
    fontWeight: '800',
    marginTop: 3,
  },
  partySubtitle: {
    color: 'rgba(255,255,255,0.6)',
    fontSize: 12,
    fontFamily: 'SF-Regular',
    marginTop: 2,
  },
  partyJoinButton: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  postLyrics: {
    minHeight: 158,
    marginTop: 8,
    paddingTop: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'rgba(255,255,255,0.12)',
  },
  postLyricsTrack: {
    color: 'rgba(255,255,255,0.58)',
    fontSize: 11,
    fontFamily: 'SF-Semibold',
    textAlign: 'center',
  },
  postLyricsLoading: {
    minHeight: 96,
    alignItems: 'center',
    justifyContent: 'center',
  },
  postLyricsLoadingText: {
    color: 'rgba(255,255,255,0.56)',
    fontSize: 13,
    fontFamily: 'SF-Semibold',
  },
  lyricCard: {
    borderRadius: 14,
    overflow: 'hidden',
    backgroundColor: '#071617',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.12)',
  },
  lyricCardExpanded: {
    minHeight: 250,
  },
  lyricArtworkBackground: {
    ...StyleSheet.absoluteFill,
    opacity: 0.58,
    transform: [{ scale: 1.2 }],
  },
  lyricGradient: {
    flex: 1,
    padding: 14,
  },
  lyricGradientExpanded: {
    minHeight: 250,
    justifyContent: 'space-between',
  },
  lyricTrackRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  lyricCover: {
    width: 46,
    height: 46,
    borderRadius: 7,
  },
  lyricTrackCopy: {
    flex: 1,
    marginLeft: 10,
  },
  lyricTrackTitle: {
    color: '#FFFFFF',
    fontSize: 14,
    fontFamily: 'SF-Bold',
    fontWeight: '700',
  },
  lyricTrackArtist: {
    color: 'rgba(255,255,255,0.65)',
    fontSize: 12,
    fontFamily: 'SF-Regular',
    marginTop: 2,
  },
  lyricPlayButton: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  lyricBlocks: {
    minHeight: 148,
    paddingVertical: 12,
  },
});
