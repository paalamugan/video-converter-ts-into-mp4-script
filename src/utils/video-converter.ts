import path from "path";
import crypto from "crypto";
import fse from "fs-extra";
import { Readable } from "stream";
import { ffmpeg, ffprobe } from "../lib/ffmpeg";
import { FFProbe, VideoFileDownloaderOptions } from "../types";
import { CONSOLE_COLOR, DEFAULT_TMP_DIR, EXTENSION_REQUIRED_ERROR_MESSAGE } from "../constants";
import {
  getFileName,
  getTmpCollectionDirPath,
  isString,
  kebabCase,
  mergeMultipleTsFileToSingle,
  recursiveRequest,
  sleep,
  statusProgressConsole,
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

export const convertVideoUrlIntoStream = (inputPath: string, format: string = "mp4") => {
  const command = ffmpeg();
  const streamCommand = command
    .clone()
    .addInput(inputPath)
    .videoCodec("copy")
    .audioCodec("copy")
    .outputOption("-hide_banner")
    .outputOption("-movflags frag_keyframe+empty_moov")
    .outputOption("-bsf:a aac_adtstoasc")
    .outputFormat(format);

  statusProgressConsole(streamCommand);

  return streamCommand.pipe();
};

export const convertVideoUrlIntoFile = (inputPath: string, outputPath: string) => {
  if (!path.extname(outputPath).length) {
    throw new Error(EXTENSION_REQUIRED_ERROR_MESSAGE);
  }

  outputPath = path.resolve(outputPath);

  const outputPathDir = path.dirname(outputPath);
  fse.ensureDirSync(outputPathDir);

  return new Promise<FFProbe>((resolve, reject) => {
    const command = ffmpeg();
    const fileCommand = command
      .clone()
      .addInput(inputPath)
      // .audioCodec('libmp3lame')
      // .videoCodec('libx264')
      .audioCodec("copy")
      .videoCodec("copy")
      .outputOption("-hide_banner");

    const onResolve = () => resolve(ffprobe(outputPath));
    const onReject = (err: Error) => reject(err);
    statusProgressConsole(fileCommand, {
      outputPath: outputPath,
      resolve: onResolve,
      reject: onReject,
    });
    fileCommand.save(outputPath);
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
): Promise<T extends string ? FFProbe : ReturnType<typeof convertVideoUrlIntoStream>> => {
  const {
    name,
    start = 1,
    stop,
    format,
    tmpDir = DEFAULT_TMP_DIR,
    deleteTmpFiles = false,
    deleteTmpFilesOnlyAfterError = false,
    deleteTmpFilesOnlyAfterSuccess = false,
  } = (options as VideoFileDownloaderOptions) || {};

  if (isString(outputPath) && !path.extname(outputPath).length) {
    throw new Error(EXTENSION_REQUIRED_ERROR_MESSAGE);
  }

  let fileName = crypto.randomUUID();

  if (isString(outputPath)) {
    fileName = getFileName(outputPath);
  }

  fileName = name || kebabCase(fileName);
  const tmpDirPath = getTmpCollectionDirPath(tmpDir, fileName);
  fse.ensureDirSync(tmpDirPath);

  const startIndex = start;
  const stopIndex = /{{index}}/.test(inputPath) ? stop : 1;

  try {
    const totalCount = await recursiveRequest({
      url: inputPath,
      tmpDir: tmpDirPath,
      fileName,
      start: startIndex,
      stop: stopIndex,
    });

    if (totalCount < 1) {
      throw new Error(
        `No video was found in this specified url ${CONSOLE_COLOR.cyan}${inputPath}${CONSOLE_COLOR.normal}. Please provide a valid video format url.`
      );
    }

    console.log(CONSOLE_COLOR.normal);
    console.log(
      `${CONSOLE_COLOR.green}>> Done!${CONSOLE_COLOR.normal} Downloaded ${CONSOLE_COLOR.yellow +
        totalCount +
        CONSOLE_COLOR.normal} .ts files. Now let's merge them all into one..`
    );
    console.log("");
    await sleep(500);

    const tsOutputFilePath = await mergeMultipleTsFileToSingle(tmpDirPath, fileName);

    let result: any;
    if (typeof outputPath === "string") {
      result = await convertVideoUrlIntoFile(tsOutputFilePath, outputPath);
    } else {
      result = convertVideoUrlIntoStream(tsOutputFilePath, format);
    }

    if (deleteTmpFilesOnlyAfterSuccess) {
      fse.removeSync(tmpDirPath);
    }
    return result;
  } catch (err) {
    console.error(
      `${CONSOLE_COLOR.red} >> Download failed: ${
        CONSOLE_COLOR.normal
      } While Downloading ${CONSOLE_COLOR.yellow + fileName}${
        CONSOLE_COLOR.normal
      } video. Please try again.`
    );
    console.error(CONSOLE_COLOR.red + err + CONSOLE_COLOR.normal);
    console.log("");
    console.log(CONSOLE_COLOR.normal);
    if (deleteTmpFilesOnlyAfterError) {
      fse.removeSync(tmpDirPath);
    }
    throw err;
  } finally {
    deleteTmpFiles && fse.removeSync(tmpDirPath);
  }
};

export const combineMultipleVideoUrlIntoStream = (
  inputPath: string,
  options?: VideoFileDownloaderOptions
) => {
  return combineMultipleVideoUrlIntoFile(inputPath, null, options);
};
