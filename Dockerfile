FROM node:20-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --legacy-peer-deps

FROM node:20-alpine AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .

ENV NEXT_TELEMETRY_DISABLED=1
# Dummy values so next build succeeds without real credentials.
# Overridden at runtime by actual env vars in Dokploy.
ENV BASE_URL=http://localhost:3000
ENV BETTER_AUTH_SECRET=build-placeholder
# Use npx next build directly to skip the postbuild db:migrate hook.
# Migrations run at container start instead.
RUN npx next build

FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 nextjs

# Next.js standalone output (includes server.js + bundled app)
COPY --from=builder /app/public ./public
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static

# Drizzle: migrations + config + envConfig for runtime db:migrate
COPY --from=builder /app/db/migrations ./db/migrations
COPY --from=builder /app/db/envConfig.ts ./db/envConfig.ts
COPY --from=builder /app/drizzle.config.ts ./drizzle.config.ts
# drizzle.config.ts imports db/schema.ts via the schema path
COPY --from=builder /app/db/schema.ts ./db/schema.ts

# drizzle-kit needs full node_modules to run migrations at startup
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./package.json

USER nextjs
EXPOSE 3000
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

CMD ["sh", "-c", "npx drizzle-kit migrate && node server.js"]
