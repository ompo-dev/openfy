import * as React from 'react';
import { createAudioPlayer, setAudioModeAsync } from 'expo-audio';
import { AppState } from 'react-native';
import type { AudioPlayer } from 'expo-audio/build/AudioModule.types';
import { renderMixAudio } from '../../services/mix/mixAudio';
import type { MixProject } from '../../services/mix/mixTimeline';
import { usePlayerStore } from '../../stores/usePlayerStore';
import { log } from '../../utils/appLogger';

export function useMixPreview() {
  const player = React.useRef<AudioPlayer | null>(null);
  const cleanup = React.useRef<(() => void) | null>(null);
  const generation = React.useRef(0);
  const [playing, setPlaying] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [position, setPosition] = React.useState(0);
  const [error, setError] = React.useState('');
  const stop = React.useCallback(() => {
    generation.current++;
    cleanup.current?.(); cleanup.current = null;
    player.current?.remove(); player.current = null;
    setPlaying(false); setBusy(false);
  }, []);
  React.useEffect(() => () => { generation.current++; cleanup.current?.(); player.current?.remove(); }, []);
  React.useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => { if (state !== 'active') stop(); });
    return () => subscription.remove();
  }, [stop]);
  const play = async (project: MixProject, startMs: number) => {
    stop(); setError(''); setBusy(true);
    const request = generation.current;
    try {
      const output = await renderMixAudio(project);
      if (request !== generation.current) return;
      const main = usePlayerStore.getState();
      if (main.playerState.isPlaying) await main.togglePlayPause('mix-preview');
      await setAudioModeAsync({ allowsRecording: false, playsInSilentMode: true, shouldPlayInBackground: true, interruptionMode: 'doNotMix' });
      if (request !== generation.current) return;
      const audio = createAudioPlayer({ uri: output.uri }, { updateInterval: 50 });
      player.current = audio;
      let started = false;
      let timer: ReturnType<typeof setTimeout> | undefined;
      const fail = (reason: unknown) => {
        if (request !== generation.current) return;
        stop(); setError(reason instanceof Error ? reason.message : 'Não foi possível tocar o mix.');
        log.error('mix preview failed', { mixId: project.id, error: reason });
      };
      const start = async () => {
        if (started || request !== generation.current) return;
        started = true;
        try {
          await audio.seekTo(Math.max(0, Math.min(startMs, output.durationMs - 1)) / 1000, 0, 0);
          if (request !== generation.current) return;
          clearTimeout(timer); audio.play(); setPlaying(true); setBusy(false);
        } catch (reason) { fail(reason); }
      };
      const subscription = audio.addListener('playbackStatusUpdate', (status) => {
        if (request !== generation.current) return;
        if (status.isLoaded) void start();
        setPosition(status.currentTime * 1000);
        if (started) setPlaying(status.playing);
        if (status.didJustFinish) { setPlaying(false); setBusy(false); }
      });
      timer = setTimeout(() => fail(new Error('O áudio demorou para abrir. Tente novamente.')), 15000);
      cleanup.current = () => { clearTimeout(timer); subscription.remove(); };
      if (audio.isLoaded) void start();
    } catch (reason) {
      if (request === generation.current) { stop(); setError(reason instanceof Error ? reason.message : 'Não foi possível tocar o mix.'); }
    }
  };
  return { play, stop, playing, busy, position, error, setPosition };
}
