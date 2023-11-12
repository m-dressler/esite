# @awsw/preview

Enables awsw projects to be previewed in the browser.

## How to use

Ensure you have `@awsw/core` installed.

Add a command `"preview": "awsw-preview"` to your package.json scripts and 

In your `aws-website-config.yaml` you can specify the following keys:

```
PreviewPort: number = 8080
ErrorDocument: string = /error.html
```

Finally, run `npm run preview` to start the preview server.