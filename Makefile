# gssk-dia — Makefile
# All npm commands run inside the Apple Container image.
# The host only needs `container` (Apple Container CLI); npm is never required locally.

# --------------------------------------------------
# Configuration
# --------------------------------------------------
CONTAINER_BIN := container
IMAGE         := gssk-dia-dev
WORKDIR       := /app

DEV_PORT      := 5173
PREVIEW_PORT  := 4173

# Non-interactive batch run (build/test/typecheck)
RUN := $(CONTAINER_BIN) run --init --rm \
	-v "$(PWD):$(WORKDIR)" \
	-w $(WORKDIR) \
	$(IMAGE)

# Interactive / long-lived run (dev server, shell)
RUN_IT := $(CONTAINER_BIN) run -it --init --rm \
	-v "$(PWD):$(WORKDIR)" \
	-w $(WORKDIR) \
	$(IMAGE)

.PHONY: all help \
	start image \
	npm-install build preview \
	dev test \
	shell clean

# --------------------------------------------------
# Default
# --------------------------------------------------
all: build ## Default: build the production bundle

# --------------------------------------------------
# Help
# --------------------------------------------------
help: ## Show available make targets
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) \
		| awk 'BEGIN {FS = ":.*?## "}; {printf "  %-20s %s\n", $$1, $$2}'

# --------------------------------------------------
# Apple Container system service
# --------------------------------------------------
start: ## Start the Apple Container system service (required once per macOS session)
	$(CONTAINER_BIN) system start

# --------------------------------------------------
# Container image
# --------------------------------------------------
image: start ## Build the gssk-dia dev container image
	$(CONTAINER_BIN) build -t $(IMAGE) -f Containerfile .

# --------------------------------------------------
# npm
# --------------------------------------------------
npm-install: image ## Install / sync npm dependencies inside the container
	$(RUN) sh -c 'npm install'

# --------------------------------------------------
# Development server  (Vite on port $(DEV_PORT))
# --------------------------------------------------
dev: image npm-install ## Start the Vite dev server on http://localhost:$(DEV_PORT)
	$(CONTAINER_BIN) run -it --init --rm \
		-v "$(PWD):$(WORKDIR)" \
		-w $(WORKDIR) \
		-p $(DEV_PORT):$(DEV_PORT) \
		$(IMAGE) sh -c 'npm run dev -- --host'

# --------------------------------------------------
# Production build
# --------------------------------------------------
build: image npm-install ## Build the production bundle into dist/
	$(RUN) sh -c 'npm run build'

# --------------------------------------------------
# Preview server  (serves dist/ on port $(PREVIEW_PORT))
# --------------------------------------------------
preview: build ## Serve the production build on http://localhost:$(PREVIEW_PORT)
	$(CONTAINER_BIN) run -it --init --rm \
		-v "$(PWD):$(WORKDIR)" \
		-w $(WORKDIR) \
		-p $(PREVIEW_PORT):$(PREVIEW_PORT) \
		$(IMAGE) sh -c 'npm run preview -- --host'

# --------------------------------------------------
# Tests  (Playwright — runs against the preview server)
# --------------------------------------------------
test: build ## Run Playwright tests (CI mode against preview server)
	$(RUN) sh -c 'CI=true npm test'

# --------------------------------------------------
# Utilities
# --------------------------------------------------
shell: image ## Open a shell inside the gssk-dia container
	$(RUN_IT) --entrypoint /bin/sh

clean: ## Remove the dist/ directory
	rm -rf dist
