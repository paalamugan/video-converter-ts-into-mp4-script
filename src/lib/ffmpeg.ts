import ffmpeg from "fluent-ffmpeg";
import ffprobeClient from "ffprobe-client";
import path from "path";

const ffmpegPath = path.resolve(__dirname, "..", "binaries", "ffmpeg");
const ffprobePath = path.resolve(__dirname, "..", "binaries", "ffprobe");

const ffmpegPathUrl = process.env.FFMPEG_PATH || ffmpegPath;
const ffprobePathUrl = process.env.FFPROBE_PATH || ffprobePath;

ffmpegPathUrl && ffmpeg.setFfmpegPath(ffmpegPathUrl);
ffprobePathUrl && ffmpeg.setFfprobePath(ffprobePathUrl);

const ffprobe = (url: string) => {
  const config = ffprobePathUrl ? { path: ffprobePathUrl } : undefined;
  return ffprobeClient(url, config);
};

export { ffmpeg, ffprobe };
