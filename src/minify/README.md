# @esite/minify

Optimizes esite projects by minifying HTML, JavaScript, and CSS files for public deployment.

## How to use

Ensure you have `@esite/core` installed and add `"minify"` to the `Modules` to your `esite.yaml` .

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
  