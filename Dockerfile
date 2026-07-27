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
