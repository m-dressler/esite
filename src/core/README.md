# @esite packages

esite is a suite of tools to help you set up your website the easy way on your cloud-provider of choice (e.g. AWS or Cloudflare) with a variety of modular extensions designed to make your life easier.

## Overview

# Table of Contents
- [Overview](#overview)
- [How to use](#how-to-use)
  - [Starter Project](#starter-project)
  - [Manual Setup](#manual-setup)
- [Configuration](#configuration)
- [Deploying](#deploying)
- [Plugins](#plugins)

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

Install `@esite/core` and create a file `esite.yaml` at the root of your project which will contain your configuration (see [Configuration](#configuration))

## Configuration

Note that additional modules may specify additional configuration they need in their `README.md` file.

- SourcePath
  - Description: The folder which contains your code
  - Type: string
  - Optional: true
  - Default: "./src"
- BuildPath
  - Description: The folder where @esite builds the project in
  - Type: string
  - Optional: true
  - Default: "./build"
- RemoveHtmlExtension
  - Description: Used for deploying the application only | Strips the `.html` extension form your HTML files
  - Type: boolean
  - Optional: true
  - Default: true

## Deploying

One of the main advantages of using @esite, is that it can help you go straight from build to deploy with included deployment modules. Simply install one of the deployment modules from the list below:

- AWS S3 | [@esite/deploy-s3](https://npmjs.com/package/@esite/deploy-s3)

## Plugins

Here are available plugins:

- [@esite/preview](https://www.npmjs.com/package/@esite/preview): Allows previewing the project locally
- [@esite/minify](https://www.npmjs.com/package/@esite/minify): Minifies HTML, JS, and CSS optimizing storage and faster delivery
- [@esite/typescript](https://www.npmjs.com/package/@esite/typescript): Transpiles typescript files to javascript 
- [@esite/scss](https://www.npmjs.com/package/@esite/scss): Compiles .scss files to css
- [@esite/encrypt](https://www.npmjs.com/package/@esite/encrypt): Allows content encryption to securely deploy secret content on a static website
- [@esite/cache-bust](https://www.npmjs.com/package/@esite/cache-bust): Use hashes to avoid stale browser caches (cache-busting)
- [@esite/sass](https://www.npmjs.com/package/@esite/sass): Compiles sass/scss into plain css
