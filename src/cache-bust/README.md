# @esite/cache-bust

Use [cache-busting](https://www.keycdn.com/support/what-is-cache-busting) to ensure browser cache never serves outdated files.

## How to use

Install this package via `npm i @esite/cache-bust` and make sure you have `@esite/core` installed.

Wherever you would like to use cache-busting, simply add `[CACHE_BUST]` or `[CACHE_BUST=<PATH_TO_TARGET_FILE>]` which @esite/cache-bust will automatically replace with the target's hash value.

Important! Omitting the `=<PATH_TO_TARGET_FILE>` part matches the section between the first (`"`, `'`, \`, or `=`) and a `?`. This simplifies working with HTML attributes but means the path must be preceded by any of the four opening tokens, NOT include any of the tokens in the path, AND the `[CACHE_BUST]` token must be preceded by a `?` query parameter character.

Example:

```
<html>
  <head>
    <link rel="stylesheet" href="/style.css?v=[CACHE_BUST]" />
    <link rel="stylesheet" href="/script.js?v=[CACHE_BUST=/script.js]" />
  </head>
</html>
```

## Configurations

- CacheBustToken
  - Description: Specify the token that should be replaced with the file hash to cache-bust
  - Type: string
  - Optional: true
  - Default: `"CACHE_BUST"`