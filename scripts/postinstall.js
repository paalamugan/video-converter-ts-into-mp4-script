const path = require("path");
const ffbinaries = require("ffbinaries");

(() => {
  const platform = ffbinaries.detectPlatform();
  const options = {
    platform,
    quiet: true,
    destination: path.resolve(__dirname, "..", "binaries"),
  };

  ffbinaries.downloadFiles(options, (err) => {
    if (err) {
      return console.error(err);
    }
    console.log(
      `Downloaded ffmpeg and ffprobe binaries for ${platform} to ${options.destination}.`
    );
  });
})();
