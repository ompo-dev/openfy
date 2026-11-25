import * as React from 'react';
import { View } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { WAVE_TILE, waveformTileIndices, waveTilePath, fadeShadePath } from '../../services/mix/mixWaveformGeometry';

type Props = { peaks: number[]; duration: number; sourceStart: number; sourceEnd: number; scale: number;
  visibleStart: number; visibleEnd: number; height: number; color: string; symmetric?: boolean; fadeIn?: number; fadeOut?: number };
type TileProps = Omit<Props, 'visibleStart' | 'visibleEnd'> & { tile: number };
const Tile = React.memo(function Tile({ peaks, duration, sourceStart, sourceEnd, scale, height, color, symmetric, fadeIn = 0, fadeOut = 0, tile }: TileProps) {
  const width = Math.min(WAVE_TILE, (sourceEnd - sourceStart) * scale - tile * WAVE_TILE);
  if (width <= 0) return null;
  const path = waveTilePath(peaks, duration, sourceStart, scale, tile, width, height, symmetric);
  const fade = fadeShadePath(tile * WAVE_TILE, width, height, sourceEnd - sourceStart, scale, fadeIn, fadeOut);
  return <View pointerEvents="none" style={{ position: 'absolute', left: tile * WAVE_TILE, bottom: 0, width, height }}>
    <Svg width={width} height={height} viewBox={`0 0 ${width} ${height}`}>
      {path ? <Path d={path} fill={color} /> : null}
      {fade ? <Path testID="mix-fade-curve" d={fade} fill="#000" fillOpacity={0.38} /> : null}
    </Svg>
  </View>;
});
export function MixWaveTiles({ visibleStart, visibleEnd, ...props }: Props) {
  const tiles = waveformTileIndices(visibleStart, visibleEnd, (props.sourceEnd - props.sourceStart) * props.scale);
  return <View testID="mix-clip-waveform" pointerEvents="none" style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: props.height }}>
    {tiles.map((tile) => <Tile key={tile} tile={tile} {...props} />)}
  </View>;
}
