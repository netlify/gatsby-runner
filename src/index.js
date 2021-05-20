#!/usr/bin/env node
// @ts-check

const execa = require("execa");
const path = require("path");
const { copy, writeJSON, ensureDir } = require("fs-extra");
const { existsSync } = require("fs");

const MESSAGE_TYPES = {
  LOG_ACTION: `LOG_ACTION`,
  JOB_CREATED: `JOB_CREATED`,
  JOB_COMPLETED: `JOB_COMPLETED`,
  JOB_FAILED: `JOB_FAILED`,
  ACTIVITY_START: `ACTIVITY_START`,
  ACTIVITY_END: `ACTIVITY_END`,
  ACTIVITY_SUCCESS: `ACTIVITY_SUCCESS`,
  ACTIVITY_ERROR: `ACTIVITY_ERROR`,
};

async function run() {
  let gatsbyCli;
  try {
    gatsbyCli = require.resolve("gatsby/cli", { paths: [process.cwd()] });
  } catch (e) {
    console.error("Gatsby path not found", e);
    return;
  }

  const [, , ...args] = process.argv;

  const cacheDir = path.join(
    process.cwd(),
    ".cache",
    "caches",
    "gatsby-runner"
  );
  const gatsbyProcess = execa.node(gatsbyCli, ["build", ...args], {
    env: {
      ENABLE_GATSBY_EXTERNAL_JOBS: "1",
    },
  });

  async function handleImage({
    outputDir,
    inputPaths: { 0: inputPath },
    args,
  }) {
    await ensureDir(cacheDir);

    const jobDirname = path.join(cacheDir, path.basename(outputDir));
    const originalImage = `${inputPath.contentDigest}${path.extname(
      inputPath.path
    )}`;
    const originalFilename = path.join(outputDir, originalImage);
    console.log("exists: ", existsSync(cacheDir));

    const jobData = {
      originalImage,
      pluginOptions: args.pluginOptions,
    };
    await copy(inputPath.path, originalFilename);
    await ensureDir(jobDirname);

    await Promise.all(
      args.operations.map((image) => {
        const [hash] = image.outputPath.split("/");
        writeJSON(path.join(jobDirname, `${hash}.json`), {
          ...jobData,
          args: image.args,
        });
      })
    );
  }

  async function messageHandler(message) {
    switch (message.type) {
      case MESSAGE_TYPES.LOG_ACTION: {
        if (message.action.type === "LOG") {
          console.log(message.action.payload.text);
        }
        break;
      }
      case MESSAGE_TYPES.JOB_CREATED: {
        if (message.payload.name !== "IMAGE_PROCESSING") {
          gatsbyProcess.send({
            type: `JOB_NOT_WHITELISTED`,
            payload: { id: message.payload.id },
          });
          return;
        }
        try {
          handleImage(message.payload);
          gatsbyProcess.send({
            type: `JOB_COMPLETED`,
            payload: {
              id: message.payload.id,
              result: {},
            },
          });
        } catch (error) {
          gatsbyProcess.send({
            type: `JOB_FAILED`,
            payload: { id: message.payload.id, error: error.toString() },
          });
        }

        break;
      }

      default: {
        console.log("Ignoring", message.type);
      }
    }
  }

  gatsbyProcess.on("exit", async (code) => {
    console.log("Gatsby exited with code", code);
    process.exit(code);
  });

  gatsbyProcess.on("message", messageHandler);
}

try {
  run();
} catch (e) {
  console.error(e);
}
