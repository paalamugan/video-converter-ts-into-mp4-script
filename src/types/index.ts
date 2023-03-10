export interface VideoFileDownloaderOptions {
  name: string;
  format?: string;
  start?: number;
  stop?: number;
}

export type FFProbe = import('ffprobe-client').FFProbe;
