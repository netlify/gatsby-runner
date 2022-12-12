import type { OnBuild } from '@netlify/build'
import { existsSync } from 'fs'
import { copy, emptyDir, ensureDir, writeFile } from 'fs-extra'
import { posix as path } from 'path'
import { greenBright } from 'chalk'

export const onBuild: OnBuild = async ({ constants, netlifyConfig, utils }) => {
  const cacheDir = path.resolve(
    constants.PUBLISH_DIR,
    '..',
    '.cache',
    'caches',
    'gatsby-runner'
  )
  if (!existsSync(path.join(cacheDir, '.did-run'))) {
    console.log(
      `The build runner did not run. Please change your build command to ${greenBright`gatsby-runner`} and try again`
    )
    return
  }

  utils.status.show({
    title: '🏃 Built site with the experimental Netlify Gatsby build runner',
    summary: 'Please report any issues: https://ntl.fyi/gatsby-runner',
  })

  const functionDir = path.join(
    constants.INTERNAL_FUNCTIONS_SRC,
    'gatsby-image'
  )
  await ensureDir(functionDir)
  await emptyDir(functionDir)
  await writeFile(
    path.join(functionDir, 'gatsby-image.js'),
    `
    const {getImageHander} = require('@netlify/gatsby-runner/handler')
    module.exports = getImageHandler(__dirname)
    `
  )
  await copy(cacheDir, path.join(functionDir, 'jobs'))
  netlifyConfig.functions['gatsby-image'] = {
    node_bundler: 'nft',
    included_files: [path.join(functionDir, 'jobs', '**', '*.json')],
  }
  // Needs to go first to avoid being overridden by catchall
  netlifyConfig.redirects.unshift({
    from: '/static/:sourceDigest/:queryDigest/:filename',
    to: '/.netlify/builders/gatsby-image',
    status: 200,
  })
}
