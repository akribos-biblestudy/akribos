# syntax=docker/dockerfile:1

# ---- build ------------------------------------------------------------------
FROM node:24-bookworm-slim AS build
WORKDIR /app

ENV PNPM_HOME=/pnpm CI=true
ENV PATH=$PNPM_HOME:$PATH
RUN corepack enable

# Install with the lockfile first so the dependency layer is cached independently of source changes.
# No BuildKit cache mounts: this has to build with a plain `docker build` as well, and the layer cache
# already covers the case that matters.
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc ./
RUN pnpm install --frozen-lockfile

COPY . .
RUN pnpm run build

# Reduce node_modules to production dependencies for the runtime stage. adapter-node's output still
# needs them at runtime, notably the postgres driver and the argon2 native binding.
RUN pnpm prune --prod

# ---- runtime ----------------------------------------------------------------
FROM node:24-bookworm-slim AS runtime
WORKDIR /app

# CrossWire's own reader handles the compressed zText/zCom module formats; unzip expands uploaded
# raw ZIP packages into an isolated temporary SWORD library.
#
# Debian bookworm's own `postgresql-client` is version 15, and `pg_dump`/`pg_restore` refuse to talk
# to a newer server (db is postgres:17-alpine) — hence the PGDG repository instead of the plain
# package. Do not "simplify" this back to `apt-get install postgresql-client`.
RUN apt-get update \
    && apt-get install -y --no-install-recommends diatheke unzip ca-certificates curl gnupg \
    && install -d /usr/share/postgresql-common/pgdg \
    && curl -fsSL -o /usr/share/postgresql-common/pgdg/apt.postgresql.org.asc \
         https://www.postgresql.org/media/keys/ACCC4CF8.asc \
    && echo "deb [signed-by=/usr/share/postgresql-common/pgdg/apt.postgresql.org.asc] http://apt.postgresql.org/pub/repos/apt bookworm-pgdg main" \
         > /etc/apt/sources.list.d/pgdg.list \
    && apt-get update \
    && apt-get install -y --no-install-recommends postgresql-client-17 \
    && apt-get purge -y curl gnupg && apt-get autoremove -y \
    && rm -rf /var/lib/apt/lists/*

ENV NODE_ENV=production \
    PORT=3000 \
    BODY_SIZE_LIMIT=Infinity \
    UPLOAD_DIR=/app/var/uploads \
    BACKUP_TMP_DIR=/app/var/backups

# Resource imports read the uploaded file back from disk, and backup dumps are staged before they are
# streamed to the browser or to S3, so both directories must survive restarts; both are mounted as
# volumes in compose.yaml.
RUN mkdir -p /app/var/uploads /app/var/backups && chown -R node:node /app/var

COPY --from=build --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/build ./build
COPY --from=build --chown=node:node /app/drizzle ./drizzle
COPY --from=build --chown=node:node /app/data/hebrewstrong.xml ./data/hebrewstrong.xml
COPY --from=build --chown=node:node /app/scripts/migrate.ts ./scripts/migrate.ts
COPY --from=build --chown=node:node /app/package.json ./package.json

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
    CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/healthz').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

# No USER here: the container starts as root so it can fix ownership of the mounted volumes, then
# drops to the unprivileged `node` user before running anything from the image. This matters for
# `backups` specifically — that volume is reused from the old backup sidecar (see compose.yaml),
# which wrote to it as a different user, so a fresh deploy inherits a directory `node` cannot write
# to until this runs. `chown` on the directories themselves is enough (not `-R`): creating or
# deleting entries only needs write access to the containing directory, not ownership of the files
# already in it. `setpriv` execs directly into the target process — no wrapper left as PID 1 — so
# this changes nothing about how the server receives signals once it is running.
# Migrations run in the entrypoint rather than at image build time: they need the live database.
CMD ["sh", "-c", "chown node:node /app/var/uploads /app/var/backups && exec setpriv --reuid=node --regid=node --init-groups sh -c 'node scripts/migrate.ts && exec node build/index.js'"]
