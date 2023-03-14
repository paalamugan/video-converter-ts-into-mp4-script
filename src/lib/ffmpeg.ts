import ffmpegPath from "ffmpeg-static";
import ffmpeg from "fluent-ffmpeg";
import ffprobeClient from "ffprobe-client";

const ffmpegPathUrl = process.env.FFMPEG_PATH || ffmpegPath || "";
const ffprobePathUrl = process.env.FFPROBE_PATH || "";

ffmpegPathUrl && ffmpeg.setFfmpegPath(ffmpegPathUrl);
ffprobePathUrl && ffmpeg.setFfprobePath(ffprobePathUrl);

const ffprobe = (url: string) => {
  const config = ffprobePathUrl ? { path: ffprobePathUrl } : undefined;
  return ffprobeClient(url, config);
};

export { ffmpeg, ffprobe };
