# Netlify Gatsby Runner

This is an experimental build runner for Gatsby on Netlify, which can dramatically improve build times for sites with lots of images.

## Background

[Gatsby's Image CDN](https://www.netlify.com/blog/gatsby-image-cdn-on-netlify/) feature is a great way to speed up your site's build time, by deferring image processing until runtime. However it only works for images from a small number of CMS providers. Other images, particularly those sourced locally, will need to be processed at build time. This can take a very long time for large sites. This runner brings the same benefits of deferred image processing to all images, including those sourced locally. Instead of processing these images at build time, they are instead processed when first requested by a user, and then cached at the edge for subsequent requests.

## Installation

To use `gatsby-runner` you must install it as a [Netlify Build Plugin](https://docs.netlify.com/integrations/build-plugins/).

First install the package:

```shell
npm install @netlify/gatsby-runner
```

Then enable it in your `netlify.toml` (creating one if necessary):

```toml
[[plugins]]
package = "@netlify/gatsby-runner"
```

You must then change your build command from `gatsby build` to `gatsby-runner`.

## How it works

The `gatsby-runner` script wraps the `gatsby cli`, and registers as a handler for Gatsby's jobs API. It listens for image processing jobs and then, rather than processing the image, it writes the job as a JSON file to the cache. It then generates a Netlify Function called `gatsby-image`, which includes all of the code required to process the image at runtime, as well as the JSON files containing the details of the image processing job.

When a request is made for an image, it instead calls the `gatsby-image` function, which looks up the job for that image in the cache, loads the original image, and then processes and returns it. While this is slow for the first request, as the function is an [On-Demand Builder](https://docs.netlify.com/configure-builds/on-demand-builders/) that image is then cached at the edge for subsequent requests so is very fast.
