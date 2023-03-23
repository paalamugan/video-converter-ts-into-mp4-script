import https from "https";
import http from "http";
import path from "path";
import { finished } from "stream/promises";
import fse from "fs-extra";
import { ffmpeg } from "../lib/ffmpeg";
import { CONSOLE_COLOR } from "../constants";
import { AsyncPoolOptions, AsyncPoolReturnType } from "../types";

export const getCurrentDate = () => {
  const date = new Date();
  return date
    .toLocaleDateString("en-US", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    })
    .replace(/\//g, "-");
};

export const kebabCase = (str: string) => {
  return str
    .replace(/([a-z])([A-Z])/g, "$1-$2")
    .replace(/\s+/g, "-")
    .toLowerCase();
};

export const isString = (value: unknown): value is string => {
  return typeof value === "string" || value instanceof String;
};

export const getTmpCollectionDirPath = (tmpDir: string, fileName: string) => {
  // const currentDate = getCurrentDate();
  // return path.resolve(tmpDir, currentDate, fileName);
  return path.resolve(tmpDir, fileName);
};

export const getTmpCollectionFilePath = (tmpDir: string, fileName: string, ext: string) => {
  return path.resolve(tmpDir, `${fileName}.${ext}`);
};

export const statusProgressConsole = (
  command: ffmpeg.FfmpegCommand,
  options?: {
    outputPath?: string;
    resolve?: () => void;
    reject?: (reason?: any) => void;
  }
) => {
  const { outputPath, resolve, reject } = options || {};
  const baseName = path.basename(outputPath || "streaming");
  const fileName = baseName.split(".")[0];
  const format = baseName.split(".")[1] || "mp4";
  return command
    .on("start", function(cmd) {
      console.log(`Started: ${CONSOLE_COLOR.cyan}${cmd}`);
      console.log(" ");
    })
    .on("progress", function(data) {
      const percent = (data.percent || 0).toFixed(2);
      console.log(
        `${CONSOLE_COLOR.green}>> Progressing - ${CONSOLE_COLOR.cyan}${fileName}${CONSOLE_COLOR.green} >>${CONSOLE_COLOR.normal} time: ${CONSOLE_COLOR.yellow}${data.timemark}${CONSOLE_COLOR.normal}, percentage: ${CONSOLE_COLOR.yellow}${percent}%${CONSOLE_COLOR.normal}`
      );
    })
    .on("end", () => {
      console.log("");
      if (outputPath) {
        console.log(
          `${CONSOLE_COLOR.cyan}>> Successfully Converted video into ${format} format: ${CONSOLE_COLOR.normal}${outputPath}`
        );
      } else {
        console.log(
          `${CONSOLE_COLOR.cyan}>> Successfully transferred video into the stream file.${CONSOLE_COLOR.normal}`
        );
      }
      resolve?.();
    })
    .on("error", (err) => {
      console.log(
        `${CONSOLE_COLOR.red}>> Error while converting video file into ${format} format.${CONSOLE_COLOR.normal}`
      );
      reject?.(err);
    });
};

export const getFileName = (filePath: string) => {
  let fileName = path.basename(filePath).split(".")[0];
  fileName = fileName || filePath.split("/").at(-1) || "default";
  return fileName;
};

export const fetchVideoData = ({
  url,
  fileName,
  start,
  stop,
  tmpDir,
}: {
  url: string;
  fileName: string;
  tmpDir: string;
  start: number;
  stop?: number;
}) => {
  const promises: Promise<void>[] = [];
  return new Promise<{ segmentFilePath: string; totalCount: number }>((resolve, reject) => {
    const segmentFilePath = getTmpCollectionFilePath(tmpDir, fileName, "txt"); // Where we will save all the info for ffmpeg will be stored.

    if (fse.existsSync(segmentFilePath)) fse.removeSync(segmentFilePath); // If segmentFilePath is exists, delete it.

    const makeRequest = (startIndex: number, stopIndex?: number) => {
      const onSuccessCallback = async () => {
        try {
          await Promise.all(promises);
          resolve({
            segmentFilePath: segmentFilePath,
            totalCount: startIndex - 1,
          });
        } catch (err) {
          reject(
            new Error("Error while downloading video", {
              cause: err,
            })
          );
        }
      };

      const onNextRequest = () => {
        fse.appendFileSync(segmentFilePath, `file '${startIndex}.ts'\r\n`);
        makeRequest(startIndex + 1, stopIndex);
      };

      if (stopIndex && startIndex > stopIndex) return onSuccessCallback();

      const tmpTsChunkPath = getTmpCollectionFilePath(tmpDir, `${startIndex}`, "ts");

      if (fse.existsSync(tmpTsChunkPath)) return onNextRequest();

      const onErrorCallback = (err: Error) => {
        fse.removeSync(tmpTsChunkPath);
        reject(err);
      };

      const file = fse.createWriteStream(tmpTsChunkPath);

      console.log(
        `${CONSOLE_COLOR.cyan}Downloading(${CONSOLE_COLOR.yellow}${fileName}${
          CONSOLE_COLOR.cyan
        }): ${CONSOLE_COLOR.green + startIndex}.ts${CONSOLE_COLOR.normal}`
      );

      const currentSegmentUrl = url.replace("{{index}}", startIndex.toString());
      const newUrl = new URL(currentSegmentUrl);
      const request = newUrl.protocol === "https:" ? https : http;

      request.get(newUrl.href, (response) => {
        const statusCode = response.statusCode;
        const headers = response.headers;
        if (
          (statusCode && statusCode >= 300) ||
          headers["content-type"]?.includes("text") ||
          headers["content-type"]?.includes("application/json")
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

        response.on("error", onErrorCallback);

        file.on("error", onErrorCallback);
        file.on("finish", () => {
          console.log(
            `${CONSOLE_COLOR.cyan}Downloaded(${CONSOLE_COLOR.yellow}${fileName}${
              CONSOLE_COLOR.cyan
            }): ${CONSOLE_COLOR.green + startIndex}.ts${CONSOLE_COLOR.normal}`
          );
          file.close();
        });

        response.pipe(file);
        promises.push(finished(file));
        return onNextRequest();
      });
    };

    makeRequest(start, stop);
  });
};

export const mergeMultipleTsFileToSingle = (segmentFilePath: string) => {
  const tsOutputFilePath = segmentFilePath.replace(".txt", ".ts");

  return new Promise<string>(async (resolve, reject) => {
    ffmpeg(segmentFilePath)
      .inputFormat("concat")
      .audioCodec("copy")
      .videoCodec("copy")
      .outputOption("-hide_banner")
      .save(tsOutputFilePath)
      .on("error", reject)
      .on("end", () => {
        console.log("");
        console.log(
          `${CONSOLE_COLOR.cyan}>> Successfully Merged multiple ts files into single: ${CONSOLE_COLOR.normal}${tsOutputFilePath}`
        );
        console.log("");
        resolve(tsOutputFilePath);
      });
  });
};

export const getPathExtension = (url: string) => {
  const ext = path.extname(url).replace(".", "");
  return ext;
};

export const isJSON = (str = "") => str.startsWith("{");

export const parse = ({ stdout, stderr, ...details }: any) => {
  if (!stderr) return isJSON(stdout) ? JSON.parse(stdout) : stdout;
  throw Object.assign(new Error(stderr), details);
};

export const asyncPool = async <T extends unknown, R, TOptions extends AsyncPoolOptions>(
  iterable: Iterable<T>,
  iteratorFn: (item: T, iterable?: Iterable<T>) => Promise<R>,
  options?: TOptions
) => {
  const { stopOnError = true, concurrency = 1 } = options || {};
  const allTasks: Promise<R>[] = []; // Store all asynchronous tasks
  const executingTasks: Set<Promise<R>> = new Set(); // Stores executing asynchronous tasks

  for (const item of iterable) {
    try {
      // Call the iteratorFn function to create an asynchronous task
      const p = Promise.resolve().then(() => iteratorFn(item, iterable));

      allTasks.push(p); // save new async task
      executingTasks.add(p); // Save an executing asynchronous task

      const clean = () => executingTasks.delete(p);
      p.then(clean).catch(clean);
      if (executingTasks.size >= concurrency) {
        // Wait for faster task execution to complete
        await Promise.race(executingTasks);
      }
    } catch (err) {
      if (stopOnError) throw err;
    }
  }

  const results = stopOnError ? Promise.all(allTasks) : Promise.allSettled(allTasks);
  return results as AsyncPoolReturnType<TOptions, R>;
};
