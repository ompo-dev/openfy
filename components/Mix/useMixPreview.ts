import * as React from 'react';
import { createAudioPlayer, setAudioModeAsync } from 'expo-audio';
import { AppState } from 'react-native';
import type { AudioPlayer } from 'expo-audio/build/AudioModule.types';
import { getDownloadedTracks } from '../../services/download/downloadManager';
import { getExistingLocalAudioPath } from '../../services/download/localAudioPaths';
import { mixTimeline, type MixProject } from '../../services/mix/mixTimeline';
import { gainEnvelope, envelopeGain } from '../../services/mix/mixEffects';
import { pause } from '../../services/audio/playerService';
import { log } from '../../utils/appLogger';

type Entry = ReturnType<typeof mixTimeline>[number];
type Voice = { audio: AudioPlayer; dispose: () => void; ready: boolean; started: boolean; preparing: boolean; seekAt: number };
const LOOKAHEAD_MS = 1500;
const TICK_MS = 40;

export function useMixPreview() {
  const voices = React.useRef(new Map<string, Voice>());
  const timer = React.useRef<ReturnType<typeof setInterval> | undefined>(undefined);
  const generation = React.useRef(0);
  const requested = React.useRef(false);
  const [playing, setPlaying] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [position, setPosition] = React.useState(0);
  const [error, setError] = React.useState('');
  const disposeVoice = React.useCallback((id: string) => {
    const voice = voices.current.get(id);
    if (!voice) return;
    voices.current.delete(id);
    try { voice.dispose(); } catch { /* Native listener already released. */ }
    try { voice.audio.pause(); } catch (error) { log.error('mix preview pause failed', { error }); }
    try { voice.audio.remove(); } catch (error) { log.error('mix preview release failed', { error }); }
  }, []);
  const release = React.useCallback(() => {
    generation.current++; requested.current = false;
    clearInterval(timer.current); timer.current = undefined;
    for (const id of voices.current.keys()) disposeVoice(id);
  }, [disposeVoice]);
  const stop = React.useCallback(() => { release(); setPlaying(false); setBusy(false); }, [release]);
  React.useEffect(() => release, [release]);
  React.useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => { if (state !== 'active') stop(); });
    return () => subscription.remove();
  }, [stop]);
  const play = async (project: MixProject, startMs: number, selectedId?: string) => {
    stop(); setError(''); setBusy(true); requested.current = true;
    const request = generation.current;
    const entries = mixTimeline(project.clips).filter((clip) => !selectedId || clip.id === selectedId);
    const active = () => request === generation.current;
    const fail = (reason: unknown) => {
      if (!active()) return;
      stop(); setError(reason instanceof Error ? reason.message : 'Não foi possível tocar o mix.');
      log.error('mix live preview failed', { mixId: project.id, error: reason });
    };
    try {
      if (!entries.length) throw new Error('Adicione músicas ao mix.');
      const total = Math.max(...entries.map((clip) => clip.endMs));
      const initial = Math.max(selectedId ? entries[0].startMs : 0, startMs < total ? startMs : (selectedId ? entries[0].startMs : 0));
      const downloaded = new Map((await getDownloadedTracks()).map((track) => [track.spotifyId, track.localAudioPath]));
      if (!active()) return;
      const paths = new Map<string, string>();
      const getPath = async (clip: Entry) => {
        const cached = paths.get(clip.trackId);
        if (cached) return cached;
        const local = await getExistingLocalAudioPath(downloaded.get(clip.trackId), 0);
        if (!local) throw new Error('Baixe todas as músicas do mix antes de reproduzir.');
        paths.set(clip.trackId, local); return local;
      };
      // Resolve only immediately needed files before playing; future clips are opened ahead of time.
      const first = entries.filter((clip) => clip.endMs > initial && clip.startMs <= initial);
      await Promise.all(first.map(getPath));
      if (!active()) return;
      await pause('mix-preview');
      if (!active()) return;
      await setAudioModeAsync({ allowsRecording: false, playsInSilentMode: true, shouldPlayInBackground: true, interruptionMode: 'doNotMix' });
      if (!active()) return;
      const laneCount = new Set(entries.map((clip) => clip.lane)).size;
      const envelopes = new Map(entries.map((clip) => [clip.id, gainEnvelope(clip, entries)]));
      let startedAt: number | null = null;
      const opening = new Set<string>();
      let lastSoloPosition = initial;
      const nowPosition = () => {
        if (startedAt === null) return initial;
        const solo = selectedId ? voices.current.get(selectedId) : undefined;
        // Beat markers should follow the decoded audio clock, not wall time.
        if (solo?.started && Number.isFinite(solo.audio.currentTime)) {
          const entry = entries[0];
          const actual = entry.startMs + solo.audio.currentTime * 1000 - entry.sourceStartMs;
          lastSoloPosition = Math.min(total, Math.max(lastSoloPosition, actual));
          return lastSoloPosition;
        }
        return Math.min(total, initial + Date.now() - startedAt);
      };
      const startupAt = Date.now();
      const seekVoice = async (clip: Entry, voice: Voice, ms: number) => {
        if (voice.preparing || voice.ready) return;
        voice.preparing = true;
        try {
          await voice.audio.seekTo((clip.sourceStartMs + Math.max(0, ms - clip.startMs)) / 1000, 0, 0);
          if (active() && voices.current.get(clip.id) === voice) { voice.ready = true; voice.seekAt = Math.max(clip.startMs, ms); }
        } catch (reason) { fail(reason); }
        finally { voice.preparing = false; }
      };
      const open = async (clip: Entry) => {
        if (opening.has(clip.id) || voices.current.has(clip.id)) return;
        opening.add(clip.id);
        try {
          const uri = await getPath(clip);
          if (!active() || nowPosition() >= clip.endMs) return;
          const audio = createAudioPlayer({ uri }, { updateInterval: TICK_MS });
          audio.volume = envelopeGain(envelopes.get(clip.id)!, Math.max(0, nowPosition() - clip.startMs)) / laneCount;
          const voice: Voice = { audio, dispose: () => {}, ready: false, started: false, preparing: false, seekAt: clip.startMs };
          voices.current.set(clip.id, voice);
          const subscription = audio.addListener('playbackStatusUpdate', (status) => {
            if (!active() || voices.current.get(clip.id) !== voice) return;
            if (status.isLoaded) void seekVoice(clip, voice, nowPosition());
            if (status.didJustFinish && selectedId && voice.started) { setPosition(clip.endMs); stop(); }
          });
          voice.dispose = () => subscription.remove();
          if (audio.isLoaded) await seekVoice(clip, voice, nowPosition());
        } catch (reason) { fail(reason); }
        finally { opening.delete(clip.id); }
      };
      const tick = () => {
        if (!active()) return;
        const ms = nowPosition();
        if (ms >= total) { setPosition(total); stop(); return; }
        const current = entries.filter((clip) => clip.startMs <= ms && clip.endMs > ms);
        const nextByLane = new Map<number, Entry>();
        for (const clip of entries) {
          if (clip.startMs <= ms || clip.startMs > ms + LOOKAHEAD_MS) continue;
          const next = nextByLane.get(clip.lane);
          if (!next || clip.startMs < next.startMs) nextByLane.set(clip.lane, clip);
        }
        const upcoming = [...current, ...nextByLane.values()];
        for (const [id] of voices.current) if (!upcoming.some((clip) => clip.id === id)) disposeVoice(id);
        for (const clip of upcoming) if (!voices.current.has(clip.id)) void open(clip);
        if (startedAt === null) {
          if (current.some((clip) => !voices.current.get(clip.id)?.ready)) {
            if (Date.now() - startupAt > 15000) fail(new Error('O áudio demorou para abrir. Tente novamente.'));
            return;
          }
          startedAt = Date.now(); setPlaying(true); setBusy(false);
        }
        for (const clip of current) {
          const voice = voices.current.get(clip.id);
          if (voice) voice.audio.volume = envelopeGain(envelopes.get(clip.id)!, ms - clip.startMs) / laneCount;
          if (voice?.ready && !voice.started) {
            if (ms - voice.seekAt > 100) {
              voice.ready = false;
              void seekVoice(clip, voice, ms);
              continue;
            }
            voice.started = true;
            try { voice.audio.play(); } catch (reason) { fail(reason); return; }
          }
        }
        setPosition(ms);
      };
      // Start as soon as the current files are ready, not after exporting the entire mix.
      const initialOpens = first.map(open);
      timer.current = setInterval(tick, TICK_MS);
      void Promise.all(initialOpens).then(tick);
      tick();
    } catch (reason) { fail(reason); }
  };
  const toggle = (project: MixProject, startMs: number, selectedId?: string) => {
    if (requested.current) { stop(); return; }
    return play(project, startMs, selectedId);
  };
  return { play, toggle, stop, playing, busy, position, error, setPosition };
}
