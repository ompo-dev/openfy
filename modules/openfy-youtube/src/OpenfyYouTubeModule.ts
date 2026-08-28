import { NativeModule, requireNativeModule } from 'expo';

export type NativeYouTubeTransferResult = {
  uri?: string;
  status: number;
  mimeType?: string | null;
  headers?: Record<string, string>;
  totalBytes?: number;
};

declare class OpenfyYouTubeModule extends NativeModule<{}> {
  /**
   * Transfers an already-resolved googlevideo stream in deterministic byte
   * ranges. The native implementation owns every range request, so iOS and
   * Android preserve the identity headers that minted the signed URL.
   */
  downloadGoogleVideoAsync(
    url: string,
    destination: string,
    headers: Record<string, string>,
    chunkBytes: number
  ): Promise<NativeYouTubeTransferResult>;

  /**
   * iOS resolves a current Android Music player URL and downloads it through
   * the same URLSession, preserving the network identity Google binds to it.
   */
  resolveAndDownloadGoogleVideoAsync(
    videoId: string,
    destination: string,
    chunkBytes: number
  ): Promise<NativeYouTubeTransferResult>;
}

export default requireNativeModule<OpenfyYouTubeModule>('OpenfyYouTube');
