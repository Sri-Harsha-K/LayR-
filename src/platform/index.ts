import type { PlatformAdapter } from './types';
import { browserPlatform } from './browser';
import { electronPlatform } from './electron';

function isRunningInElectron(): boolean {
  return typeof window !== 'undefined' && typeof window.daw !== 'undefined';
}

export const platform: PlatformAdapter = isRunningInElectron() ? electronPlatform : browserPlatform;

export type { PlatformAdapter, OpenedProject, AudioFilePayload, SampleFile } from './types';
