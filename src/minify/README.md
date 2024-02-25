# @esite/minify

Optimizes esite projects by minifying HTML, JavaScript, and CSS files for public deployment.

## How to use

Install this package via `npm i @esite/minify` and make sure you have `@esite/core` installed.

## Configurations

- MinifyImages
  - Description: Toggles if images should also be minified (jpg, png, webp, gif)
  - Type: boolean
  - Optional: true
  - Default: true
- MinifyHtmlComments
  - Description: Toggles if HTML Comments should be omitted
  - Type: boolean
  - Optional: true
  - Default: true
  