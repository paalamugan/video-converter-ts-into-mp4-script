import ffmpeg from 'fluent-ffmpeg';
import ffmpegPath from 'ffmpeg-static';
import ffprobePath from '@ffprobe-installer/ffprobe';

if (process.env.FFMPEG_PATH) {
  ffmpeg.setFfmpegPath(process.env.FFMPEG_PATH);
} else {
  ffmpegPath && ffmpeg.setFfmpegPath(ffmpegPath);
}

if (process.env.FFPROBE_PATH) {
  ffmpeg.setFfmpegPath(process.env.FFPROBE_PATH);
} else {
  ffprobePath.path && ffmpeg.setFfprobePath(ffprobePath.path);
}

export default ffmpeg;
