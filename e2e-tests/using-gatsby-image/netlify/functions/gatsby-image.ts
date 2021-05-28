import { builder } from "@netlify/functions";
import { processFile } from "gatsby-plugin-sharp/process-file";
import tempy from "tempy";
import path from "path";
import download from "download";
import { readFileSync, statSync } from "fs";

// 6MB is hard max Lambda response size
const MAX_RESPONSE_SIZE = 6291456;

async function imageHandler(event) {
  const [, , fileHash, queryHash, fileName] = event.path.split("/");
  console.log(process.env);
  console.log({ fileHash, queryHash, fileName });
  let imageData;
  try {
    imageData = require(`${process.env.LAMBDA_TASK_ROOT}/src/.cache/caches/gatsby-runner/${fileHash}/${queryHash}.json`);
  } catch (e) {
    console.error(e);
    return {
      statusCode: 404,
      body: "Not found",
    };
  }

  const originalImageURL = `${
    process.env.DEPLOY_URL || `http://${event.headers.host}`
  }/static/${fileHash}/${imageData.originalImage}`;

  console.log("Downloading original image", originalImageURL);

  const tempdir = tempy.directory();

  await download(originalImageURL, tempdir);

  const outFile = path.join(tempdir, imageData.originalImage);

  const outputPath = path.join(
    tempdir,
    `${queryHash}.${imageData.args.toFormat}`
  );

  try {
    await Promise.all(
      processFile(
        outFile,
        [
          {
            outputPath,
            args: imageData.args,
          },
        ],
        imageData.options
      )
    );
  } catch (e) {
    console.error(e);
    return {
      headers: {
        "Content-Type": `application/json`,
      },
      statusCode: 500,
      body: JSON.stringify(e),
    };
  }

  const stats = statSync(outputPath);

  if (stats.size > MAX_RESPONSE_SIZE) {
    return {
      statusCode: 400,
      body: "Requested image is too large. Maximum size is 6MB.",
    };
  }

  return {
    statusCode: 200,
    headers: {
      "Content-Type": `image/${imageData.args.toFormat}`,
    },
    body: readFileSync(outputPath, "base64"),
    isBase64Encoded: true,
  };
}

export const handler = builder(imageHandler);
