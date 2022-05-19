import type { OnBuild } from '@netlify/build'
import { existsSync } from 'fs'
import { writeFile } from 'fs-extra'
import { posix as path } from 'path'
import { greenBright } from 'chalk'

export const onBuild: OnBuild = async ({ constants, netlifyConfig }) => {
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
  await writeFile(
    path.join(constants.INTERNAL_FUNCTIONS_SRC, 'gatsby-image.ts'),
    `export { handler } from '@netlify/gatsby-runner'`
  )
  netlifyConfig.functions['gatsby-image'] = {
    external_node_modules: [
      'keyv',
      'mozjpeg',
      'pngquant-bin',
      'gatsby-core-utils',
    ],
    included_files: [path.join(cacheDir, '**', '*.json')],
  }
  netlifyConfig.redirects.push({
    from: '/static/:sourceDigest/:queryDigest/:filename',
    to: '/.netlify/builders/gatsby-image',
    status: 200,
  })
}
