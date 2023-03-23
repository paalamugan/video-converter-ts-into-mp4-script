import path from "path";
import ytDlp from "youtube-dl-exec";
import { parse } from "../helper";

export type YtFlags = Parameters<typeof ytDlp.exec>[1] & {
  concurrentFragments?: number;
  onProgress?: (result: { name: string; percent: number }) => void;
};

export type YtResponse = Awaited<ReturnType<typeof ytDlp>>;

export const convertUrlVideoToFileUsingYtDlp = (url: string, options?: YtFlags) => {
  const { onProgress, ...restOptions } = options || {};

  return new Promise<YtResponse | string>(async (resolve, reject) => {
    const stream = ytDlp.exec(url, restOptions);
    let totalChunk = "";
    let progressCount = 0;
    let progressFileCount = 0;
    let currentProgress = 0;
    let completedDownload = 0;

    stream.stdout?.on("data", (chunk) => {
      chunk = chunk.toString();
      chunk = chunk.replace(/\r/g, "");
      totalChunk += chunk;
      const formatValue = totalChunk.match(/(?<=format\(s\):\s+).+/g);
      const format = formatValue?.at(-1);
      const formats = format?.split("+") || [];
      const formatLength = formats.length;
      const destination = totalChunk.match(/(?<=\[download\]\s+Destination:\s).+/g);
      const destinationLength = destination?.length || 0;
      const progress = chunk.match(/(?!\[download\]\s+)[0-9.]+%/g);

      if (formatLength && progress) {
        if (destinationLength && progressFileCount !== destinationLength) {
          progressFileCount = destinationLength;
          progressCount += currentProgress;
        }
        const lastProgress = progress.at(-1);
        const progressNumber = Number(lastProgress?.replace("%", ""));
        currentProgress = progressNumber / formatLength;

        const progressPercent = progressCount + currentProgress;

        completedDownload += progressPercent >= 100 ? 1 : 0;
        const fileName = path.basename((destination?.at(-1) || "").trim()).split(".")[0];
        if (completedDownload < 2) {
          onProgress?.({
            name: fileName,
            percent: progressPercent,
          });
        }
      }
    });

    stream
      .then((result) => {
        try {
          const parsedResult = parse(result);
          resolve(parsedResult);
        } catch (err) {
          reject(err);
        }
      })
      .catch((result) => {
        try {
          const parsedResult = parse(result);
          reject(parsedResult);
        } catch (err) {
          reject(err);
        }
      });
  });
};
