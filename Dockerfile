# 🔴 THIS IMAGE IS ASSEMBLED, NOT COMPILED (21-08-2026).
#
# `next build` used to run HERE, in a `builder` stage. It now runs in an ordinary
# Woodpecker step (`next-build` in .woodpecker/) and this Dockerfile only COPYs the
# artefacts it produced. Migration phase 4 of
# Infra/docs/plans/20-08-2026-buildkit-rootless-migration.md.
#
# WHY THE COMPILE MOVED OUT:
#   Since the kaniko -> BuildKit migration, an image build runs inside a SHARED
#   daemon (`buildkitd`, ns `buildkit`) used by every repo in the estate. Measured
#   21-08: one Next.js compile takes that daemon from ~850Mi idle to 2.4-2.9Gi
#   against a 4Gi limit. Two concurrent frontend builds would OOM it — and an OOM
#   of the daemon kills EVERY in-flight build in the estate, not just this one.
#   Measured after this change on help-frontend: daemon peak 2456Mi -> 1241Mi, and
#   the image step 51s -> 6s.
#
# ⚠️ CONSEQUENCE FOR LOCAL BUILDS: `docker build .` no longer works from a clean
#   checkout — `.next/standalone` will not exist. Run `npm ci && npm run build`
#   first, exactly as CI does.
#
# ⚠️ MOST NEXT_PUBLIC_* MOVED to the `next-build` STEP's `environment:`, because
#   Next.js inlines them during `next build` and that is now the only place they
#   can reach the bundle.
#   🔑 NEXT_PUBLIC_CDN_URL BELOW IS DELIBERATELY STILL A BUILD ARG. It also
#   populates a RUNTIME env var in this stage, which `lib/cdn.ts` reads
#   (`process.env.NEXT_PUBLIC_CDN_URL || ''`). That `|| ''` fails OPEN: an unset
#   value yields relative paths — a working-looking site serving wrong URLs. Do not
#   "tidy" this ARG away along with the others.
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
COPY --chown=nextjs:nodejs public ./public
COPY --chown=nextjs:nodejs .next/standalone ./
COPY --chown=nextjs:nodejs .next/static ./.next/static

USER nextjs

EXPOSE 3000

CMD ["node", "server.js"]
