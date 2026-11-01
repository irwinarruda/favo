# favo

favo (honeycomb, in Portuguese and Italian) keeps several AI subscriptions on one computer, and on every computer you own, without logging in and out.

```sh
npm install --global favo-cli
favo
```

Or run it once with `npx favo-cli`. The package is `favo-cli` and the command is `favo`. The `favo` package on npm is someone else's.

## What the first run does

This package is a small launcher with no dependencies and no install scripts. The first time you run it, it downloads about 40 MB from [GitHub Releases](https://github.com/irwinarruda/favo-cli/releases), checks it against the `SHA256SUMS` that ships inside this npm package, and keeps the binary in `~/.favo/runtime/<version>/`. Later runs start that binary directly, with no network. Set `FAVO_HOME` to use another folder that only you can write to: favo won't run a version folder that is a symlink or belongs to another user.

It runs on macOS (Apple Silicon and Intel), Linux (x64 and arm64, glibc only) and Windows (x64). Alpine and other musl systems aren't supported yet. It needs Node 20.11 or newer.

## More

The source, documentation and issues are at <https://github.com/irwinarruda/favo-cli>. favo is MIT licensed, and `THIRD-PARTY-NOTICES.md` lists what its binaries contain.
