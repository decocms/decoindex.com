#!/bin/bash
# Server timing: N sequential warm requests per page, median and p90 of TTFB, plus compressed HTML bytes.
A=https://decoindex-circulei.deco-ceo.workers.dev; B=https://decoindex-circulei-blocks.deco-ceo.workers.dev
N=${N:-30}
for p in "/?cidade=curitiba" "/seja-locadora" "/p/364956487"; do
  for name in worker tanstack; do
    U=$A; [ $name = tanstack ] && U=$B
    curl -s -o /dev/null -A "Mozilla/5.0 decoshop-dev bench" "$U$p" # warm
    for i in $(seq 1 $N); do curl -s -o /dev/null -H "accept-encoding: br, gzip" -A "Mozilla/5.0 decoshop-dev bench" -w "%{time_starttransfer} %{size_download}\n" "$U$p"; done | sort -n | awk -v n=$N -v name=$name -v p="$p" '{t[NR]=$1; s=$2} END {printf "%-20s %-9s ttfb p50 %4.0fms p90 %4.0fms  html %5.1f KB (comprimido)\n", p, name, t[int(n*0.5)]*1000, t[int(n*0.9)]*1000, s/1024}'
  done
done
