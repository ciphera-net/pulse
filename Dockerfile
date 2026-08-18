# Stage 1: dependencies
FROM node:20-alpine AS deps
RUN apk add --no-cache libc6-compat
WORKDIR /app
COPY package.json package-lock.json* ./
# kaniko has NO BuildKit `--mount=type=secret`, so the npm credential is COPY'd
# in instead of mounted. This is safe because this is NOT the final stage —
# kaniko publishes only the last stage, so /root/.npmrc never reaches the shipped
# image — and it is deleted in the same layer that uses it.
# ⚠️ If this stage is ever made the FINAL stage, the token ships. Check before
# reordering stages.
# ⚠️ .npmrc-ci is written by the `write-npmrc` / `write-npmrc-pr` steps in
# .woodpecker/build.yml, so it always exists in CI. A local `docker build` needs
# the file present too (`touch .npmrc-ci` if you only need public packages).
COPY .npmrc-ci /root/.npmrc
RUN npm ci --prefer-offline --no-audit --progress=false \
 && rm -f /root/.npmrc

# Stage 2: builder
FROM node:20-alpine AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .

# NEXT_PUBLIC_* values must be present at build time — Next.js inlines them
# into the client bundle during `next build`. Runtime env vars in Dokploy have
# no effect on the client bundle, so we pass them as Docker build args here.
# scripts/validate-env.mjs (wired into package.json prebuild) hard-fails the
# build if any required var is missing.
#
# Prod vs staging differences (API_URL, APP_URL) are set by the CI workflow
# based on the branch — see .woodpecker/build.yml and .woodpecker/push.yml.
# (GitHub Actions was retired estate-wide on 10-07-2026; this repo builds on
# Woodpecker at ci.ciphera.net.)
ARG NEXT_PUBLIC_API_URL
ARG NEXT_PUBLIC_ID_URL
ARG NEXT_PUBLIC_APP_URL
ARG NEXT_PUBLIC_ID_API_URL
ARG NEXT_PUBLIC_CAPTCHA_API_URL
ARG NEXT_PUBLIC_CDN_URL
# /_next/static/* is served from its own CDN zone so a build's chunks outlive the build
# (next.config.ts explains why). ⚠️ MUST be a BUILD arg, not runtime env: Next.js inlines
# assetPrefix into the emitted HTML at `next build`. An unset value degrades safely to
# same-origin assets — and the deploy pipeline asserts the live HTML actually references
# the CDN, so a missing arg is caught rather than shipped silently.
ARG NEXT_PUBLIC_ASSET_PREFIX
ENV NEXT_PUBLIC_ASSET_PREFIX=${NEXT_PUBLIC_ASSET_PREFIX}
ENV NEXT_PUBLIC_API_URL=${NEXT_PUBLIC_API_URL}
ENV NEXT_PUBLIC_ID_URL=${NEXT_PUBLIC_ID_URL}
ENV NEXT_PUBLIC_APP_URL=${NEXT_PUBLIC_APP_URL}
ENV NEXT_PUBLIC_ID_API_URL=${NEXT_PUBLIC_ID_API_URL}
ENV NEXT_PUBLIC_CAPTCHA_API_URL=${NEXT_PUBLIC_CAPTCHA_API_URL}
ENV NEXT_PUBLIC_CDN_URL=${NEXT_PUBLIC_CDN_URL}
ENV NEXT_TELEMETRY_DISABLED=1
ENV NODE_ENV=production

# 🔴 CAP V8's HEAP. KEEP THIS FLAG — IT IS MORE NECESSARY ON BIG NODES, NOT LESS.
#
# V8 sizes its old-space from TOTAL MACHINE MEMORY, not from the container's cgroup
# limit. That is the whole reason this line exists, and it is why deleting it when
# the nodes got BIGGER would be a bug rather than a cleanup:
#   on a 4 GiB standard.medium an uncapped V8 self-selects ~2 GiB of old space
#   on an 8 GiB standard.large  an uncapped V8 self-selects ~4 GiB of old space
# i.e. an uncapped build grows to fill whatever node it lands on and would blow the
# pod ceiling on the larger node it was supposed to be comfortable on.
#
# ⚠️ THIS FLAG CAPS OLD SPACE ONLY. Process RSS = old space + new space + code +
# native allocations, and this pod holds kaniko too, so RSS lands well above this
# number. Measured 27-07-2026: heap 896 -> RSS 1401 MiB; heap 1280 -> RSS 2229 MiB.
# Raising the heap by 384 MB raised RSS by 647 MB — V8 expands to fill what it is
# allowed, so budget roughly 1.7x any increase, not 1.0x.
#
# 🔴 1280 -> 2560 -> BACK TO 1280, all on 27-07-2026. MEASURED, NOT REASONED.
#
# When the pool moved to 4 x standard.large this was raised to 2560 on the theory
# that more heap = less GC pressure = a faster `next build`. The very next build
# peaked at **4042 MiB against its 4096 MiB (4Gi) ceiling** — it completed, by
# 54 MiB. That is not headroom, that is luck, and it would have become a flaky
# OOM-kill the first time a dependency grew.
#
# The arithmetic was already on this page and it predicted this: +384 MB of heap
# had cost +647 MB of RSS (~1.7x), so +1280 MB predicted ~+2150 MB on top of the
# 2229 MiB baseline. Observed +1813 MB. The heap raise — not the kaniko change
# shipped alongside it — is what consumed the margin.
#
# ⚠️ THE CEILING CANNOT ABSORB IT, SO THE HEAP MUST COME DOWN. 4Gi is pinned by
# fragmentation, not by preference: 4096 MiB fits on ALL FOUR nodes, while 5Gi
# (5120 MiB) fits on exactly ONE (measured free/node is 4410-5256 MiB). Raising
# the ceiling to buy heap room would re-create the single-eligible-node problem
# the pool migration existed to remove. So 1280 — the known-good value, measured
# green at 2229 MiB — stays, now against a 4Gi ceiling instead of 3Gi, which is
# where the real margin comes from.
#
# ⚠️ THE TWO NUMBERS ARE COUPLED. If this ever fails with "JavaScript heap out of
# memory", raising it ALONE is wrong — the pod is then simply killed at the cgroup
# boundary instead. Raise this and the ceiling together, and keep the ceiling
# under the smallest measured free-memory slot across the pool (4410 MiB today).
ENV NODE_OPTIONS=--max-old-space-size=1280

# prebuild runs validate:env + generate:integrations, then next build --webpack
RUN npm run build

# Stage 3: runtime
FROM node:20-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

ARG NEXT_PUBLIC_CDN_URL
ENV NEXT_PUBLIC_CDN_URL=${NEXT_PUBLIC_CDN_URL}

# Create a non-root user
RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 nextjs

# Copy the Next.js standalone output
COPY --from=builder --chown=nextjs:nodejs /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

USER nextjs

EXPOSE 3000

CMD ["node", "server.js"]
