import * as React from 'react';
import * as Clipboard from 'expo-clipboard';
import {
  Alert,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { LyricSegment } from '../../services/lyrics/lyricsService';
import { MusicTimelineSelector } from '../Home/FriendActivityStatus/MusicTimelineSelector';
import { MusicWaveformReel } from '../Home/FriendActivityStatus/MusicWaveformReel';

type LyricSyncEditorProps = {
  selectedRange: { startTimeMs: number; endTimeMs: number } | null;
  totalDurationMs: number;
  currentPositionMs: number;
  onMove: (deltaMs: number) => number;
  onResizeStart: (deltaMs: number) => number;
  onResizeEnd: (deltaMs: number) => number;
  onScrubStart: () => void;
  onScrubEnd: (positionMs?: number) => void;
  isPlaying: boolean;
  onTogglePlayPause: () => void;
  waveformSeed: string;
  segments: LyricSegment[];
  onApplySegments: (segments: LyricSegment[]) => void;
};

const WAVEFORM_WINDOW_MS = 30000;

const formatEditorJson = (segments: LyricSegment[]) =>
  JSON.stringify({ version: 1, segments }, null, 2);

const numberValue = (value: unknown, fallback: number) => {
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(parsed) ? Math.max(0, Math.round(parsed)) : fallback;
};

const parseEditorJson = (value: string, totalDurationMs: number) => {
  const parsed: unknown = JSON.parse(value);
  const source = Array.isArray(parsed)
    ? parsed
    : parsed && typeof parsed === 'object' && Array.isArray((parsed as { segments?: unknown }).segments)
      ? (parsed as { segments: unknown[] }).segments
      : null;
  if (!source?.length) throw new Error('O JSON precisa conter uma lista segments.');

  const segments = source.map((entry, index) => {
    if (!entry || typeof entry !== 'object') throw new Error(`Trecho ${index + 1} invalido.`);
    const item = entry as Record<string, unknown>;
    const startTimeMs = numberValue(item.startTimeMs ?? item.startMs ?? item.start, 0);
    const endTimeMs = numberValue(item.endTimeMs ?? item.endMs ?? item.end, startTimeMs + 150);
    const text = String(item.text ?? item.line ?? '').trim();
    if (!text) throw new Error(`Trecho ${index + 1} sem texto.`);
    if (endTimeMs <= startTimeMs) throw new Error(`Trecho ${index + 1} possui intervalo invalido.`);
    return {
      index,
      startTimeMs,
      endTimeMs: totalDurationMs > 0 ? Math.min(endTimeMs, totalDurationMs) : endTimeMs,
      text,
    } satisfies LyricSegment;
  });

  return segments
    .sort((first, second) => first.startTimeMs - second.startTimeMs)
    .map((segment, index) => ({ ...segment, index }));
};

const JsonCode = ({ value }: { value: string }) => {
  const tokenPattern = /("(?:\\.|[^"\\])*(?=\s*:)|"(?:\\.|[^"\\])*"|-?\d+(?:\.\d+)?|\b(?:true|false|null)\b)/g;
  const children: React.ReactNode[] = [];
  let cursor = 0;
  let match: RegExpExecArray | null;
  while ((match = tokenPattern.exec(value))) {
    if (match.index > cursor) children.push(<Text key={`plain-${cursor}`}>{value.slice(cursor, match.index)}</Text>);
    const token = match[0];
    const color = token.startsWith('"')
      ? tokenPattern.lastIndex < value.length && value.slice(tokenPattern.lastIndex).match(/^\s*:/)
        ? '#8BD5FF'
        : '#A7E3A1'
      : /^(true|false|null)$/.test(token)
        ? '#D7A8FF'
        : '#FFC777';
    children.push(<Text key={`token-${match.index}`} style={{ color }}>{token}</Text>);
    cursor = tokenPattern.lastIndex;
  }
  if (cursor < value.length) children.push(<Text key={`plain-${cursor}`}>{value.slice(cursor)}</Text>);
  return <Text style={styles.jsonCode}>{children}</Text>;
};

type JsonEditorProps = {
  visible: boolean;
  initialValue: string;
  totalDurationMs: number;
  onClose: () => void;
  onApply: (segments: LyricSegment[]) => void;
};

const JsonEditorModal = ({ visible, initialValue, totalDurationMs, onClose, onApply }: JsonEditorProps) => {
  const [value, setValue] = React.useState(initialValue);
  const [editing, setEditing] = React.useState(false);
  const [status, setStatus] = React.useState('');
  const codePreviewRef = React.useRef<ScrollView>(null);

  React.useEffect(() => {
    if (visible) {
      setValue(initialValue);
      setEditing(false);
      setStatus('');
    }
  }, [initialValue, visible]);

  const formatValue = () => {
    try {
      setValue(formatEditorJson(parseEditorJson(value, totalDurationMs)));
      setStatus('JSON formatado');
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'JSON invalido');
    }
  };

  const applyValue = () => {
    try {
      const segments = parseEditorJson(value, totalDurationMs);
      onApply(segments);
      setStatus(`${segments.length} trechos aplicados`);
      setEditing(false);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'JSON invalido');
    }
  };

  const pasteValue = async () => {
    const clipboardValue = await Clipboard.getStringAsync();
    if (!clipboardValue.trim()) {
      Alert.alert('Area de transferencia vazia', 'Copie um JSON de letra antes de colar.');
      return;
    }
    setValue(clipboardValue);
    setEditing(true);
    setStatus('JSON colado');
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.jsonModalRoot}
      >
        <View style={styles.jsonModalCard}>
          <View style={styles.jsonModalHeader}>
            <View>
              <Text style={styles.jsonModalTitle}>JSON da letra</Text>
              <Text style={styles.jsonModalSubtitle}>Edite tempos e frases sem sair do player</Text>
            </View>
            <Pressable accessibilityLabel="Fechar editor JSON" onPress={onClose} style={styles.jsonCloseButton}>
              <Ionicons name="close" size={22} color="#FFFFFF" />
            </Pressable>
          </View>

          <View style={styles.jsonToolbar}>
            <Pressable accessibilityLabel="Colar JSON" onPress={() => void pasteValue()} style={styles.jsonToolButton}>
              <Ionicons name="clipboard-outline" size={17} color="#FFFFFF" />
              <Text style={styles.jsonToolText}>Colar</Text>
            </Pressable>
            <Pressable accessibilityLabel="Formatar JSON" onPress={formatValue} style={styles.jsonToolButton}>
              <Ionicons name="color-wand-outline" size={17} color="#FFFFFF" />
              <Text style={styles.jsonToolText}>Formatar</Text>
            </Pressable>
            <Pressable accessibilityLabel={editing ? 'Visualizar JSON' : 'Editar JSON'} onPress={() => setEditing((current) => !current)} style={styles.jsonToolButton}>
              <Ionicons name={editing ? 'eye-outline' : 'create-outline'} size={17} color="#FFFFFF" />
              <Text style={styles.jsonToolText}>{editing ? 'Visualizar' : 'Editar'}</Text>
            </Pressable>
          </View>

          <View style={styles.jsonCodeFrame}>
            {editing ? (
              <View style={styles.jsonEditorStack}>
                <ScrollView
                  ref={codePreviewRef}
                  contentContainerStyle={styles.jsonPreviewContent}
                  pointerEvents="none"
                  scrollEnabled={false}
                >
                  <JsonCode value={value} />
                </ScrollView>
                <TextInput
                  accessibilityLabel="Conteudo JSON da letra"
                  autoCapitalize="none"
                  autoCorrect={false}
                  cursorColor="#FFFFFF"
                  multiline
                  onChangeText={(nextValue) => {
                    setValue(nextValue);
                    setStatus('');
                  }}
                  onScroll={(event) => {
                    codePreviewRef.current?.scrollTo({
                      y: event.nativeEvent.contentOffset.y,
                      animated: false,
                    });
                  }}
                  scrollEnabled
                  selectionColor="#FFFFFF"
                  spellCheck={false}
                  style={styles.jsonInputOverlay}
                  textAlignVertical="top"
                  value={value}
                />
              </View>
            ) : (
              <ScrollView keyboardShouldPersistTaps="handled" nestedScrollEnabled>
                <JsonCode value={value} />
              </ScrollView>
            )}
          </View>

          <View style={styles.jsonFooter}>
            <Text style={styles.jsonStatus}>{status || 'Formato: { "segments": [{ "startTimeMs", "endTimeMs", "text" }] }'}</Text>
            <Pressable accessibilityLabel="Aplicar JSON da letra" onPress={applyValue} style={styles.jsonApplyButton}>
              <Ionicons name="checkmark" size={18} color="#07110A" />
              <Text style={styles.jsonApplyText}>Aplicar</Text>
            </Pressable>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
};

export function LyricSyncEditor({
  selectedRange,
  totalDurationMs,
  currentPositionMs,
  onMove,
  onResizeStart,
  onResizeEnd,
  onScrubStart,
  onScrubEnd,
  isPlaying,
  onTogglePlayPause,
  waveformSeed,
  segments,
  onApplySegments,
}: LyricSyncEditorProps) {
  const [viewportDurationMs, setViewportDurationMs] =
    React.useState(WAVEFORM_WINDOW_MS);
  const [jsonVisible, setJsonVisible] = React.useState(false);

  if (!selectedRange) return null;

  const selectionDurationMs = Math.max(
    150,
    selectedRange.endTimeMs - selectedRange.startTimeMs
  );
  const timelineStartMs = Math.max(
    0,
    Math.min(
      totalDurationMs - viewportDurationMs,
      selectedRange.startTimeMs - (viewportDurationMs - selectionDurationMs) / 2
    )
  );
  const selectionProgress = Math.max(
    0,
    Math.min(
      1,
      (currentPositionMs - selectedRange.startTimeMs) / selectionDurationMs
    )
  );

  return (
    <View style={styles.container}>
      <MusicTimelineSelector
        isPlaying={isPlaying}
        onTogglePlayPause={onTogglePlayPause}
        onWindowDurationChange={setViewportDurationMs}
        selectionDurationMs={viewportDurationMs}
        startTimeMs={timelineStartMs}
        totalDurationMs={totalDurationMs}
        windowDurationMs={viewportDurationMs}
      />
      <MusicWaveformReel
        onMoveToStart={(requestedStartMs) =>
          selectedRange.startTimeMs +
          onMove(requestedStartMs - selectedRange.startTimeMs)
        }
        onResizeEnd={onResizeEnd}
        onResizeStart={onResizeStart}
        onScrubEnd={onScrubEnd}
        onScrubStart={onScrubStart}
        seed={waveformSeed}
        selectionDurationMs={selectionDurationMs}
        selectionProgress={selectionProgress}
        selectionStartMs={selectedRange.startTimeMs}
        totalDurationMs={totalDurationMs}
        viewportDurationMs={viewportDurationMs}
      />
      <View style={styles.timelineMeta}>
        <View style={styles.timeBadge}>
          <Text style={styles.timeBadgeLabel}>INICIO</Text>
          <SecondsValue milliseconds={selectedRange.startTimeMs} />
        </View>
        <View style={styles.timeBadge}>
          <Text style={styles.timeBadgeLabel}>FIM</Text>
          <SecondsValue milliseconds={selectedRange.endTimeMs} />
        </View>
        <View style={[styles.timeBadge, styles.timeBadgeAccent]}>
          <Text style={styles.timeBadgeLabel}>DURACAO</Text>
          <SecondsValue milliseconds={selectionDurationMs} />
        </View>
      </View>
      <View style={styles.editorActions}>
        <Pressable accessibilityLabel="Abrir JSON da letra" onPress={() => setJsonVisible(true)} style={styles.editorActionButton}>
          <Ionicons name="code-slash-outline" size={18} color="#8BD5FF" />
          <Text style={styles.editorActionText}>JSON</Text>
        </Pressable>
        <Pressable accessibilityLabel="Copiar JSON da letra" onPress={() => void Clipboard.setStringAsync(formatEditorJson(segments))} style={styles.editorActionButton}>
          <Ionicons name="copy-outline" size={18} color="#FFFFFF" />
          <Text style={styles.editorActionText}>Copiar</Text>
        </Pressable>
      </View>
      <Text style={styles.hint}>Arraste a onda para mover; use as alcas para ajustar o intervalo.</Text>
      <JsonEditorModal
        initialValue={formatEditorJson(segments)}
        onApply={onApplySegments}
        onClose={() => setJsonVisible(false)}
        totalDurationMs={totalDurationMs}
        visible={jsonVisible}
      />
    </View>
  );
}

const getSecondsParts = (milliseconds: number) => {
  const safeMilliseconds = Math.round(Math.max(0, milliseconds));
  return {
    fraction: String(safeMilliseconds % 1000).padStart(3, '0'),
    whole: String(Math.floor(safeMilliseconds / 1000)),
  };
};

function SecondsValue({ milliseconds }: { milliseconds: number }) {
  const { fraction, whole } = getSecondsParts(milliseconds);
  return (
    <Text style={styles.timeBadgeValue}>
      {whole}
      <Text style={styles.timeBadgeFraction}>,{fraction}</Text>
      <Text style={styles.timeBadgeUnit}> s</Text>
    </Text>
  );
}

const styles = StyleSheet.create({
  container: {
    width: '100%',
    marginTop: 2,
    paddingBottom: 12,
  },
  timelineMeta: { flexDirection: 'row', gap: 8, marginTop: 4 },
  timeBadge: { backgroundColor: 'rgba(255,255,255,0.09)', borderRadius: 10, flex: 1, paddingHorizontal: 9, paddingVertical: 6 },
  timeBadgeAccent: { backgroundColor: 'rgba(139,213,255,0.14)' },
  timeBadgeLabel: { color: 'rgba(255,255,255,0.48)', fontSize: 8, fontWeight: '700', letterSpacing: 0.8 },
  timeBadgeValue: { color: '#FFFFFF', fontSize: 15, fontVariant: ['tabular-nums'], fontWeight: '700', marginTop: 2 },
  timeBadgeFraction: { color: 'rgba(255,255,255,0.72)', fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace', fontSize: 10, fontWeight: '700' },
  timeBadgeUnit: { color: '#FFFFFF', fontSize: 15, fontWeight: '700' },
  editorActions: { flexDirection: 'row', gap: 8, marginTop: 10 },
  editorActionButton: { alignItems: 'center', backgroundColor: 'rgba(255,255,255,0.1)', borderRadius: 12, flex: 1, flexDirection: 'row', gap: 6, justifyContent: 'center', minHeight: 42, paddingHorizontal: 8 },
  editorActionText: { color: '#FFFFFF', fontSize: 12, fontWeight: '700' },
  hint: {
    color: 'rgba(255,255,255,0.48)',
    fontSize: 11,
    fontWeight: '500',
    marginTop: 8,
    textAlign: 'center',
  },
  jsonModalRoot: { backgroundColor: 'rgba(0,0,0,0.62)', flex: 1, justifyContent: 'flex-end' },
  jsonModalCard: { backgroundColor: '#1B1D24', borderTopLeftRadius: 24, borderTopRightRadius: 24, maxHeight: '88%', padding: 16 },
  jsonModalHeader: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between', marginBottom: 14 },
  jsonModalTitle: { color: '#FFFFFF', fontSize: 20, fontWeight: '800' },
  jsonModalSubtitle: { color: 'rgba(255,255,255,0.52)', fontSize: 12, marginTop: 3 },
  jsonCloseButton: { alignItems: 'center', backgroundColor: 'rgba(255,255,255,0.12)', borderRadius: 20, height: 40, justifyContent: 'center', width: 40 },
  jsonToolbar: { flexDirection: 'row', gap: 8, marginBottom: 10 },
  jsonToolButton: { alignItems: 'center', backgroundColor: 'rgba(255,255,255,0.1)', borderRadius: 10, flexDirection: 'row', gap: 6, justifyContent: 'center', minHeight: 38, paddingHorizontal: 12 },
  jsonToolText: { color: '#FFFFFF', fontSize: 12, fontWeight: '700' },
  jsonCodeFrame: { backgroundColor: '#101116', borderColor: 'rgba(139,213,255,0.2)', borderRadius: 14, borderWidth: 1, flex: 1, minHeight: 260, overflow: 'hidden', padding: 12 },
  jsonEditorStack: { flex: 1, minHeight: 240, position: 'relative' },
  jsonPreviewContent: { paddingBottom: 12 },
  jsonCode: { color: '#D7DCE7', fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace', fontSize: 12, lineHeight: 19 },
  jsonInputOverlay: { ...StyleSheet.absoluteFill, color: 'transparent', fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace', fontSize: 12, lineHeight: 19, padding: 0, textAlignVertical: 'top' },
  jsonFooter: { alignItems: 'center', flexDirection: 'row', gap: 10, marginTop: 12 },
  jsonStatus: { color: 'rgba(255,255,255,0.52)', flex: 1, fontSize: 11, lineHeight: 16 },
  jsonApplyButton: { alignItems: 'center', backgroundColor: '#A7E3A1', borderRadius: 12, flexDirection: 'row', gap: 5, minHeight: 42, paddingHorizontal: 15 },
  jsonApplyText: { color: '#07110A', fontSize: 13, fontWeight: '800' },
});
