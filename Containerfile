# Playwright's official image: Chromium and its system libraries are already
# installed, which node:alpine cannot provide (Playwright publishes no Alpine
# browser builds, so `make test` could never launch a browser there).
# Keep this tag in step with the @playwright/test version in package-lock.json —
# Playwright refuses to run against a browser build it did not ship with.
FROM mcr.microsoft.com/playwright:v1.62.1-noble

WORKDIR /app

# Install dependencies at image-build time for a warm layer cache.
# The full source is mounted at runtime via -v, so only package files
# are copied here — node_modules end up inside the image layer and are
# available even when the host directory is mounted on top.
COPY package.json package-lock.json ./
RUN npm ci --prefer-offline

# Default command — overridden per-target in the Makefile.
CMD ["npm", "run", "dev", "--", "--host"]
