# Graph Report - manga  (2026-09-23)

## Corpus Check
- cluster-only mode — file stats not available

## Summary
- 857 nodes · 1465 edges · 58 communities (49 shown, 9 thin omitted)
- Extraction: 100% EXTRACTED · 0% INFERRED · 0% AMBIGUOUS · INFERRED: 7 edges (avg confidence: 0.85)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `e59ff8bf`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- folderParser.ts
- complete-upload.ts
- dev-server.mjs
- deploy-backend-lambdas.mjs
- upload.vue
- manga-stack.ts
- delete.vue
- components.d.ts
- compilerOptions
- test/auth.test.ts
- ref_vitest
- admin-works.ts
- login.ts
- presign.ts
- local-deploy-runner.mjs
- [chapterId].vue
- admin-login.ts
- manga/api.ts
- deploy.vue
- compilerOptions
- admin-works.test.ts
- devDependencies
- compilerOptions
- frontend/package.json
- compilerOptions
- scripts
- backend/package.json
- App.vue
- vue
- infra/package.json
- dependencies
- UploadManager
- main.ts
- pages/login.vue
- admin/login.vue
- pages/index.vue
- [workId]/index.vue
- scripts
- ref_composables
- ref_node_url
- devDependencies
- scripts
- hash-password.mjs
- vue-router
- LoadingOverlay.vue
- devDependencies
- dependencies
- useWindowSizeAndDevice.ts
- useElScrollbarScroll.ts
- naturalSort.ts
- prepare-secrets.ps1
- useDocumentTitle.ts
- frontend/tsconfig.json
- engines
- breakpoints.ts
- common.ts

## God Nodes (most connected - your core abstractions)
1. `vue` - 21 edges
2. `compilerOptions` - 21 edges
3. `ParameterReader` - 19 edges
4. `jsonResponse()` - 18 edges
5. `RequestValidationError` - 17 edges
6. `CachedSsmParameterReader` - 16 edges
7. `readCookie()` - 16 edges
8. `compilerOptions` - 16 edges
9. `compilerOptions` - 15 edges
10. `createCompleteUploadHandler()` - 14 edges

## Surprising Connections (you probably didn't know these)
- `ConversionQueueOptions` --references--> `ParsedPage`  [EXTRACTED]
  frontend/src/upload/conversionQueue.ts → frontend/src/upload/types.ts
- `requestPresign()` --calls--> `AdminAuthenticationError`  [EXTRACTED]
  frontend/src/upload/uploadManager.test.ts → frontend/src/upload/uploadApi.ts
- `MemoryStorage` --implements--> `AdminWorksStorage`  [EXTRACTED]
  backend/test/admin-works.test.ts → backend/functions/admin-works.ts
- `LoginDependencies` --references--> `ParameterReader`  [EXTRACTED]
  backend/functions/login.ts → backend/shared/parameters.ts
- `parseCompleteUploadRequest()` --calls--> `RequestValidationError`  [EXTRACTED]
  backend/shared/metadata.ts → backend/shared/validation.ts

## Import Cycles
- None detected.

## Communities (58 total, 9 thin omitted)

### Community 0 - "folderParser.ts"
Cohesion: 0.05
Nodes (42): ConversionQueue, ConversionQueueOptions, pages(), collectDroppedFiles(), createWorkId(), isSystemArtifact(), ItemWithEntry, LegacyDirectoryEntry (+34 more)

### Community 1 - "complete-upload.ts"
Cohesion: 0.09
Nodes (30): CompleteUploadStorage, createCompleteUploadHandler(), handler(), IndexWriteConflictError, requiredEnvironment(), s3Client, StoredIndex, updatePublishedIndex() (+22 more)

### Community 2 - "dev-server.mjs"
Cohesion: 0.08
Nodes (41): isAlive(), isDescendantOf(), labels, listeningPid(), LOG, MARKER, markerIsFresh(), netstat() (+33 more)

### Community 3 - "deploy-backend-lambdas.mjs"
Cohesion: 0.09
Nodes (29): assertExpectedAccount(), backendRoot, bundleAndZip(), __dirname, functions, main(), powerShellQuote(), repoRoot (+21 more)

### Community 4 - "upload.vue"
Cohesion: 0.07
Nodes (29): adminAuth, completionFailure, compressionPercent, displayedFailures, errorMessage, failurePresentation, failureTotal, finalizeUpload() (+21 more)

### Community 5 - "manga-stack.ts"
Cohesion: 0.14
Nodes (19): app, createFunction(), createMangaApi(), MangaApiProps, MangaApiResources, parameterArn(), createViewerAuth(), ViewerAuthResources (+11 more)

### Community 6 - "delete.vue"
Cohesion: 0.09
Nodes (21): AdminWorkEntry, AdminWorksResponse, deleteAdminWork(), loadAdminWorks(), adminAuth, confirmDelete(), deletedWorkTitle, deleteFailureMessage (+13 more)

### Community 7 - "components.d.ts"
Cohesion: 0.09
Nodes (13): emit, onChange(), Props, GlobalComponents, vue, Props, close(), emit (+5 more)

### Community 8 - "compilerOptions"
Cohesion: 0.09
Nodes (22): compilerOptions, allowImportingTsExtensions, esModuleInterop, isolatedModules, jsx, lib, module, moduleDetection (+14 more)

### Community 9 - "test/auth.test.ts"
Cohesion: 0.19
Nodes (15): handler(), createAdminSessionHandler(), handler(), handler(), createExpiredAdminSessionCookie(), verifyAdminSession(), createExpiredSignedCookies(), ApiErrorBody (+7 more)

### Community 10 - "ref_vitest"
Cohesion: 0.15
Nodes (13): useAdminAuthStore, LoginResult, useAuthStore, useLoadingStore, createCompletionFailurePresentation(), createItemFailurePresentation(), createUnexpectedFailurePresentation(), FailurePresentation (+5 more)

### Community 11 - "admin-works.ts"
Cohesion: 0.15
Nodes (14): AdminWorksStorage, authenticate(), cloudFrontClient, createAdminWorksHandler(), deleteWork(), handler(), IndexWriteConflictError, readIndex() (+6 more)

### Community 12 - "login.ts"
Cohesion: 0.19
Nodes (16): createLoginHandler(), handler(), LoginDependencies, cloudFrontBase64(), createSignedCookies(), SignedCookieInput, DEFAULT_ADMIN_SESSION_TTL_SECONDS, DEFAULT_SIGNED_COOKIE_TTL_SECONDS (+8 more)

### Community 13 - "presign.ts"
Cohesion: 0.20
Nodes (14): createPresignHandler(), handler(), PutUrlInput, PutUrlSigner, requiredEnvironment(), s3Client, buildMangaImageKey(), isRecord() (+6 more)

### Community 14 - "local-deploy-runner.mjs"
Cohesion: 0.18
Nodes (19): appendLog(), applyCorsHeaders(), broadcast(), clients, __dirname, finishJob(), frontendRoot, isLocalRequest() (+11 more)

### Community 15 - "[chapterId].vue"
Cohesion: 0.11
Nodes (15): chapter, chapterId, chapterIndex, errorMessage, imageError, imageErrorMessage, isLoading, metadata (+7 more)

### Community 16 - "admin-login.ts"
Cohesion: 0.18
Nodes (12): AdminLoginDependencies, createAdminLoginHandler(), handler(), AdminSessionDependencies, AdminWorksDependencies, CompleteUploadDependencies, PresignDependencies, AdminRuntimeConfig (+4 more)

### Community 17 - "manga/api.ts"
Cohesion: 0.24
Nodes (16): createPageImageUrl(), diagnoseImageLoadFailure(), fetchPrivateJson(), ImageLoadFailure, isChapter(), isIndexEntry(), isRecord(), loadMangaIndex() (+8 more)

### Community 18 - "deploy.vue"
Cohesion: 0.12
Nodes (16): applySnapshot(), connect(), currentJobId, eventSource, isAvailable, isRunning, isSubmitting, Job (+8 more)

### Community 19 - "compilerOptions"
Cohesion: 0.11
Nodes (17): compilerOptions, allowImportingTsExtensions, isolatedModules, lib, module, moduleDetection, moduleResolution, noEmit (+9 more)

### Community 20 - "admin-works.test.ts"
Cohesion: 0.18
Nodes (14): ADMIN_COOKIE_NAME, AdminSessionPayload, createAdminSessionCookie(), encode(), readCookie(), sign(), event(), initialIndex (+6 more)

### Community 21 - "devDependencies"
Cohesion: 0.12
Nodes (17): devDependencies, eslint, eslint-config-prettier, eslint-plugin-vue, playwright, prettier, sass, @types/node (+9 more)

### Community 22 - "compilerOptions"
Cohesion: 0.12
Nodes (16): compilerOptions, esModuleInterop, lib, module, moduleResolution, noEmit, noFallthroughCasesInSwitch, noUncheckedIndexedAccess (+8 more)

### Community 23 - "frontend/package.json"
Cohesion: 0.14
Nodes (14): vitest, name, private, type, version, eslint, eslint-config-prettier, eslint-plugin-vue (+6 more)

### Community 24 - "compilerOptions"
Cohesion: 0.13
Nodes (14): compilerOptions, lib, module, moduleResolution, noEmit, noFallthroughCasesInSwitch, noUncheckedIndexedAccess, noUnusedLocals (+6 more)

### Community 25 - "scripts"
Cohesion: 0.14
Nodes (14): scripts, build, deploy:backend, deploy:frontend, dev, dev:deploy-console, format, format:check (+6 more)

### Community 26 - "backend/package.json"
Cohesion: 0.17
Nodes (11): vitest, name, private, type, version, @aws-sdk/client-cloudfront, @aws-sdk/client-s3, @aws-sdk/client-ssm (+3 more)

### Community 27 - "App.vue"
Cohesion: 0.17
Nodes (8): authStore, { height, deviceType }, isStandalonePage, materialListScrollPositions, route, router, scrollbar, { showScrollButton, currentTop, isScrollable, onScroll, goToPageTop }

### Community 28 - "vue"
Cohesion: 0.17
Nodes (8): appScrollStateKey, MaterialsAccordionState, states, *.css, *.png, *.scss, *.vue, vue

### Community 29 - "infra/package.json"
Cohesion: 0.17
Nodes (11): dependencies, aws-cdk-lib, constructs, @types/node, typescript, vitest, name, private (+3 more)

### Community 30 - "dependencies"
Cohesion: 0.18
Nodes (11): dependencies, animate.css, axios, dayjs, element-plus, marked, pinia, pinia-plugin-persistedstate (+3 more)

### Community 32 - "main.ts"
Cohesion: 0.20
Nodes (9): app, pinia, animate.css, ref_app_vue, axios, dayjs, pinia-plugin-persistedstate, ref_router (+1 more)

### Community 33 - "pages/login.vue"
Cohesion: 0.22
Nodes (9): authStore, errorMessage, isShaking, isSubmitting, password, route, router, shakeForm() (+1 more)

### Community 34 - "admin/login.vue"
Cohesion: 0.25
Nodes (6): adminAuth, errorMessage, isLocalDeployConsoleVisible, isSubmitting, password, router

### Community 35 - "pages/index.vue"
Cohesion: 0.25
Nodes (6): errorMessage, isLoading, route, router, works, ref_manga

### Community 36 - "[workId]/index.vue"
Cohesion: 0.25
Nodes (6): errorMessage, isLoading, metadata, route, router, { setDocumentTitle }

### Community 37 - "scripts"
Cohesion: 0.25
Nodes (8): scripts, build:frontend, deploy, diff, synth, test, test:watch, typecheck

### Community 38 - "ref_composables"
Cohesion: 0.29
Nodes (5): adminAuth, isAuthorizing, isLocalDeployConsoleVisible, router, ref_composables

### Community 39 - "ref_node_url"
Cohesion: 0.29
Nodes (6): ref_node_url, unplugin-auto-import, unplugin-vue-components, vite, vite-plugin-pages, @vitejs/plugin-vue

### Community 40 - "devDependencies"
Cohesion: 0.33
Nodes (6): devDependencies, esbuild, @types/aws-lambda, @types/node, typescript, vitest

### Community 41 - "scripts"
Cohesion: 0.33
Nodes (6): scripts, generate-signing-key, hash-password, test, test:watch, typecheck

### Community 42 - "hash-password.mjs"
Cohesion: 0.33
Nodes (5): chunks, password, salt, scrypt, ref_node_util

### Community 43 - "vue-router"
Cohesion: 0.33
Nodes (4): Props, router, ref_virtual_generated_pages, vue-router

### Community 44 - "LoadingOverlay.vue"
Cohesion: 0.33
Nodes (4): displayProgress, isShowing, store, ref_stores

### Community 45 - "devDependencies"
Cohesion: 0.33
Nodes (6): devDependencies, aws-cdk, tsx, @types/node, typescript, vitest

### Community 46 - "dependencies"
Cohesion: 0.40
Nodes (5): dependencies, @aws-sdk/client-cloudfront, @aws-sdk/client-s3, @aws-sdk/client-ssm, @aws-sdk/s3-request-presigner

### Community 47 - "useWindowSizeAndDevice.ts"
Cohesion: 0.40
Nodes (3): DeviceType, ref_constants, @vueuse/core

### Community 49 - "naturalSort.ts"
Cohesion: 0.67
Nodes (3): naturalCollator, naturalCompare(), naturalSort()

### Community 50 - "prepare-secrets.ps1"
Cohesion: 0.83
Nodes (3): ConvertTo-PlainText(), Invoke-NodeWithSecretStdin(), New-PasswordHashFile()

## Knowledge Gaps
- **371 isolated node(s):** `ItemWithEntry`, `LegacyEntry`, `PresignBatchFile`, `PresignedFile`, `CompleteUploadResponse` (+366 more)
  These have ≤1 connection - possible missing edges or undocumented components. (Counts symbols only; 443 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)
- **9 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `vue` connect `vue` to `main.ts`, `pages/login.vue`, `admin/login.vue`, `pages/index.vue`, `upload.vue`, `[workId]/index.vue`, `delete.vue`, `components.d.ts`, `ref_composables`, `ref_vitest`, `LoadingOverlay.vue`, `useWindowSizeAndDevice.ts`, `useElScrollbarScroll.ts`, `[chapterId].vue`, `deploy.vue`, `frontend/package.json`, `App.vue`?**
  _High betweenness centrality (0.258) - this node is a cross-community bridge._
- **Why does `pinia` connect `ref_vitest` to `main.ts`, `frontend/package.json`?**
  _High betweenness centrality (0.057) - this node is a cross-community bridge._
- **Why does `@types/node` connect `infra/package.json` to `backend/package.json`, `frontend/package.json`?**
  _High betweenness centrality (0.050) - this node is a cross-community bridge._
- **What connects `ItemWithEntry`, `LegacyEntry`, `PresignBatchFile` to the rest of the system?**
  _371 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `folderParser.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.05365296803652968 - nodes in this community are weakly interconnected._
- **Should `complete-upload.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.08695652173913043 - nodes in this community are weakly interconnected._
- **Should `dev-server.mjs` be split into smaller, more focused modules?**
  _Cohesion score 0.0821256038647343 - nodes in this community are weakly interconnected._