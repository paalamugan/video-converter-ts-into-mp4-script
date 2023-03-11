export interface VideoFileDownloaderOptions {
  name: string;
  format?: string;
  start?: number;
  stop?: number;
  tmpDir?: string;
  deleteTmpFiles?: boolean;
  deleteTmpFilesOnlyAfterSuccess?: boolean;
  deleteTmpFilesOnlyAfterError?: boolean;
}

export type FFProbe = import("ffprobe-client").FFProbe;
