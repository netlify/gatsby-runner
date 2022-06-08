#!/usr/bin/env node

import execa from 'execa'
import path from 'path'
import fastq from 'fastq'
import { writeJSON, ensureDir, copy, writeFile, readJSON } from 'fs-extra'
import { cpuCoreCount } from 'gatsby-core-utils'
import { green } from 'chalk'
import { randomBytes } from 'crypto'
import { existsSync } from 'fs'
import { stripIndent } from 'common-tags'

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

/**
 * We do this to avoid creating a different dir each time we run the build
 */
async function getOriginalsDir(cacheDir: string) {
  await ensureDir(cacheDir)
  const metadataFile = path.join(cacheDir, 'metadata.json')
  if (existsSync(metadataFile)) {
    const metadata = await readJSON(metadataFile)
    if (metadata.originalsDir) {
      return metadata.originalsDir
    }
  }
  const originalsDir = path.join(
    'gatsby-image-originals',
    randomBytes(32).toString('hex')
  )
  await writeJSON(metadataFile, {
    originalsDir,
  })
  return originalsDir
}

async function run() {
  let imageCount = 0
  let origCount = 0
  let gatsbyCli: string
  const copyingFiles = new Map<string, Promise<void>>()
  console.log(`Building site with the ${green`Netlify Gatsby build runner`}.`)

  try {
    gatsbyCli = require.resolve('gatsby/cli', { paths: [process.cwd()] })
  } catch (e) {
    console.error('Gatsby path not found', e)
    return
  }

  let GATSBY_CPU_COUNT = process.env.GATSBY_CPU_COUNT

  // If running in Netlify, set the default cpu count to physical cores - 2.
  // This value has been tested and gives best peformance for most scenarios.
  if (!GATSBY_CPU_COUNT && process.env.NETLIFY && !process.env.NETLIFY_LOCAL) {
    const reportedCores = cpuCoreCount(true)
    GATSBY_CPU_COUNT = Math.max(reportedCores - 2, 2).toString()
  }
  const cores = cpuCoreCount()

  const [, , ...args] = process.argv

  const cacheDir = path.join(process.cwd(), '.cache', 'caches', 'gatsby-runner')

  const originalsDir = await getOriginalsDir(cacheDir)

  await ensureDir(cacheDir)
  const gatsbyProcess = execa.node(gatsbyCli, ['build', ...args], {
    env: {
      ENABLE_GATSBY_EXTERNAL_JOBS: '1',
      FORCE_COLOR: '1',
      GATSBY_CPU_COUNT,
    },
  })
  // Pass through the logs
  gatsbyProcess.stdout.pipe(process.stdout)

  async function handleImage({
    outputDir,
    inputPaths: { 0: inputPath },
    args,
  }) {
    const fileHash = path.basename(outputDir)
    const jobDirname = path.join(cacheDir, fileHash)

    const inputFileDir = path.join(
      path.dirname(outputDir),
      originalsDir,
      fileHash
    )

    const originalImage = `${inputPath.contentDigest}${path.extname(
      inputPath.path
    )}`

    const originalFilename = path.join(inputFileDir, originalImage)

    const jobData = {
      sourceImage: `${originalsDir}/${fileHash}/${originalImage}`,
      pluginOptions: args.pluginOptions,
    }
    let promise = copyingFiles.get(originalFilename)
    if (promise) {
      await promise
    } else {
      origCount++
      try {
        promise = copy(inputPath.path, originalFilename)
        copyingFiles.set(originalFilename, promise)
        console.log(`Copying ${inputPath.path} to ${originalFilename}`)

        await promise
      } catch (e) {
        console.error(`Error copying ${inputPath.path} to ${originalFilename}`)
      }
    }

    await ensureDir(jobDirname)
    imageCount++
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

  const queue = fastq.promise(handleImage, cores)

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
        // console.log('Ignoring', message.type)
      }
    }
  }

  gatsbyProcess.on('exit', async (code) => {
    if (code !== 0) {
      console.log('Gatsby exited with code', code)
      process.exit(code)
    }
    console.log(
      `Deferred processing ${imageCount} image${
        imageCount === 1 ? '' : 's'
      } until runtime. Moved ${origCount} originals`
    )

    console.log(
      stripIndent`
      Built site using the experimental ${green`Netlify Gatsby build runner`}. 
      Please report any issues: https://ntl.fyi/gatsby-runner
      `
    )
    await ensureDir(cacheDir)
    await writeFile(path.join(cacheDir, '.did-run'), '')

    process.exit(code)
  })

  gatsbyProcess.on('message', messageHandler)
}

try {
  run()
} catch (e) {
  console.error(e)
}
