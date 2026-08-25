FROM node:22.23.2-bookworm-slim@sha256:83f487e0a63425e5b4d146fb5e5be574bcbe1b7b843d3ebafdd95eaf7767a7e5 AS build

WORKDIR /workspace

COPY package.json package-lock.json ./
COPY tsconfig.backend.json ./
COPY apps ./apps
COPY packages ./packages

RUN npm ci --ignore-scripts
RUN npm run build --workspace=@paperbridge/worker
RUN npm prune --omit=dev

FROM node:22.23.2-bookworm-slim@sha256:83f487e0a63425e5b4d146fb5e5be574bcbe1b7b843d3ebafdd95eaf7767a7e5 AS runtime

WORKDIR /app
ENV NODE_ENV=production

COPY --from=build /workspace/node_modules ./node_modules
COPY --from=build /workspace/apps/worker/package.json ./package.json
COPY --from=build /workspace/apps/worker/dist ./dist
COPY containers/worker/healthcheck.sh /usr/local/bin/paperbridge-worker-healthcheck

USER node

STOPSIGNAL SIGTERM

HEALTHCHECK --interval=30s --timeout=3s --start-period=15s --retries=3 CMD ["sh", "/usr/local/bin/paperbridge-worker-healthcheck"]

ENTRYPOINT ["node", "--enable-source-maps", "--max-old-space-size=512"]
CMD ["dist/main.js"]
