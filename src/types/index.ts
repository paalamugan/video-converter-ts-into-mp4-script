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

export type FileOutput = {
  path: string;
};

export interface AsyncPoolOptions {
  stopOnError?: boolean;
  concurrency?: number;
}

export type AsyncPoolReturnType<
  TOptions extends AsyncPoolOptions,
  R
> = TOptions["stopOnError"] extends false ? Promise<PromiseSettledResult<R>[]> : Promise<R[]>;
