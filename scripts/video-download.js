const { writeJSONSync, writeFileSync } = require("fs-extra");
const { resolve } = require("path");
const { convertUrlVideoToFileUsingYtDlp, asyncPool } = require("../dist");
const episodeData = require("../naruto-shippuden-episode-list");

const CONSOLE_COLOR = {
  green: "\x1b[32m",
  cyan: "\x1b[36m",
  normal: "\x1b[37m",
  yellow: "\x1b[33m",
  red: "\x1b[31m",
};

const getEpisodeList = (data) => {
  return Object.entries(data)
    .filter(([episode, url]) => episode && url)
    .map(([episode, url]) => ({ episode, url }));
};

(async () => {
  try {
    const items = getEpisodeList(episodeData);

    const results = await asyncPool(
      items,
      ({ episode, url }) => {
        const fileName = `naruto-shippuden-episode-${episode}`;
        const outputUrl = resolve("output", `${fileName}.mp4`);
        return convertUrlVideoToFileUsingYtDlp(url, {
          output: outputUrl,
          concurrentFragments: 5,
          // printJson: true,
          noWarnings: true,
          onProgress({ name, percent }) {
            const percentStr = percent.toFixed(2) + "%";
            console.log(
              `${CONSOLE_COLOR.green}>> Progressing - ${CONSOLE_COLOR.cyan}${name || fileName}${
                CONSOLE_COLOR.green
              } >>${CONSOLE_COLOR.normal} percentage: ${CONSOLE_COLOR.yellow}${percentStr}${
                CONSOLE_COLOR.normal
              }`
            );
          },
        });
      },
      { stopOnError: false, concurrency: 5 }
    );

    if (!results.length) {
      return console.log("No videos found to download!");
    }
    const successResults = results.filter((item) => item.status === "fulfilled");
    const failedResults = results.filter((item) => item.status === "rejected");
    if (successResults.length) {
      console.log("");
      console.log(
        `${CONSOLE_COLOR.green}${successResults.length} Videos downloaded successfully!${CONSOLE_COLOR.normal}`
      );
      console.log("");
      console.log("Writing downloaded.json file...");
      writeJSONSync(resolve("downloaded.json"), successResults);
    }

    if (failedResults.length) {
      console.log("");
      console.log(
        `${CONSOLE_COLOR.red}${failedResults.length} Videos failed to download!${CONSOLE_COLOR.normal}`
      );
      console.log("Writing failed.json file...");
      writeJSONSync(resolve("failed.json"), failedResults);
    }
    process.exit(0);
  } catch (err) {
    writeFileSync(resolve("error.log"), err.toString());
    console.error(err);
    process.exit(1);
  }
})();
