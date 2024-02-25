# @esite/preview

Enables esite projects to be previewed in the browser.

## How to use

Install this package via `npm i @esite/preview` and make sure you have `@esite/core` installed.

Add a command `"preview": "esite-preview"` to your package.json scripts and run `npm run preview` to start the preview server.

## Configurations

- PreviewPort
  - Description: The port to run the preview server on
  - Type: number
  - Optional: true
  - Default: 8080
- ErrorDocument
  - Description: The document to serve when an item is not found
  - Type: string
  - Optional: true
  - Default: "/error.html"
  