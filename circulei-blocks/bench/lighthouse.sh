#!/bin/bash
# Lighthouse mobile, both versions, 3 runs per page. METHOD=devtools for real network/CPU throttling
# (the default, simulate, models the trace of a fast load and misplaces deferred hydration).
# Summarize with: python3 bench/sum.py <out dir>
export CHROME_PATH="${CHROME_PATH:-/Applications/Google Chrome.app/Contents/MacOS/Google Chrome}"
A=https://decoindex-circulei.deco-ceo.workers.dev; B=https://decoindex-circulei-blocks.deco-ceo.workers.dev
OUT=${OUT:-lh}; METHOD=${METHOD:-simulate}; mkdir -p "$OUT"
for p in "/?cidade=curitiba&utm_source=test" "/p/364956487?utm_source=test" "/seja-locadora?utm_source=test"; do
  for name in worker tanstack; do
    U=$A; [ $name = tanstack ] && U=$B
    for r in 1 2 3; do
      npx -y lighthouse@12 "$U$p" --only-categories=performance --throttling-method=$METHOD --output=json \
        --output-path="$OUT/lh-$name-$(echo "$p" | tr -c 'a-z0-9' '_')-$r.json" --quiet --chrome-flags="--headless=new" >/dev/null 2>&1
    done
  done
done
