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

# The GSSK kernel is a git dependency, not an npm one. Its upstream package.json
# version has never been bumped, so npm can never report it as outdated — the only
# thing that moves is the commit the lockfile pins. See GIP-0001 G0.
# In a git worktree, .git is a FILE pointing at the primary repo's .git dir, which
# lives outside $(PWD) and so outside the container mount. npm shells out to git to
# resolve the kernel ref, so that directory has to be mounted at its real path too.
GIT_COMMON_DIR := $(shell git rev-parse --path-format=absolute --git-common-dir 2>/dev/null)

GSSK_REF      := dist
GSSK_SPEC     := github:sholtomaud/GSSK\#$(GSSK_REF)

# Non-interactive batch run (build/test/typecheck)
RUN := $(CONTAINER_BIN) run --init --rm \
	-v "$(PWD):$(WORKDIR)" \
	-w $(WORKDIR) \
	$(IMAGE)

# Prints the commit package-lock.json currently pins for the kernel. The version
# field is useless here (always 1.0.0), so the resolved commit is the only signal.
gssk_pinned = sed -n '/"node_modules\/gssk"/,/^    }/p' package-lock.json \
	| sed -n 's/.*"resolved": "\(.*\)".*/\1/p'

# Batch run with git access, for dependency resolution against the kernel repo.
RUN_GIT := $(CONTAINER_BIN) run --init --rm \
	-v "$(PWD):$(WORKDIR)" \
	-v "$(GIT_COMMON_DIR):$(GIT_COMMON_DIR)" \
	-w $(WORKDIR) \
	$(IMAGE)

# The container has no SSH keys and no known_hosts, but the kernel repo is reachable
# over https. The lockfile records a git+ssh:// URL, so rewrite it for the fetch.
GIT_HTTPS := git config --global --add safe.directory "*" \
	&& git config --global url."https://github.com/".insteadOf "ssh://git@github.com/" \
	&& git config --global url."https://github.com/".insteadOf "git@github.com:"

# Interactive / long-lived run (dev server, shell)
RUN_IT := $(CONTAINER_BIN) run -it --init --rm \
	-v "$(PWD):$(WORKDIR)" \
	-w $(WORKDIR) \
	$(IMAGE)

.PHONY: all help \
	start image \
	npm-install build preview \
	dev test \
	outdated upgrade upgrade-latest \
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
# Dependency upgrade
# --------------------------------------------------
outdated: ## Show outdated dependencies, including the git-pinned kernel
	@$(RUN) sh -c 'npm outdated' || true
	@echo ""
	@echo "gssk is a git dependency ($(GSSK_SPEC)) and never appears above:"
	@echo "its upstream version string is static, so npm cannot see kernel drift."
	@printf '  pinned: '
	@$(call gssk_pinned)

upgrade: image ## Update dependencies and re-resolve the gssk kernel to the dist branch head
	@printf 'gssk before: '
	@$(call gssk_pinned)
	$(RUN_GIT) sh -c '$(GIT_HTTPS) && npm update --no-audit --no-fund'
	$(RUN_GIT) sh -c '$(GIT_HTTPS) && npm install "$(GSSK_SPEC)" --no-audit --no-fund'
	@printf 'gssk after:  '
	@$(call gssk_pinned)
	@echo ""
	@echo "Kernel logic types now installed:"
	@sed -n 's/^  \(GSSK_LOGIC_[A-Z_]*\).*/    \1/p' node_modules/gssk/include/gssk.h
	@echo ""
	@echo "A kernel major bump changes behaviour silently — run 'make build && make test'"
	@echo "and re-check GIP-0001 before trusting the result."

upgrade-latest: image ## Bump the declared ranges in package.json to latest majors, then upgrade
	@echo "This rewrites package.json ranges to the newest majors — expect breakage."
	@echo "The safe path is 'make upgrade', which stays inside the declared ranges."
	@echo ""
	@printf 'gssk before: '
	@$(call gssk_pinned)
	$(RUN_GIT) sh -c '$(GIT_HTTPS) && \
	  DEPS=$$(node -p "Object.keys({...require(\"./package.json\").dependencies, ...require(\"./package.json\").devDependencies}).filter(d => d !== \"gssk\").map(d => d + \"@latest\").join(\" \")") && \
	  echo "bumping: $$DEPS" && \
	  npm install $$DEPS --no-audit --no-fund && \
	  npm install "$(GSSK_SPEC)" --no-audit --no-fund'
	@printf 'gssk after:  '
	@$(call gssk_pinned)
	@echo ""
	@echo "package.json ranges changed — review 'git diff package.json' before committing,"
	@echo "then 'make build && make test'."

# --------------------------------------------------
# Utilities
# --------------------------------------------------
shell: image ## Open a shell inside the gssk-dia container
	$(RUN_IT) --entrypoint /bin/sh

clean: ## Remove the dist/ directory
	rm -rf dist
