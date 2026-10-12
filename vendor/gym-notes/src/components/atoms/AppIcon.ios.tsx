import { SymbolView, type SFSymbol, type SymbolWeight } from 'expo-symbols';
import type { StyleProp, ViewStyle } from 'react-native';

import { useColors } from '@/hooks/use-colors';

import type { AppIconName } from './AppIcon';

// Each lucide name mapped to its closest SF Symbol. iOS renders these native
// symbols; Android/web keep the lucide set in `AppIcon.tsx`. Typed as a full
// `Record`, so adding a lucide icon without an SF equivalent fails the build.
const SF: Record<AppIconName, SFSymbol> = {
  apple: 'leaf.fill',
  // 'salt' is iOS 26-only (not in the typed SF 7 set) → would render blank.
  // Keeping the salt-sprinkle metaphor with a symbol that exists everywhere.
  asterisk: 'asterisk',
  beef: 'fish.fill',
  bell: 'bell',
  bike: 'bicycle',
  bookmark: 'bookmark',
  calendar: 'calendar',
  camera: 'camera',
  check: 'checkmark',
  chevronDown: 'chevron.down',
  chevronLeft: 'chevron.left',
  chevronRight: 'chevron.right',
  chevronUp: 'chevron.up',
  circleDot: 'smallcircle.filled.circle',
  circleHelp: 'questionmark.circle',
  cloudOff: 'icloud.slash',
  clock: 'clock',
  contrast: 'circle.righthalf.filled',
  crown: 'crown',
  droplet: 'drop.fill',
  droplets: 'drop.fill',
  dumbbell: 'dumbbell.fill',
  ellipsis: 'ellipsis',
  // Used for the "photograph a menu" action, not a generic document.
  fileText: 'menucard',
  fish: 'fish',
  flame: 'flame.fill',
  footprints: 'figure.walk',
  glassWater: 'waterbottle.fill',
  globe: 'globe',
  heart: 'heart',
  images: 'photo.on.rectangle',
  info: 'info.circle',
  keyboard: 'keyboard',
  leaf: 'leaf',
  // SF Symbols ships no gender symbols; a standing figure is the closest native
  // stand-in. The option label ("Masculino"/"Feminino") carries the meaning.
  mars: 'figure.stand',
  minus: 'minus',
  moonStar: 'moon.stars',
  // Distance is the cardio (run/walk) metric, not a compass heading.
  navigation: 'figure.run',
  pencil: 'pencil',
  plus: 'plus',
  scale: 'scalemass',
  scanBarcode: 'barcode.viewfinder',
  send: 'paperplane',
  settings: 'gearshape',
  sliders: 'slider.horizontal.3',
  sparkles: 'sparkles',
  squareStack: 'square.stack',
  star: 'star',
  target: 'target',
  trash: 'trash',
  trophy: 'trophy',
  users: 'person.2.fill',
  utensils: 'fork.knife',
  venus: 'figure.stand.dress',
  zap: 'bolt',
  wheat: 'carrot.fill', // carbo
  x: 'xmark',
  sugar: 'cube.fill',
  // No real SF Symbol for salt/sodium exists (a cast to 'salt' rendered blank
  // even on iOS 27 — it isn't in the framework). Asterisk = salt-sprinkle, real
  // on every iOS. Swap here if Apple ever ships one.
  sodium: 'asterisk',
  // Micronutrient categories (per your SF spec).
  vitamins: 'sparkles',
  antioxidants: 'sparkles',
  minerals: 'atom',
  electrolytes: 'bolt.fill',
  potassium: 'bolt.fill',
  magnesium: 'bolt.fill',
  iron: 'bolt.horizontal.fill',
  calcium: 'pills.fill', // no 'bone' in SF 7; supplement pill instead
  omega3: 'drop.fill',
};

interface AppIconProps {
  name: AppIconName;
  color?: string;
  size?: number;
  /** Any truthy, non-'transparent' value renders the symbol's `.fill` variant. */
  fill?: string;
  weight?: SymbolWeight;
  style?: StyleProp<ViewStyle>;
}

export function AppIcon({ name, color, size = 18, fill, weight = 'medium', style }: AppIconProps) {
  const colors = useColors();
  const base = SF[name];
  const filled = !!fill && fill !== 'transparent';
  const symbol = (filled && !base.endsWith('.fill') ? `${base}.fill` : base) as SFSymbol;

  return (
    <SymbolView
      name={symbol}
      size={size}
      tintColor={color ?? colors.text}
      type="monochrome"
      weight={weight}
      style={[{ width: size, height: size }, style]}
    />
  );
}
