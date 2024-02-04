# @awsw/cache-bust

Use [cache-busting](https://www.keycdn.com/support/what-is-cache-busting) to ensure browser cache never serves outdated files.

## How to use

Ensure you have `@awsw/core` installed and add `"cache-bust"` to the `Modules` to your `aws-website-config.yaml` .

Wherever you would like to use cache-busting, simply add `[AWSW_CACHE_BUST]` which @awsw/cache-bust will automatically replace with the file.

Example:

```
<html>
  <head>
    <link rel="stylesheet" href="/style.css?v=[AWSW_CACHE_BUST]" />
  </head>
</html>
```

## Configurations

- CacheBustToken
  - Description: Specify the token that should be replaced with the file hash to cache-bust
  - Type: string
  - Optional: true
  - Default: `"[AWSW_CACHE_BUST]"`