import * as React from 'react';
import { Picker } from '@react-native-picker/picker';
import { Modal, StyleSheet, Text, View, useColorScheme } from 'react-native';

import {
  IOS_NATIVE_ENABLED,
  SwiftHStack,
  SwiftHost,
  SwiftPicker,
  SwiftText,
  AppIcon,
  GlassSurface,
  LoggedPressable,
  swiftFrame,
  swiftPickerStyle,
  swiftTag,
} from '../native';

type LibrarySort = 'recent' | 'title';
type LibraryView = 'songs' | 'playlists';

type LibraryControlsPickerProps = {
  sort: LibrarySort;
  view: LibraryView;
  onSortChange: (sort: LibrarySort) => void;
  onViewChange: (view: LibraryView) => void;
};

const sortFromValue = (value: unknown): LibrarySort =>
  value === 'title' ? 'title' : 'recent';
const viewFromValue = (value: unknown): LibraryView =>
  value === 'playlists' ? 'playlists' : 'songs';

/** Native SwiftUI menus on iPhone; platform picker fallback elsewhere. */
export const LibraryControlsPicker = ({
  sort,
  view,
  onSortChange,
  onViewChange,
}: LibraryControlsPickerProps) => {
  const scheme = useColorScheme() === 'dark' ? 'dark' : 'light';
  const [activePicker, setActivePicker] = React.useState<'sort' | 'view' | null>(
    null
  );
  const [pendingValue, setPendingValue] = React.useState<LibrarySort | LibraryView>(
    sort
  );

  const openPicker = (kind: 'sort' | 'view') => {
    setPendingValue(kind === 'sort' ? sort : view);
    setActivePicker(kind);
  };

  const confirmPicker = () => {
    if (activePicker === 'sort') onSortChange(sortFromValue(pendingValue));
    if (activePicker === 'view') onViewChange(viewFromValue(pendingValue));
    setActivePicker(null);
  };

  if (IOS_NATIVE_ENABLED) {
    return (
      <SwiftHost
        style={styles.nativeHost}
        colorScheme={scheme}
        matchContents={{ horizontal: false, vertical: true }}
      >
        <SwiftHStack spacing={2}>
          <SwiftPicker
            selection={sort}
            onSelectionChange={(next: unknown) => onSortChange(sortFromValue(next))}
            modifiers={[swiftPickerStyle('menu'), swiftFrame({ minWidth: 78, minHeight: 36 })]}
          >
            <SwiftText modifiers={[swiftTag('recent')]}>Recentes</SwiftText>
            <SwiftText modifiers={[swiftTag('title')]}>A–Z</SwiftText>
          </SwiftPicker>
          <SwiftPicker
            selection={view}
            onSelectionChange={(next: unknown) => onViewChange(viewFromValue(next))}
            modifiers={[swiftPickerStyle('menu'), swiftFrame({ minWidth: 78, minHeight: 36 })]}
          >
            <SwiftText modifiers={[swiftTag('songs')]}>Músicas</SwiftText>
            <SwiftText modifiers={[swiftTag('playlists')]}>Playlists</SwiftText>
          </SwiftPicker>
        </SwiftHStack>
      </SwiftHost>
    );
  }

  return (
    <>
      <GlassSurface glass="clear" isInteractive style={styles.fallbackControls}>
        <LoggedPressable
          accessibilityLabel="Ordenar biblioteca"
          onPress={() => openPicker('sort')}
          style={styles.fallbackTrigger}
        >
          <AppIcon name="sort" size={18} color="#B8B8B8" />
        </LoggedPressable>
        <View style={styles.fallbackDivider} />
        <LoggedPressable
          accessibilityLabel="Visualização da biblioteca"
          onPress={() => openPicker('view')}
          style={styles.fallbackTrigger}
        >
          <AppIcon name={view === 'songs' ? 'grid' : 'list'} size={18} color="#B8B8B8" />
        </LoggedPressable>
      </GlassSurface>

      <Modal
        visible={activePicker !== null}
        transparent
        animationType="fade"
        onRequestClose={() => setActivePicker(null)}
      >
        <View style={styles.modalOverlay}>
          <LoggedPressable
            accessibilityLabel="Fechar seleção"
            onPress={() => setActivePicker(null)}
            style={StyleSheet.absoluteFill}
          />
          <View style={styles.sheet}>
            <View style={styles.sheetHandle} />
            <Text style={styles.sheetTitle}>
              {activePicker === 'sort' ? 'Ordenar biblioteca' : 'Mostrar'}
            </Text>
            <Picker
              selectedValue={pendingValue}
              onValueChange={setPendingValue}
              itemStyle={styles.pickerItem}
              style={styles.picker}
            >
              {activePicker === 'sort' ? (
                <>
                  <Picker.Item label="Recentes" value="recent" color="#FFFFFF" />
                  <Picker.Item label="A–Z" value="title" color="#FFFFFF" />
                </>
              ) : (
                <>
                  <Picker.Item label="Músicas" value="songs" color="#FFFFFF" />
                  <Picker.Item label="Playlists" value="playlists" color="#FFFFFF" />
                </>
              )}
            </Picker>
            <LoggedPressable
              accessibilityLabel="Confirmar seleção"
              onPress={confirmPicker}
              style={styles.confirmButton}
            >
              <Text style={styles.confirmText}>Pronto</Text>
            </LoggedPressable>
          </View>
        </View>
      </Modal>
    </>
  );
};

const styles = StyleSheet.create({
  nativeHost: {
    height: 36,
    marginLeft: 'auto',
    width: 160,
  },
  fallbackControls: {
    alignItems: 'center',
    borderRadius: 18,
    flexDirection: 'row',
    height: 36,
    marginLeft: 'auto',
    overflow: 'hidden',
  },
  fallbackTrigger: {
    alignItems: 'center',
    height: 36,
    justifyContent: 'center',
    width: 35,
  },
  fallbackDivider: {
    backgroundColor: 'rgba(255,255,255,0.12)',
    height: 16,
    width: StyleSheet.hairlineWidth,
  },
  modalOverlay: {
    backgroundColor: 'rgba(0,0,0,0.58)',
    flex: 1,
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: '#1E1E1E',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingBottom: 28,
    paddingHorizontal: 20,
    paddingTop: 10,
  },
  sheetHandle: {
    alignSelf: 'center',
    backgroundColor: 'rgba(255,255,255,0.32)',
    borderRadius: 99,
    height: 4,
    width: 38,
  },
  sheetTitle: {
    color: '#FFFFFF',
    fontFamily: 'SF-Bold',
    fontSize: 18,
    marginTop: 18,
    textAlign: 'center',
  },
  picker: {
    color: '#FFFFFF',
    height: 150,
  },
  pickerItem: {
    color: '#FFFFFF',
    fontFamily: 'SF-Regular',
    fontSize: 18,
  },
  confirmButton: {
    alignItems: 'center',
    backgroundColor: '#1ED760',
    borderRadius: 14,
    height: 48,
    justifyContent: 'center',
  },
  confirmText: {
    color: '#000000',
    fontFamily: 'SF-Bold',
    fontSize: 16,
  },
});
