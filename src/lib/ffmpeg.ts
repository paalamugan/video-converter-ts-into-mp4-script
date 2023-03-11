import ffmpegPath from "ffmpeg-static";
// import ffprobePath from '@ffprobe-installer/ffprobe';
import ffprobePath from "ffprobe-static";
import ffmpeg from "fluent-ffmpeg";
import ffprobeClient from "ffprobe-client";

const ffmpegPathUrl = process.env.FFMPEG_PATH || ffmpegPath;
const ffprobePathUrl = process.env.FFPROBE_PATH || ffprobePath.path;

ffmpegPathUrl && ffmpeg.setFfmpegPath(ffmpegPathUrl);
ffprobePathUrl && ffmpeg.setFfprobePath(ffprobePathUrl);

const ffprobe = (inputPath: string) => {
  return ffprobeClient(inputPath, {
    path: ffprobePathUrl,
  });
};

export { ffmpeg, ffprobe };
