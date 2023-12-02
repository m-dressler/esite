# @awsw/core

A utility to manage and publish a (static) HTML website to S3 and invalidating the CloudFront cache. The @awsw scope also has an extended array of plugins (see [Plugins](#plugins)) 

## Overview

# Table of Contents
1. [How to use](#how-to-use)
2. [Plugins](#plugins)

## How to use

### Starter Project

You can easily create a new project using [@awsw/starter](https://www.npmjs.com/package/@awsw/starter):

```
npx create-aws-website
```
```
pnpm exec create-aws-website
```

### Manual Setup

Install `@awsw/core`

### Configuring your project

You'll need two things to get started:
1. a `aws-website-config.yaml` file which contains your configuration with, at minimum:
    1.   `BucketName` - the name of the bucket in you AWS account
    2.   `BucketRegion` - the AWS region the bucket's in
2. add `AWS_ACCESS_KEY_ID` and `AWS_SECRET_ACCESS_KEY` to your environment variables
   1.  easiest via a `.env` file at the project root

## Plugins

Here are available plugins:

- [@awsw/preview](https://www.npmjs.com/package/@awsw/preview): Allows previewing the project locally
- [@awsw/git](https://www.npmjs.com/package/@awsw/git): Uses git to keep track of changes and prevent unnecessary uploads (faster & cheaper)
- [@awsw/minify](https://www.npmjs.com/package/@awsw/minify): Minifies HTML, JS, and CSS optimizing storage and faster delivery
- [@awsw/typescript](https://www.npmjs.com/package/@awsw/typescript): Transpiles typescript files to javascript 
- [@awsw/scss](https://www.npmjs.com/package/@awsw/scss): Compiles .scss files to css
- [@awsw/encrypt](https://www.npmjs.com/package/@awsw/encrypt): Allows content encryption to securely deploy secret content on a static website
 