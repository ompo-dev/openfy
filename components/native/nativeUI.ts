// Android / web fallback: no ExpoUI native module here, so every SwiftUI
// export is undefined and IOS_NATIVE_ENABLED is false.
// iOS resolves `nativeUI.ios.ts` which imports the real @expo/ui/swift-ui.
// Consumers branch on IOS_NATIVE_ENABLED and never touch these on non-iOS.

export const SwiftBottomSheet: any = undefined;
export const SwiftButton: any = undefined;
export const SwiftDivider: any = undefined;
export const SwiftForm: any = undefined;
export const SwiftGroup: any = undefined;
export const SwiftHost: any = undefined;
export const SwiftHStack: any = undefined;
export const SwiftImage: any = undefined;
export const SwiftMenu: any = undefined;
export const SwiftPicker: any = undefined;
export const SwiftSection: any = undefined;
export const SwiftSlider: any = undefined;
export const SwiftText: any = undefined;
export const SwiftToggle: any = undefined;
export const SwiftVStack: any = undefined;

export const swiftButtonBorderShape: any = undefined;
export const swiftButtonStyle: any = undefined;
export const swiftControlSize: any = undefined;
export const swiftFixedSize: any = undefined;
export const swiftFont: any = undefined;
export const swiftForegroundStyle: any = undefined;
export const swiftFrame: any = undefined;
export const swiftLabelStyle: any = undefined;
export const swiftLabelsHidden: any = undefined;
export const swiftMenuActionDismissBehavior: any = undefined;
export const swiftPadding: any = undefined;
export const swiftPickerStyle: any = undefined;
export const presentationDetents: any = undefined;
export const presentationDragIndicator: any = undefined;
export const swiftTag: any = undefined;
export const swiftTint: any = undefined;
export const swiftToggleStyle: any = undefined;

// Typed boolean (not the literal `false`) so consumers' `if (IOS_NATIVE_ENABLED)`
// native branches stay reachable for the type-checker.
export const IOS_NATIVE_ENABLED: boolean = false;
