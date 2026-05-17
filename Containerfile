FROM node:25-alpine

WORKDIR /app

# Install dependencies at image-build time for a warm layer cache.
# The full source is mounted at runtime via -v, so only package files
# are copied here — node_modules end up inside the image layer and are
# available even when the host directory is mounted on top.
COPY package.json package-lock.json ./
RUN npm ci --prefer-offline

# Default command — overridden per-target in the Makefile.
CMD ["npm", "run", "dev", "--", "--host"]
