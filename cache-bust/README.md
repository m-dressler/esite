# @awsw/cache-bust

Use [cache-busting](https://www.keycdn.com/support/what-is-cache-busting) to ensure browser cache never serves outdated files.

## How to use

Ensure you have `@awsw/core` installed and add `"cache-bust"` to the `Modules` to your `aws-website-config.yaml` .

Wherever you would like to use cache-busting, simply add `[AWSW_CACHE_BUST]` or `[AWSW_CACHE_BUST=<PATH_TO_TARGET_FILE>]` which @awsw/cache-bust will automatically replace with the target's hash value.

Important! Omitting the `=<PATH_TO_TARGET_FILE>` part matches the section between the first (`"`, `'`, \`, or `=`) and a `?`. This simplifies working with HTML attributes but means the path must be preceded by any of the four opening tokens, NOT include any of the tokens in the path, AND the `[AWSW_CACHE_BUST]` token must be preceded by a `?` query parameter character.

Example:

```
<html>
  <head>
    <link rel="stylesheet" href="/style.css?v=[AWSW_CACHE_BUST]" />
    <link rel="stylesheet" href="/script.js?v=[AWSW_CACHE_BUST=/script.js]" />
  </head>
</html>
```

## Configurations

- CacheBustToken
  - Description: Specify the token that should be replaced with the file hash to cache-bust
  - Type: string
  - Optional: true
  - Default: `"AWSW_CACHE_BUST"`