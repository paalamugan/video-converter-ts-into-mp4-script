export interface VideoFileDownloaderOptions {
  name?: string;
  format?: string;
  start?: number;
  stop?: number;
  tmpDir?: string;
  deleteTmpChunkFiles?: boolean;
  deleteTmpChunkFilesAfterSuccess?: boolean;
  deleteTmpChunkFilesAfterError?: boolean;
}

export type FFProbe = import("ffprobe-client").FFProbe;

export type HashAlgorithm = "md5" | "sha1" | "sha256" | "sha512";
export type HashAlgorithmEncoding = "hex" | "binary" | "base64";
