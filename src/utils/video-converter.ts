import https from 'https';
import http from 'http';
import path from 'path';
import crypto from 'crypto';
import fse from 'fs-extra';
import { ffmpeg, ffprobe } from '../lib/ffmpeg';
import type { FFProbe, VideoFileDownloaderOptions } from '../types';
import { EXTENSION_REQUIRED_ERROR_MESSAGE } from '../constants';

const command = ffmpeg();
// execSync(
//   "ffmpeg -f concat -i segments.txt -c copy tsvideo.ts -hide_banner -nostats -loglevel 0 -y"
// );
// execSync(
//   `ffmpeg -i tsvideo.ts -acodec copy -vcodec copy new-output.mp4 -hide_banner -nostats -loglevel 0 -y`
// );
// If the conversion doesn't give wanted results or doesn't convert at all, you can replace the second command with
// "ffmpeg -i tsvideo.ts -qscale 0 new-output.mp4 -hide_banner -nostats -loglevel 0"
// note that output fiel size will increase.

// colors to make the console prettier
const color = {
  green: '\x1b[32m',
  cyan: '\x1b[36m',
  normal: '\x1b[37m',
  yellow: '\x1b[33m',
  red: '\x1b[31m',
};

const tmpPath = path.resolve(process.cwd(), 'tmp');

// const getCurrentDate = () => {
//   const date = new Date();
//   return date
//     .toLocaleDateString('en-US', {
//       year: 'numeric',
//       month: '2-digit',
//       day: '2-digit',
//     })
//     .replace(/\//g, '-');
// };

const kebabCase = (str: string) => {
  return str
    .replace(/([a-z])([A-Z])/g, '$1-$2')
    .replace(/\s+/g, '-')
    .toLowerCase();
};

const isString = (value: unknown): value is string => {
  return typeof value === 'string' || value instanceof String;
};

const getTmpCollectionDirPath = (fileName: string) => {
  // const currentDate = getCurrentDate();
  // return path.resolve(tmpPath, currentDate, fileName);
  return path.resolve(tmpPath, fileName);
};

const getTmpCollectionFilePath = (fileName: string, ext: string) => {
  return path.resolve(getTmpCollectionDirPath(fileName), `${fileName}.${ext}`);
};

const sleep = (ms: number) => {
  return new Promise((resolve) => setTimeout(resolve, ms));
};

const statusProgressConsole = (
  command: ffmpeg.FfmpegCommand,
  options?: {
    name: string;
    format?: string;
    resolve?: () => void;
    reject?: (reason?: any) => void;
  }
) => {
  const { name = '', resolve, reject, format = '' } = options || {};
  return command
    .on('start', function (_cmd) {
      // console.log(`Started: ${color.cyan}${cmd}`);
      // console.log(' ');
    })
    .on('progress', function (data) {
      console.log(
        `${color.green}>> Progress >>${color.normal} time: ${color.yellow}${
          data.timemark
        }${color.normal}, percentage: ${color.yellow}${(
          data.percent || 0
        ).toFixed(2)} %${color.normal}`
      );
    })
    .on('end', () => {
      console.log(' ');
      console.log(
        `${color.green}>> Successfully Converted ts file into MP4. ${color.normal}File Name: ${name}.${format}`
      );
      resolve?.();
    })
    .on('error', (err) => {
      console.log(
        `${color.red}>> Error while converting ts file into MP4. ${color.normal}File Name: ${name}.${format}`
      );
      console.error(err);
      reject?.(err);
    });
};

const getFileName = (filePath: string) => {
  let fileName = path.basename(filePath).split('.')[0];
  fileName = fileName || filePath.split('/').at(-1) || 'default';
  return fileName;
};

const initRequest = (
  url: string,
  fileName: string,
  start: number,
  stop?: number
) => {
  return new Promise<number>((initResolve, initReject) => {
    const tmpSegmentPath = getTmpCollectionFilePath(fileName, 'txt'); // Where we will save all the info for ffmpeg will be stored.

    if (fse.existsSync(tmpSegmentPath)) fse.removeSync(tmpSegmentPath); // If tmpSegmentPath is exists, delete it.

    const makeRequest = (startIndex: number, stopIndex?: number) => {
      const onSuccessCallback = () => {
        initResolve(startIndex - 1);
      };

      const onNextRequest = () => {
        fse.appendFileSync(tmpSegmentPath, `file '${startIndex}.ts'\r\n`);
        makeRequest(startIndex + 1, stopIndex);
      };

      if (stopIndex && startIndex > stopIndex) return onSuccessCallback();

      url = url.replace('{{index}}', startIndex.toString());

      const tmpTsChunkPath = path.resolve(
        getTmpCollectionDirPath(fileName),
        `${startIndex}.ts`
      );

      if (fse.existsSync(tmpTsChunkPath)) return onNextRequest();

      const onErrorCallback = (err: Error) => {
        fse.removeSync(tmpTsChunkPath);
        initReject(err);
      };

      const file = fse.createWriteStream(tmpTsChunkPath);

      console.log(
        `${color.cyan}Downloading(${color.yellow}${fileName}${color.cyan}): ${
          color.normal + startIndex
        }.ts`
      );

      const newUrl = new URL(url);
      const request = newUrl.protocol === 'https:' ? https : http;
      request.get(newUrl.href, (response) => {
        if (
          (response.statusCode && response.statusCode >= 300) ||
          response.headers['content-type']?.includes('text') ||
          response.headers['content-type']?.includes('application/json')
        ) {
          fse.removeSync(tmpTsChunkPath);
          return onSuccessCallback();
        }

        // if (response.statusCode !== 200) {
        //   const error = new Error(
        //     `Request failed with status code ${
        //       response.statusCode
        //     } and headers: ${JSON.stringify(response.headers, null, 2)}`
        //   );
        //   return onErrorCallback(error);
        // }

        response.on('error', onErrorCallback);

        file.on('error', onErrorCallback);
        file.on('finish', () => {
          console.log(
            `${color.cyan}Downloaded(${fileName}): ${
              color.yellow + startIndex
            }.ts`
          );
          file.close();
        });

        response.pipe(file);
        onNextRequest();
      });
    };

    makeRequest(start, stop);
  });
};

const mergeMultipleTsFileToSingle = (fileName: string) => {
  const segmentOutputFilePath = getTmpCollectionFilePath(fileName, 'txt');
  const tsOutputFilePath = getTmpCollectionFilePath(fileName, 'ts');

  return new Promise<string>(async (resolve, reject) => {
    command
      .clone()
      .addInput(segmentOutputFilePath)
      .inputFormat('concat')
      .audioCodec('copy')
      .videoCodec('copy')
      .outputOption('-hide_banner')
      .save(tsOutputFilePath)
      .on('error', reject)
      .on('end', () => {
        console.log(
          `${color.cyan}>> Successfully Merged multiple ts files into single: ${color.normal}${tsOutputFilePath}`
        );
        console.log('');
        resolve(tsOutputFilePath);
      });
  });
};

// const deleteAllTmpCollectionFiles = (fileName: string) => {
//   const tmpCollectionDirPath = getTmpCollectionDirPath(fileName);
//   fse.removeSync(tmpCollectionDirPath);
// };

export const convertVideoIntoStream = (
  inputPath: string,
  format: string = 'mp4'
) => {
  const streamCommand = command
    .clone()
    .addInput(inputPath)
    .videoCodec('copy')
    .audioCodec('copy')
    .outputOption('-hide_banner')
    .outputOption('-movflags frag_keyframe+empty_moov')
    .outputOption('-bsf:a aac_adtstoasc')
    .outputFormat(format);

  statusProgressConsole(streamCommand, {
    name: getFileName(inputPath),
    format,
  });

  return streamCommand.pipe();
};

export const convertVideoIntoFile = (inputPath: string, outputPath: string) => {
  if (!path.extname(outputPath).length) {
    throw new Error(EXTENSION_REQUIRED_ERROR_MESSAGE);
  }

  outputPath = path.isAbsolute(outputPath)
    ? outputPath
    : path.resolve(process.cwd(), outputPath);

  const outputPathDir = path.dirname(outputPath);
  fse.ensureDirSync(outputPathDir);

  return new Promise<FFProbe>((resolve, reject) => {
    const fileCommand = command
      .clone()
      .addInput(inputPath)
      // .audioCodec('libmp3lame')
      // .videoCodec('libx264')
      .audioCodec('copy')
      .videoCodec('copy')
      .outputOption('-hide_banner');

    const onResolve = () => resolve(ffprobe(outputPath));
    const onReject = (err: Error) => reject(err);
    statusProgressConsole(fileCommand, {
      name: getFileName(inputPath),
      format: path.extname(outputPath).replace('.', ''),
      resolve: onResolve,
      reject: onReject,
    });
    fileCommand.save(outputPath);
  });
};

export const combineMultipleVideoIntoSingle = async <T extends string | null>(
  inputPath: string,
  outputPath: T,
  options?: VideoFileDownloaderOptions
): Promise<
  T extends string ? FFProbe : ReturnType<typeof convertVideoIntoStream>
> => {
  const {
    name,
    start = 1,
    stop,
    format,
  } = (options as VideoFileDownloaderOptions) || {};

  if (isString(outputPath) && !path.extname(outputPath).length) {
    throw new Error(EXTENSION_REQUIRED_ERROR_MESSAGE);
  }

  let fileName = crypto.randomUUID();

  if (isString(outputPath)) {
    fileName = getFileName(outputPath);
  }

  fileName = name || kebabCase(fileName);

  try {
    fse.ensureDirSync(getTmpCollectionDirPath(fileName));

    const totalCount = await initRequest(inputPath, fileName, start, stop);

    if (totalCount < 1) {
      throw new Error(
        `No video was found in this specified url ${color.cyan}${inputPath}${color.normal}. Please provide a valid video format url.`
      );
    }

    console.log(color.normal);
    console.log(
      `${color.green}>> Done!${color.normal} Downloaded ${
        color.yellow + totalCount + color.normal
      } .ts files. Now let's merge them all into one..`
    );
    console.log('');
    await sleep(1000);
    const tsOutputFilePath = await mergeMultipleTsFileToSingle(fileName);

    let result: any;
    if (typeof outputPath === 'string') {
      result = await convertVideoIntoFile(tsOutputFilePath, outputPath);
    } else {
      result = convertVideoIntoStream(tsOutputFilePath, format);
    }

    return result;
  } catch (err) {
    console.error(
      `${color.red} >> Download failed: ${color.normal} While Downloading ${
        color.yellow + fileName
      }${color.normal} video. Please try again.`
    );
    console.error(color.red + err + color.normal);
    console.log('');
    throw err;
  } finally {
    // deleteAllTmpCollectionFiles(fileName);
  }
};

export const combineMultipleVideoIntoStream = (
  inputPath: string,
  options?: VideoFileDownloaderOptions
) => {
  return combineMultipleVideoIntoSingle(inputPath, null, options);
};
