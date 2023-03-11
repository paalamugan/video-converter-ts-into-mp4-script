import https from "https";
import http from "http";
import path from "path";
import fse from "fs-extra";
import { ffmpeg } from "../lib/ffmpeg";
import { CONSOLE_COLOR } from "../constants";

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

export const sleep = (ms: number) => {
  return new Promise((resolve) => setTimeout(resolve, ms));
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
  return command
    .on("start", function(_cmd) {
      // console.log(`Started: ${CONSOLE_COLOR.cyan}${cmd}`);
      // console.log(' ');
    })
    .on("progress", function(data) {
      console.log(
        `${CONSOLE_COLOR.green}>> Progressing >>${CONSOLE_COLOR.normal} time: ${
          CONSOLE_COLOR.yellow
        }${data.timemark}${CONSOLE_COLOR.normal}, percentage: ${
          CONSOLE_COLOR.yellow
        }${data.percent || 0}%${CONSOLE_COLOR.normal}`
      );
    })
    .on("end", () => {
      console.log(" ");
      if (outputPath) {
        console.log(
          `${CONSOLE_COLOR.green}>> Successfully Converted video into MP4: ${CONSOLE_COLOR.normal} ${outputPath}`
        );
      } else {
        console.log(
          `${CONSOLE_COLOR.green}>> Successfully transferred video into the stream file.${CONSOLE_COLOR.normal}`
        );
      }
      console.log(" ");
      resolve?.();
    })
    .on("error", (err) => {
      console.log(
        `${CONSOLE_COLOR.red}>> Error while converting ts file into MP4.${CONSOLE_COLOR.normal}`
      );
      console.error(err);
      reject?.(err);
    });
};

export const getFileName = (filePath: string) => {
  let fileName = path.basename(filePath).split(".")[0];
  fileName = fileName || filePath.split("/").at(-1) || "default";
  return fileName;
};

export const recursiveRequest = ({
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
  return new Promise<number>((initResolve, initReject) => {
    const tmpSegmentPath = getTmpCollectionFilePath(tmpDir, fileName, "txt"); // Where we will save all the info for ffmpeg will be stored.

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

      url = url.replace("{{index}}", startIndex.toString());

      const tmpTsChunkPath = getTmpCollectionFilePath(tmpDir, `${startIndex}`, "ts");

      if (fse.existsSync(tmpTsChunkPath)) return onNextRequest();

      const onErrorCallback = (err: Error) => {
        fse.removeSync(tmpTsChunkPath);
        initReject(err);
      };

      const file = fse.createWriteStream(tmpTsChunkPath);

      console.log(
        `${CONSOLE_COLOR.cyan}Downloading(${CONSOLE_COLOR.yellow}${fileName}${
          CONSOLE_COLOR.cyan
        }): ${CONSOLE_COLOR.normal + startIndex}.ts`
      );

      const newUrl = new URL(url);
      const request = newUrl.protocol === "https:" ? https : http;
      request.get(newUrl.href, (response) => {
        if (
          (response.statusCode && response.statusCode >= 300) ||
          response.headers["content-type"]?.includes("text") ||
          response.headers["content-type"]?.includes("application/json")
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
            `${CONSOLE_COLOR.cyan}Downloaded(${fileName}): ${CONSOLE_COLOR.yellow + startIndex}.ts`
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

export const mergeMultipleTsFileToSingle = (tmpDir: string, fileName: string) => {
  const segmentOutputFilePath = getTmpCollectionFilePath(tmpDir, fileName, "txt");
  const tsOutputFilePath = getTmpCollectionFilePath(tmpDir, fileName, "ts");
  const command = ffmpeg();

  return new Promise<string>(async (resolve, reject) => {
    command
      .clone()
      .addInput(segmentOutputFilePath)
      .inputFormat("concat")
      .audioCodec("copy")
      .videoCodec("copy")
      .outputOption("-hide_banner")
      .save(tsOutputFilePath)
      .on("error", reject)
      .on("end", () => {
        console.log(
          `${CONSOLE_COLOR.cyan}>> Successfully Merged multiple ts files into single: ${CONSOLE_COLOR.normal}${tsOutputFilePath}`
        );
        console.log("");
        resolve(tsOutputFilePath);
      });
  });
};
