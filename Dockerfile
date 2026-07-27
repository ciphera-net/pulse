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
# based on github.ref — see .github/workflows/build-and-push.yml.
ARG NEXT_PUBLIC_API_URL
ARG NEXT_PUBLIC_ID_URL
ARG NEXT_PUBLIC_APP_URL
ARG NEXT_PUBLIC_ID_API_URL
ARG NEXT_PUBLIC_CAPTCHA_API_URL
ARG NEXT_PUBLIC_CHARGEBEE_SITE
ARG NEXT_PUBLIC_CHARGEBEE_PUBLISHABLE_KEY
ARG NEXT_PUBLIC_CDN_URL
ENV NEXT_PUBLIC_API_URL=${NEXT_PUBLIC_API_URL}
ENV NEXT_PUBLIC_ID_URL=${NEXT_PUBLIC_ID_URL}
ENV NEXT_PUBLIC_APP_URL=${NEXT_PUBLIC_APP_URL}
ENV NEXT_PUBLIC_ID_API_URL=${NEXT_PUBLIC_ID_API_URL}
ENV NEXT_PUBLIC_CAPTCHA_API_URL=${NEXT_PUBLIC_CAPTCHA_API_URL}
ENV NEXT_PUBLIC_CHARGEBEE_SITE=${NEXT_PUBLIC_CHARGEBEE_SITE}
ENV NEXT_PUBLIC_CHARGEBEE_PUBLISHABLE_KEY=${NEXT_PUBLIC_CHARGEBEE_PUBLISHABLE_KEY}
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
# 1280 -> 2560 on 27-07-2026, with the pool on 4 x standard.large and this step's
# ceiling raised 3Gi -> 4Gi (.woodpecker/build.yml, push.yml). 1280 was chosen to
# survive a 1536Mi/3Gi ceiling on a 3411 MiB node; it is not a property of the
# build. More heap means less GC pressure and a faster `next build`.
#
# ⚠️ THE TWO NUMBERS ARE COUPLED. If this ever fails with "JavaScript heap out of
# memory", raising it ALONE is wrong — the pod is then simply killed at the cgroup
# boundary instead. Raise this and the 4Gi ceiling together, and keep the ceiling
# under the smallest measured free-memory slot across the pool (4410 MiB today).
ENV NODE_OPTIONS=--max-old-space-size=2560

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
