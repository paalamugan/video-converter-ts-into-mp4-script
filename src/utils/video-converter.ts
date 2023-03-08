import https from 'https';
import http from 'http';
import path from 'path';
import fse from 'fs-extra';
import ffmpeg from '../lib/ffmpeg';

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

const rootPath = process.cwd();

const tmpPath = path.resolve(rootPath, 'tmp');
const outputPath = path.resolve(rootPath, 'output');

const getCurrentDate = () => {
  const date = new Date();
  return date
    .toLocaleDateString('en-US', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    })
    .replace(/\//g, '-');
};

const kebabCase = (str: string) => {
  return str
    .replace(/([a-z])([A-Z])/g, '$1-$2')
    .replace(/\s+/g, '-')
    .toLowerCase();
};

const getTmpCollectionDirPath = (fileName: string) => {
  const currentDate = getCurrentDate();
  return path.resolve(tmpPath, currentDate, fileName);
};

const getOutputCollectionDirPath = () => {
  const currentDate = getCurrentDate();
  return path.resolve(outputPath, currentDate);
};

const getOutputCollectionFilePath = (fileName: string, ext: string) => {
  return path.resolve(getOutputCollectionDirPath(), `${fileName}.${ext}`);
};

const getTmpCollectionFilePath = (fileName: string, ext: string) => {
  return path.resolve(getTmpCollectionDirPath(fileName), `${fileName}.${ext}`);
};

// const getDownloadAPIUrl = (hash: string) => {
//   return `https://c-an-ca1.betterstream.cc:2223/hls-playback/${hash}/seg-{{index}}-f2-v1-a1.ts`;
// };

const sleep = (ms: number) => {
  return new Promise((resolve) => setTimeout(resolve, ms));
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

const convertTsFileToMp4 = (tsOutputFilePath: string) => {
  return new Promise<string>((resolve, reject) => {
    const fileName = path.basename(tsOutputFilePath).split('.')[0];
    const finalOutputFilePath = getOutputCollectionFilePath(fileName, 'mp4');
    command
      .clone()
      .addInput(tsOutputFilePath)
      .audioCodec('copy')
      .videoCodec('copy')
      .addOutputOption('-hide_banner')
      .save(finalOutputFilePath)
      .on('error', reject)
      .on('end', () => {
        console.log(
          `${color.green}>> Successfully Converted ts file into MP4: ${color.normal}${finalOutputFilePath}`
        );
        resolve(finalOutputFilePath);
      });
  });
};

const convertToMp4 = async (fileName: string) => {
  const tsOutputFilePath = await mergeMultipleTsFileToSingle(fileName);
  const finalOutputFilePath = await convertTsFileToMp4(tsOutputFilePath);
  console.log(
    `${color.green}>> Success!${color.normal} Successfully Downloaded: ${color.yellow}${fileName}`
  );
  console.log('');
  return finalOutputFilePath;
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
        if (response.statusCode && response.statusCode >= 300) {
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

const deleteAllTmpCollectionFiles = (outputFilePath: string) => {
  setImmediate(() => {
    const fileName = path.basename(outputFilePath).split('.')[0];
    try {
      const tmpCollectionDirPath = getTmpCollectionDirPath(fileName);
      fse.removeSync(tmpCollectionDirPath);
      fse.removeSync(outputFilePath);
      console.log(
        `${color.cyan}>> Delete!${color.normal} Successfully Deleted in :${
          color.yellow + fileName
        }${color.normal}`
      );
    } catch (err) {
      console.error(
        `${color.red} >> Error: ${color.normal} Delete failed in ${
          color.yellow + fileName
        }${color.normal}. Reason: ${err}`
      );
    }
  });
};

export const getVideoDownloadStream = async (
  url: string,
  title: string,
  start = 1,
  stop?: number
) => {
  const fileName = kebabCase(title);
  try {
    fse.ensureDirSync(getTmpCollectionDirPath(fileName));
    fse.ensureDirSync(getOutputCollectionDirPath());

    const totalCount = await initRequest(url, fileName, start, stop);

    if (totalCount < 1) throw new Error('No video found.');

    console.log(color.normal);
    console.log(
      `${color.green}>> Done!${color.normal} Downloaded ${
        color.yellow + totalCount + color.normal
      } .ts files. Now let's merge them all into one..`
    );
    console.log('');
    await sleep(1000);
    const outputFilePath = await convertToMp4(fileName);
    const outputStream = fse.createReadStream(outputFilePath);

    outputStream.on('end', () => {
      deleteAllTmpCollectionFiles(outputFilePath);
    });
    return outputStream;
  } catch (err) {
    console.error(
      `${color.red} >> Download failed: ${color.normal} While Downloading ${
        color.yellow + fileName
      }${color.normal} video. Please try again.`
    );
    console.error(color.red + err + color.normal);
    console.log('');
    throw err;
  }
};

// const url = getDownloadAPIUrl(
//   "66152f4dfeb7ec9a44ed171bc73733febacb5ce920279f677b902c69e7d1de4070728a0b49a392cb707ecd6c94ba20e6b0ebc666d6307c743f993e6daa7de2238508b6408b24b4e09d8d21ea9ac06066344d567c6c0932de75c87f75c923cf9c66b143cf44c36456ca64c2237373b385488ea577d2a4bf480b81dcb91917e0c1bd571a7e2e9544aa3e1d03866324c55e9c3e71db4af32c74a16e89bdaea80b2d8231a7f45eb3276269e2b77e8a9f1735"
// );

// getVideoDownloadStream(url, "naruto-shippuden-episode-5")
//   .then((stream) => {
//     stream.pipe(
//       fse.createWriteStream(getOutputCollectionFilePath("test", "mp4"))
//     );
//   })
//   .catch(console.error);
