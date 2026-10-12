import * as React from 'react';
import { AppText as GymAppText } from '../../vendor/gym-notes/src/components/atoms/AppText';

export function AppText({ style, ...props }: React.ComponentProps<typeof GymAppText>) {
  return <GymAppText {...props} style={[style, { letterSpacing: 0 }]} />;
}
