import { builder, HandlerEvent } from '@netlify/functions'
import { processFile } from 'gatsby-plugin-sharp/process-file'
import path, { join, resolve } from 'path'
import { createWriteStream, existsSync, readFileSync, statSync } from 'fs'
import http from 'http'
import https from 'https'
import { pipeline } from 'stream'
import { promisify } from 'util'
import { tmpdir } from 'os'
import { ensureDir, readJson } from 'fs-extra'

const streamPipeline = promisify(pipeline)

const downloadingFiles = new Map<string, Promise<void>>()

const downloadFile = async (
  url: string,
  destination: string
): Promise<void> => {
  console.log(`Downloading ${url} to ${destination}`)

  if (downloadingFiles.has(url)) {
    return downloadingFiles.get(url)
  }
  const httpx = url.startsWith('https') ? https : http

  const promise = new Promise<void>((resolve, reject) => {
    const onError = (error: Error) => {
      console.log(`Error downloading ${url}`, error)
      downloadingFiles.delete(url)
      reject(error)
    }

    const req = httpx.get(url, { timeout: 10000 }, (response) => {
      if (response.statusCode < 200 || response.statusCode > 299) {
        downloadingFiles.delete(url)
        reject(
          new Error(
            `Failed to download ${url}: ${response.statusCode} ${
              response.statusMessage || ''
            }`
          )
        )
        return
      }
      const fileStream = createWriteStream(destination)
      streamPipeline(response, fileStream).then(resolve).catch(onError)
    })
    req.on('error', onError)
  })
  downloadingFiles.set(url, promise)
  return promise
}

// 6MB is hard max Lambda response size
const MAX_RESPONSE_SIZE = 6291456

async function imageHandler(event: HandlerEvent) {
  const url = new URL(event.rawUrl)
  console.log(`[${event.httpMethod}] ${url.pathname}`)
  const [, , fileHash, queryHash] = url.pathname.split('/')
  let imageData
  const dataFile = resolve(process.cwd(), `jobs/${fileHash}/${queryHash}.json`)
  console.log('DATA FILE TO RETRIEVE', dataFile)
  if (!existsSync(dataFile)) {
    console.log(`Data file ${dataFile} does not exist`)
    return {
      statusCode: 404,
      body: 'Not found',
    }
  }
  console.log('READING JSON')
  try {
    imageData = await readJson(dataFile)
  } catch (e) {
    console.error(e)
    return {
      statusCode: 404,
      body: 'Not found',
    }
  }

  const originalImageURL = new URL(
    `/static/${imageData.sourceImage}`,
    url
  ).toString()

  console.log('Downloading original image', originalImageURL)

  const tmp = tmpdir()

  const targetFile = join(tmp, imageData.sourceImage)
  await ensureDir(path.dirname(targetFile))
  await downloadFile(originalImageURL, targetFile)

  const outputPath = path.join(
    tmp,
    'out',
    fileHash,
    `${queryHash}${imageData.args.toFormat}`
  )

  try {
    await processFile(
      targetFile,
      [
        {
          outputPath,
          args: imageData.args,
        },
      ],
      imageData.options
    )
  } catch (e) {
    console.error(e)
    return {
      headers: {
        'Content-Type': `application/json`,
      },
      statusCode: 500,
      body: JSON.stringify(e),
    }
  }

  const stats = statSync(outputPath)

  if (stats.size > MAX_RESPONSE_SIZE) {
    return {
      statusCode: 400,
      body: 'Requested image is too large. Maximum size is 6MB.',
    }
  }

  return {
    statusCode: 200,
    headers: {
      'Content-Type': `image/${imageData.args.toFormat}`,
    },
    body: readFileSync(outputPath, 'base64'),
    isBase64Encoded: true,
  }
}

export const handler = builder(imageHandler)
