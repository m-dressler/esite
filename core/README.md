# @esite packages

esite is a suite of tools to help you set up your website the easy way on your cloud-provider of choice (e.g. AWS or Cloudflare) with a variety of modular extensions designed to make your life easier.

## Overview

# Table of Contents
1. [How to use](#how-to-use)
2. [Cloud Adapters](#cloud-adapters)
3. [Plugins](#plugins)

## How to use

### Starter Project

You can easily create a new project using [create-esite@latest](https://www.npmjs.com/package/create-esite):

```
npm create esite@latest
```
```
pnpm create esite@latest
```

### Manual Setup

Install `@esite/core`

### Configuring your project

You'll need two things to get started:
1. a `esite.yaml` file which contains your configuration with, at minimum:
    1.   `BucketName` - the name of the bucket in you AWS account
    2.   `BucketRegion` - the AWS region the bucket's in
2. add `AWS_ACCESS_KEY_ID` and `AWS_SECRET_ACCESS_KEY` to your environment variables
   1.  easiest via a `.env` file at the project root

## Plugins

Here are available plugins:

- [@esite/preview](https://www.npmjs.com/package/@esite/preview): Allows previewing the project locally
- [@esite/minify](https://www.npmjs.com/package/@esite/minify): Minifies HTML, JS, and CSS optimizing storage and faster delivery
- [@esite/typescript](https://www.npmjs.com/package/@esite/typescript): Transpiles typescript files to javascript 
- [@esite/scss](https://www.npmjs.com/package/@esite/scss): Compiles .scss files to css
- [@esite/encrypt](https://www.npmjs.com/package/@esite/encrypt): Allows content encryption to securely deploy secret content on a static website
- [@esite/cache-bust](https://www.npmjs.com/package/@esite/cache-bust): Use hashes to avoid stale browser caches (cache-busting)
- [@esite/sass](https://www.npmjs.com/package/@esite/sass): Compiles sass/scss into plain css
