# @esite/encrypt

Enables esite projects to encrypt local plaintext to upload sensitive information to a public website.
The content is encrypted with a randomly generated IV prepended to the text and using crypto's AES-CBC mode.

! IMPORTANT ! I did a fair share of research around encryption but am not an expert. To my knowledge there are no issues with how this is implemented, but use at your own risk!

## How to use

Install this package via `npm i @esite/encrypt` and make sure you have `@esite/core` installed.

For every folder (recursively) where you want the content to be encrypted, add an `.esite-encrypt` file to the root of the folder. During the build step, every file in that folder (recursively) will now be replaced.

## Configurations

- EncryptionKey
  - Description: The Base64 encoded key that you want to use to encrypt files
  - Type: string
  - Optional: false