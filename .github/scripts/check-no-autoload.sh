#!/usr/bin/env bash
# Fails if favo reads bunfig.toml or .env from the folder it starts in. A
# compiled Bun program does both unless scripts/build.ts turns them off, and then
# running favo inside a cloned repo runs that repo's code.
#
# Usage: check-no-autoload.sh <command that runs favo...>
set -euo pipefail

work="$(mktemp -d)"
trap 'cd / && rm -rf "${work}"' EXIT

mkdir -p "${work}/repo/planted/themes" "${work}/home"
cd "${work}/repo"

printf 'preload = ["./plant.js"]\n' > bunfig.toml
printf "require('fs').writeFileSync('bunfig-ran', 'yes');\n" > plant.js
printf 'FAVO_HOME=./planted\n' > .env
printf '{"theme":"planted"}\n' > planted/config.json
printf '{"name":"Planted","colors":{"accent":"#112233"}}\n' > planted/themes/planted.json

# A variable that is already set beats .env, so a FAVO_HOME left in the
# environment would make this pass whatever the build does. HOME is what keeps
# it away from the real ~/.favo instead.
unset FAVO_HOME
export HOME="${work}/home"

"$@" --version
if [[ -e bunfig-ran ]]; then
  echo "::error::favo ran the preload in a bunfig.toml from the folder it started in"
  exit 1
fi

# `favo theme` only reads files, so it behaves the same on every runner.
themes="$("$@" theme)"
if [[ "${themes}" == *planted* ]]; then
  echo "::error::favo took FAVO_HOME from a .env in the folder it started in"
  exit 1
fi

echo "favo ignored the bunfig.toml and .env in the folder it started in"
