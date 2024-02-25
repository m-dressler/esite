# @esite/deploy-s3

Deploys your build to S3 and optionally also connects to your Cloudfront to update the cache.

## How to use

Install this package via `npm i @esite/deploy-s3` and make sure you have `@esite/core` installed.

You'll need to make make `AWS_ACCESS_KEY_ID` and `AWS_SECRET_ACCESS_KEY` available in your environment variables. This package has [dotenv](https://npmjs.com/package/dotenv) installed, so the easiest way is to create a `.env` file at the root of your project.

## Configurations

- BucketName
  - Description: The name of your bucket in your S3 console
  - Type: string
  - Optional: false
- BucketRegion
  - Description: The region your bucket is in
  - Type: string
  - Optional: false
- BucketPath
  - Description: The region your bucket is in
  - Type: string
  - Optional: true
  - Default: "/"
- CloudfrontId
  - Description
  - Optional: true
  - Default: "__NONE__"