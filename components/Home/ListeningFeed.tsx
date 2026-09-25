/**
 * ListeningFeed — shared listening posts shown below music notes.
 */

import * as React from 'react';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';

import {
  useLibrarySelectedCategory,
  usePlayer,
  type PlayerTrack,
} from '@context';
import { recordInteraction, upsertCatalogTracks } from '@services';
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

const compactToPlayerTrack = (track: CompactTrackItem): PlayerTrack => ({
  spotifyId: track.spotifyId,
  title: track.title,
  artistName: track.artist,
  albumName: track.albumName || 'Single',
  imageURL: track.localImagePath || track.imageUrl,
  duration_ms: track.duration_ms,
  streamUrl: track.streamUrl,
  streamExpiresAt: track.streamExpiresAt,
  artists: track.artists,
  albumId: track.albumId,
  albumArtists: track.albumArtists,
  youtubeVideoId: track.youtubeVideoId,
  youtubeUrl: track.youtubeUrl,
  localAudioPath: track.localAudioPath,
  localImagePath: track.localImagePath,
});

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
    <View accessibilityLabel="Recomendação personalizada" style={styles.moreButton}>
      <Ionicons name="sparkles" size={18} color="#86868B" />
    </View>
  </View>
);

const PostActions = ({ track }: { track: PlayerTrack }) => {
  const { addToQueue } = usePlayer();
  const { refreshLibrary } = useLibrarySelectedCategory();
  const [liked, setLiked] = React.useState(false);
  const [saved, setSaved] = React.useState(false);

  const toggleLike = () => {
    setLiked((value) => {
      if (!value) void recordInteraction(track, 'like');
      return !value;
    });
  };

  const save = async () => {
    if (saved) return;
    await upsertCatalogTracks([{
      spotifyId: track.spotifyId,
      title: track.title,
      artistName: track.artistName,
      albumName: track.albumName,
      imageURL: track.imageURL,
      duration_ms: track.duration_ms,
      artists: track.artists,
      albumId: track.albumId,
      albumArtists: track.albumArtists,
      youtubeVideoId: track.youtubeVideoId,
      youtubeUrl: track.youtubeUrl,
    }]);
    setSaved(true);
    refreshLibrary();
  };

  return (
    <View style={styles.postActions}>
      <View style={styles.actionGroup}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={liked ? 'Remover curtida' : 'Curtir post'}
          onPress={toggleLike}
          style={styles.actionButton}
        >
          <Ionicons
            name={liked ? 'heart' : 'heart-outline'}
            size={23}
            color={liked ? '#1DB954' : '#A3A3A3'}
          />
          <Text style={[styles.actionCount, liked && styles.actionCountActive]}>Gostei</Text>
        </Pressable>
        <Pressable
          style={styles.actionButton}
          accessibilityLabel="Adicionar à fila"
          accessibilityRole="button"
          onPress={() => addToQueue([track])}
        >
          <Ionicons name="list" size={21} color="#A3A3A3" />
          <Text style={styles.actionCount}>Fila</Text>
        </Pressable>
      </View>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={saved ? 'Música salva' : 'Salvar na biblioteca'}
        disabled={saved}
        onPress={() => void save()}
        hitSlop={8}
      >
        <Ionicons
          name={saved ? 'checkmark-circle' : 'add-circle-outline'}
          size={23}
          color={saved ? '#1DB954' : '#A3A3A3'}
        />
      </Pressable>
    </View>
  );
};

const MusicShelfPost = ({
  author,
  title,
  tracks,
}: {
  author: PostAuthor;
  title: string;
  tracks: CompactTrackItem[];
}) => {
  if (!tracks.length) return null;
  return (
    <View style={styles.post}>
      <PostHeader author={author} />
      <Text style={styles.postTitle}>{title}</Text>
      <View style={styles.postCards}>
        <CompactMusicCards tracks={tracks} />
      </View>
      <PostActions track={compactToPlayerTrack(tracks[0])} />
    </View>
  );
};

const PostLyrics = ({ track }: { track: PlayerTrack }) => {
  const { currentTrack, lyricsData, playerState, seekToPosition } = usePlayer();
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
      <NoteLyricBlocks
        segments={lyricSegments}
        activeIndex={getActiveLyricIndex(lyricSegments, playerState.positionMs)}
        onSeek={(positionMs) => void seekToPosition(positionMs)}
        style={styles.lyricBlocks}
      />
    </View>
  );
};

const ListeningPartyPost = ({
  author,
  tracks,
}: {
  author: PostAuthor;
  tracks: PlayerTrack[];
}) => {
  const { currentTrack, playerState, playWithQueue, togglePlayPause } =
    usePlayer();
  if (!tracks.length) return null;
  const partyHasCurrentTrack = tracks.some(
    (track) => track.spotifyId === currentTrack?.spotifyId
  );
  const partyIsPlaying = partyHasCurrentTrack && playerState.isPlaying;

  const handleJoin = () => {
    if (partyHasCurrentTrack) {
      void togglePlayPause();
      return;
    }
    void playWithQueue(tracks);
  };

  return (
    <View style={styles.post}>
      <PostHeader author={author}>
        <Text style={styles.partyStatus}>Fila automática</Text>
        <View style={styles.participantStack}>
          {tracks.slice(0, 3).map((track, index) => (
            <Image
              key={track.spotifyId}
              source={{ uri: track.imageURL }}
              style={[styles.participantAvatar, { marginLeft: index ? -7 : 0 }]}
            />
          ))}
        </View>
        <Text style={styles.participantCount}>{tracks.length}</Text>
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
              {tracks.map((track, index) => (
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
              <Text style={styles.partyTitle}>Sua próxima seleção</Text>
              <Text style={styles.partySubtitle} numberOfLines={1}>
                {partyIsPlaying
                  ? 'Reproduzindo a fila personalizada'
                  : 'Preparada com base na sua biblioteca'}
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
          {partyIsPlaying && currentTrack ? (
            <PostLyrics track={currentTrack} />
          ) : null}
        </LinearGradient>
      </View>
      <PostActions track={tracks[0]} />
    </View>
  );
};

const LyricPost = ({ author, track }: { author: PostAuthor; track: PlayerTrack }) => {
  const { currentTrack, playerState, playTrack, togglePlayPause } = usePlayer();
  const isCurrentTrack = currentTrack?.spotifyId === track.spotifyId;
  const isPlaying = isCurrentTrack && playerState.isPlaying;

  const handlePlay = () => {
    if (isCurrentTrack) {
      void togglePlayPause();
      return;
    }
    void playTrack(track);
  };

  return (
    <View style={styles.post}>
      <PostHeader author={author} />
      <Text style={styles.postTitle}>Uma faixa para redescobrir.</Text>
      <View style={[styles.lyricCard, isPlaying && styles.lyricCardExpanded]}>
        <Image
          source={{ uri: track.imageURL }}
          style={styles.lyricArtworkBackground}
          blurRadius={22}
        />
        <LinearGradient
          colors={['rgba(8, 17, 18, 0.48)', 'rgba(4, 12, 13, 0.93)']}
          style={[
            styles.lyricGradient,
            isPlaying && styles.lyricGradientExpanded,
          ]}
        >
          <View style={styles.lyricTrackRow}>
            <Image
              source={{ uri: track.imageURL }}
              style={styles.lyricCover}
            />
            <View style={styles.lyricTrackCopy}>
              <Text style={styles.lyricTrackTitle} numberOfLines={1}>
                {track.title}
              </Text>
              <Text style={styles.lyricTrackArtist} numberOfLines={1}>
                {track.artistName}
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
          {isPlaying ? <PostLyrics track={track} /> : null}
        </LinearGradient>
      </View>
      <PostActions track={track} />
    </View>
  );
};

export const ListeningFeed = ({
  lyricTrack,
  queueTracks,
  shelfTitle,
  shelfTracks,
}: {
  lyricTrack?: PlayerTrack;
  queueTracks: PlayerTrack[];
  shelfTitle: string;
  shelfTracks: CompactTrackItem[];
}) => {
  const lead = shelfTracks[0];
  const queueLead = queueTracks[0];
  if (!lead && !queueLead && !lyricTrack) return null;

  const musicAuthor: PostAuthor | null = lead ? {
    name: 'Openfy Mix',
    avatarUrl: lead.imageUrl,
    listeningTo: `Baseado em ${lead.artist}`,
  } : null;
  const queueAuthor: PostAuthor | null = queueLead ? {
    name: 'Sua biblioteca',
    avatarUrl: queueLead.imageURL,
  } : null;
  const lyricAuthor: PostAuthor | null = lyricTrack ? {
    name: lyricTrack.artistName,
    avatarUrl: lyricTrack.imageURL,
    listeningTo: `${lyricTrack.title} · ${lyricTrack.artistName}`,
  } : null;

  return (
    <View style={styles.feed}>
      {musicAuthor ? (
        <MusicShelfPost author={musicAuthor} title={shelfTitle} tracks={shelfTracks} />
      ) : null}
      {queueAuthor ? (
        <ListeningPartyPost author={queueAuthor} tracks={queueTracks} />
      ) : null}
      {lyricAuthor && lyricTrack ? (
        <LyricPost author={lyricAuthor} track={lyricTrack} />
      ) : null}
    </View>
  );
};

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
