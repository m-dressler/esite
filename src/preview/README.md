# @esite/preview

Enables esite projects to be previewed in the browser.

## How to use

Ensure you have `@esite/core` installed.

Add a command `"preview": "esite-preview"` to your package.json scripts and 

In your `esite.yaml` you can specify the following keys:

```
PreviewPort: number = 8080
ErrorDocument: string = /error.html
```

Finally, run `npm run preview` to start the preview server.