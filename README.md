# @awsw packages

AWSW stands for AWS Website and allows you to easily manage an S3 + Cloudfront hosted static website and even provides packages to allow semi-safe dynimaic features using encrypted AWS roles.

The package is highly modularized to enable you to pick and choose those modules that you truly need.

Below is a breakdown of all the modules that are available.

## @awsw/core

This is the main module that enables you to easily publish an entire folder structure to aws S3 and refresh the cache in Cloudfront thereby making a lot easier to publish changes of your website.

## @awsw/preview

A simple wrapper to liveserver that enables you to preview the result of your website while working on it.