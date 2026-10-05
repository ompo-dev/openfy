import * as React from 'react';
import { AppIcon as Ionicons } from "./AppIcon";
import { useConnectivityStore } from '../../stores/useConnectivityStore';

type DownloadActionIconProps = {
  size: number;
  color: string;
};

export function DownloadActionIcon({ size, color }: DownloadActionIconProps) {
  const isOnline = useConnectivityStore((state) => state.status !== 'offline');
  return (
    <Ionicons
      name={isOnline ? 'download-outline' : 'cloud-offline-outline'}
      size={size}
      color={color}
    />
  );
}
