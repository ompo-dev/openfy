import { Platform } from 'react-native';
import * as BackgroundTask from 'expo-background-task';
import * as TaskManager from 'expo-task-manager';
import { processPendingDownloads } from '../download/downloadManager';

export const BACKGROUND_DOWNLOAD_TASK = 'openfy-pending-downloads';
const BACKGROUND_DOWNLOAD_INTERVAL_MINUTES = 15;

if (
  Platform.OS !== 'web' &&
  !TaskManager.isTaskDefined(BACKGROUND_DOWNLOAD_TASK)
) {
  TaskManager.defineTask(BACKGROUND_DOWNLOAD_TASK, async () => {
    try {
      const { failed } = await processPendingDownloads(1);
      return failed > 0
        ? BackgroundTask.BackgroundTaskResult.Failed
        : BackgroundTask.BackgroundTaskResult.Success;
    } catch (error) {
      console.warn('[BackgroundDownloads] Task failed:', error);
      return BackgroundTask.BackgroundTaskResult.Failed;
    }
  });
}

/**
 * Registers one OS-owned worker for resumable music downloads. The OS decides
 * the exact wake-up time; iOS does not guarantee an immediate background run.
 */
export const registerBackgroundDownloadTask = async (): Promise<boolean> => {
  if (Platform.OS === 'web') return false;

  try {
    const status = await BackgroundTask.getStatusAsync();
    if (status !== BackgroundTask.BackgroundTaskStatus.Available) {
      return false;
    }

    const isRegistered = await TaskManager.isTaskRegisteredAsync(
      BACKGROUND_DOWNLOAD_TASK
    );
    if (!isRegistered) {
      await BackgroundTask.registerTaskAsync(BACKGROUND_DOWNLOAD_TASK, {
        minimumInterval: BACKGROUND_DOWNLOAD_INTERVAL_MINUTES,
      });
    }
    return true;
  } catch (error) {
    console.warn('[BackgroundDownloads] Registration failed:', error);
    return false;
  }
};
