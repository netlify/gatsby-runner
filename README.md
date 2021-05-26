# gatsby-runner

Build runner for Gatsby. Used to enable lazy image processing. Registers as a handler for Gatsby's jobs API, and listens for image processing jobs. Then, rather t6han processing the image, ir writes the job as a JSON file to the cache.

Writes jobs to `.cache/caches/gatsby-runner`, with a filename based on the generated URL, e.g. the image `static/xxx/yyy/image.png` is written to `.cache/caches/gatsby-runner/xxx/yyy.json`. This can then be read at runtime by an image processing function.

To use this, replace `gatsby build` in your build command, with `gatsby-runner`. It passes through any other options.
