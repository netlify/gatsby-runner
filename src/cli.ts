#!/usr/bin/env node

import execa from 'execa'
import path from 'path'
import fastq from 'fastq'
import { writeJSON, ensureDir, copySync } from 'fs-extra'

const MESSAGE_TYPES = {
  LOG_ACTION: `LOG_ACTION`,
  JOB_CREATED: `JOB_CREATED`,
  JOB_COMPLETED: `JOB_COMPLETED`,
  JOB_FAILED: `JOB_FAILED`,
  ACTIVITY_START: `ACTIVITY_START`,
  ACTIVITY_END: `ACTIVITY_END`,
  ACTIVITY_SUCCESS: `ACTIVITY_SUCCESS`,
  ACTIVITY_ERROR: `ACTIVITY_ERROR`,
}

async function run() {
  let gatsbyCli: string
  try {
    gatsbyCli = require.resolve('gatsby/cli', { paths: [process.cwd()] })
  } catch (e) {
    console.error('Gatsby path not found', e)
    return
  }

  const [, , ...args] = process.argv

  const cacheDir = path.join(process.cwd(), '.cache', 'caches', 'gatsby-runner')
  const gatsbyProcess = execa.node(gatsbyCli, ['build', ...args], {
    env: {
      ENABLE_GATSBY_EXTERNAL_JOBS: '1',
      FORCE_COLOR: '1',
    },
  })

  gatsbyProcess.stdout.pipe(process.stdout)

  async function handleImage({
    outputDir,
    inputPaths: { 0: inputPath },
    args,
  }) {
    await ensureDir(cacheDir)

    const jobDirname = path.join(cacheDir, path.basename(outputDir))
    const originalImage = `${inputPath.contentDigest}${path.extname(
      inputPath.path
    )}`
    const originalFilename = path.join(outputDir, 'original', originalImage)

    const jobData = {
      originalImage,
      pluginOptions: args.pluginOptions,
    }
    try {
      // Async caused race condition errors
      copySync(inputPath.path, originalFilename)
    } catch (e) {
      console.error('error copying', inputPath.path, 'to', originalFilename, e)
    }
    await ensureDir(jobDirname)

    await Promise.all(
      args.operations.map((image) => {
        const [hash] = image.outputPath.split('/')
        writeJSON(path.join(jobDirname, `${hash}.json`), {
          ...jobData,
          args: image.args,
        })
      })
    )
  }

  const queue = fastq.promise(handleImage, 10)

  async function messageHandler(message) {
    switch (message.type) {
      case MESSAGE_TYPES.JOB_CREATED: {
        if (message.payload.name !== 'IMAGE_PROCESSING') {
          gatsbyProcess.send({
            type: `JOB_NOT_WHITELISTED`,
            payload: { id: message.payload.id },
          })
          return
        }
        try {
          queue.push(message.payload).then(() =>
            gatsbyProcess.send({
              type: `JOB_COMPLETED`,
              payload: {
                id: message.payload.id,
                result: {},
              },
            })
          )
        } catch (error) {
          console.error('job failed', error)
          gatsbyProcess.send({
            type: `JOB_FAILED`,
            payload: { id: message.payload.id, error: error.toString() },
          })
        }

        break
      }

      default: {
        console.log('Ignoring', message.type)
      }
    }
  }

  gatsbyProcess.on('exit', async (code) => {
    console.log('Gatsby exited with code', code)
    process.exit(code)
  })

  gatsbyProcess.on('message', messageHandler)
}

try {
  run()
} catch (e) {
  console.error(e)
}
