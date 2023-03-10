export interface VideoFileDownloaderOptions {
  name: string;
  format?: string;
  start?: number;
  stop?: number;
}

export type FFProbe = Awaited<
  ReturnType<typeof import('ffprobe-client')['default']>
>;
