import path from "path";
import crypto from "crypto";
import fse from "fs-extra";
import { Writable } from "stream";
import { Readable } from "stream";
import { ffmpeg } from "../lib/ffmpeg";
import {
  FileOutput,
  HashAlgorithm,
  HashAlgorithmEncoding,
  VideoFileDownloaderOptions,
} from "../types";
import { CONSOLE_COLOR, DEFAULT_TMP_DIR, EXTENSION_REQUIRED_ERROR_MESSAGE } from "../constants";
import {
  getFileName,
  getTmpCollectionDirPath,
  isString,
  kebabCase,
  mergeMultipleTsFileToSingle,
  fetchVideoData,
  statusProgressConsole,
  getPathExtension,
} from "../helper";

// execSync(
//   "ffmpeg -f concat -i segments.txt -c copy tsvideo.ts -hide_banner -nostats -loglevel 0 -y"
// );
// execSync(
//   `ffmpeg -i tsvideo.ts -acodec copy -vcodec copy new-output.mp4 -hide_banner -nostats -loglevel 0 -y`
// );
// If the video conversion doesn't give the results you suspected or doesn't convert at all, you can replace the second command with
// "ffmpeg -i tsvideo.ts -qscale 0 new-output.mp4 -hide_banner -nostats -loglevel 0"
// note that output field size will increase.

export const getHashKey = (
  url: string,
  algorithm: HashAlgorithm = "sha1",
  encoding: HashAlgorithmEncoding = "hex"
) => {
  const hash = crypto.createHash(algorithm);
  return hash.update(url).digest(encoding);
};

export const convertVideoUrlIntoStream = (inputPath: string, format: string = "mp4") => {
  const command = ffmpeg(inputPath);
  const ext = getPathExtension(inputPath);

  if (ext === "txt") {
    command.inputFormat("concat");
  }

  command
    .videoCodec("copy")
    .audioCodec("copy")
    .outputOption("-hide_banner")
    .outputOption("-movflags frag_keyframe+empty_moov")
    .outputOption("-bsf:a aac_adtstoasc")
    .outputFormat(format);

  statusProgressConsole(command);

  return command.pipe();
};

export const convertVideoUrlIntoFile = <
  T extends string | Writable,
  ResultType = T extends string ? FileOutput : Writable
>(
  inputPath: string,
  outputPath: T,
  options?: {
    format?: string;
    timeout?: number;
  }
) => {
  const isOutputPathString = isString(outputPath);
  const outputResult = isOutputPathString ? path.resolve(outputPath) : outputPath;
  const outputExt = isOutputPathString ? getPathExtension(outputPath) : null;

  // timeout: default 5 minutes in seconds
  const { format = "mp4", timeout = 5 * 60 } = options || {};
  const outputFormat = outputExt || format;

  if (isString(outputResult)) {
    const outputPathDir = path.dirname(outputResult);
    fse.ensureDirSync(outputPathDir);
  }

  return new Promise<ResultType>((resolve, reject) => {
    const command = ffmpeg(inputPath, {
      timeout: timeout,
    });
    const ext = getPathExtension(inputPath);

    if (ext === "txt") {
      command.inputFormat("concat");
    }

    command
      // .audioCodec("libmp3lame")
      // .videoCodec("libx264")
      .audioCodec("copy")
      .videoCodec("copy")
      .outputFormat(outputFormat)
      .outputOption("-hide_banner");

    if (!isOutputPathString) {
      command
        .outputOption("-movflags frag_keyframe+empty_moov")
        .outputOption("-bsf:a aac_adtstoasc");
    }

    const onResolve = () => {
      if (isString(outputResult)) {
        resolve({
          path: outputResult,
        } as ResultType);
      } else {
        resolve((outputResult as unknown) as ResultType);
      }
    };

    const onReject = (err: Error) => {
      isString(outputResult) && fse.removeSync(outputResult);
      reject(err);
    };

    statusProgressConsole(command, {
      outputPath: isString(outputResult) ? outputResult : undefined,
      resolve: onResolve,
      reject: onReject,
    });

    command.output(outputResult).run();
  });
};

export const convertStreamIntoBuffer = (stream: ReturnType<typeof convertVideoUrlIntoStream>) => {
  return new Promise<Buffer>((resolve, reject) => {
    const chunks: Buffer[] = [];
    stream.on("data", (chunk: Buffer) => chunks.push(chunk));
    stream.on("finish", () => resolve(Buffer.concat(chunks)));
    stream.on("error", (err) => reject(err));
  });
};

export const convertBufferIntoReadableStream = (buffer: Buffer) => {
  return Readable.from(buffer);
};

export const combineMultipleVideoUrlIntoFile = async <T extends string | null>(
  inputPath: string,
  outputPath: T,
  options?: VideoFileDownloaderOptions
): Promise<T extends string ? FileOutput : ReturnType<typeof convertVideoUrlIntoStream>> => {
  const {
    name,
    start = 1,
    stop,
    format,
    tmpDir = DEFAULT_TMP_DIR,
    deleteTmpChunkFiles = true,
    deleteTmpChunkFilesAfterError = false,
    deleteTmpChunkFilesAfterSuccess = false,
  } = (options as VideoFileDownloaderOptions) || {};

  if (isString(outputPath) && !path.extname(outputPath).length) {
    throw new Error(EXTENSION_REQUIRED_ERROR_MESSAGE);
  }

  let fileName = getHashKey(inputPath);

  if (isString(outputPath)) {
    fileName = getFileName(outputPath);
  }

  fileName = name || kebabCase(fileName);
  const tmpDirPath = getTmpCollectionDirPath(tmpDir, fileName);
  fse.ensureDirSync(tmpDirPath);

  const startIndex = start;
  const stopIndex = /{{index}}/.test(inputPath) ? stop : 1;

  try {
    const { totalCount, segmentFilePath } = await fetchVideoData({
      url: inputPath,
      tmpDir: tmpDirPath,
      fileName,
      start: startIndex,
      stop: stopIndex,
    });

    if (totalCount < 1) {
      throw new Error(
        `No video was found in this specified url "${inputPath.replace(
          "{{index}}",
          startIndex.toString()
        )}". Please provide a valid video format url.`
      );
    }

    console.log(CONSOLE_COLOR.normal);
    console.log(
      `${CONSOLE_COLOR.green}>> Done!${CONSOLE_COLOR.normal} Downloaded ${CONSOLE_COLOR.yellow +
        totalCount +
        CONSOLE_COLOR.normal} .ts files. Now let's merge them all into one..`
    );

    const tsOutputFilePath = await mergeMultipleTsFileToSingle(segmentFilePath);

    let result: any;
    if (typeof outputPath === "string") {
      result = await convertVideoUrlIntoFile(tsOutputFilePath, outputPath);
    } else {
      result = convertVideoUrlIntoStream(tsOutputFilePath, format);
    }

    if (deleteTmpChunkFilesAfterSuccess) {
      fse.removeSync(tmpDirPath);
    }
    return result;
  } catch (err) {
    const terminalErrorMessage = `${CONSOLE_COLOR.red} >> Download failed: ${
      CONSOLE_COLOR.normal
    } While Downloading ${CONSOLE_COLOR.yellow +
      inputPath.replace("{{index}}", startIndex.toString())}${CONSOLE_COLOR.normal} video.`;

    console.error(terminalErrorMessage);
    console.log("");
    console.error(CONSOLE_COLOR.red + err + CONSOLE_COLOR.normal);
    console.log("");
    if (deleteTmpChunkFilesAfterError) {
      fse.removeSync(tmpDirPath);
    }

    const errorMessage = `Download failed: While Downloading ${inputPath} video.`;
    throw new Error(errorMessage, {
      cause: {
        fileId: fileName,
        err: {
          message: (err as Error).message,
        },
      },
    });
  } finally {
    deleteTmpChunkFiles && fse.removeSync(tmpDirPath);
  }
};

export const combineMultipleVideoUrlIntoStream = (
  inputPath: string,
  options?: VideoFileDownloaderOptions
) => {
  return combineMultipleVideoUrlIntoFile(inputPath, null, options);
};

export const convertM3u8ToVideoFile = async <T extends string | Writable>(
  inputPath: string,
  outputPath: T,
  options?: {
    format?: string;
  }
) => {
  try {
    const result = await convertVideoUrlIntoFile(inputPath, outputPath, options);
    return result;
  } catch (err) {
    if (isString(outputPath)) {
      fse.removeSync(outputPath);
    } else {
      outputPath.end();
    }
    const errorMessage = `Download failed: While Downloading ${inputPath} video.`;
    throw new Error(errorMessage, {
      cause: {
        err: err,
      },
    });
  }
};

export const convertM3u8ToVideoStream = (inputPath: string, format?: string) => {
  return convertVideoUrlIntoStream(inputPath, format);
};
