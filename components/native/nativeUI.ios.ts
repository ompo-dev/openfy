// iOS: SwiftUI controls plus Host from universal Expo UI entrypoint.
// Metro only bundles this file on iOS where the ExpoUI native module exists.
// Android/web resolve `nativeUI.ts` which stubs every export.
export { Host as SwiftHost } from '@expo/ui';

export {
  BottomSheet as SwiftBottomSheet,
  Button as SwiftButton,
  Divider as SwiftDivider,
  Form as SwiftForm,
  Group as SwiftGroup,
  HStack as SwiftHStack,
  Image as SwiftImage,
  Menu as SwiftMenu,
  Picker as SwiftPicker,
  Section as SwiftSection,
  Slider as SwiftSlider,
  Text as SwiftText,
  Toggle as SwiftToggle,
  VStack as SwiftVStack,
} from '@expo/ui/swift-ui';

export {
  buttonBorderShape as swiftButtonBorderShape,
  buttonStyle as swiftButtonStyle,
  controlSize as swiftControlSize,
  fixedSize as swiftFixedSize,
  font as swiftFont,
  foregroundStyle as swiftForegroundStyle,
  frame as swiftFrame,
  labelStyle as swiftLabelStyle,
  labelsHidden as swiftLabelsHidden,
  menuActionDismissBehavior as swiftMenuActionDismissBehavior,
  padding as swiftPadding,
  pickerStyle as swiftPickerStyle,
  presentationDetents,
  presentationDragIndicator,
  tag as swiftTag,
  tint as swiftTint,
  toggleStyle as swiftToggleStyle,
} from '@expo/ui/swift-ui/modifiers';

export const IOS_NATIVE_ENABLED = true;
