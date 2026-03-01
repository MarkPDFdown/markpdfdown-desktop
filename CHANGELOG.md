# Changelog
All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.3.1] - 2026-03-01
### :boom: BREAKING CHANGES
- due to [`7cd348f`](https://github.com/MarkPDFdown/markpdfdown-desktop/commit/7cd348f62bfcf372b7584b0734d71e9c4e27b381) - ✨ Add cloud API integration with authentication and credits *(PR [#48](https://github.com/MarkPDFdown/markpdfdown-desktop/pull/48) by [@jorben](https://github.com/jorben))*:

  Settings page now defaults to Account tab instead of Model Service  
  Co-Authored-By: Claude (anthropic/claude-opus-4.5) <noreply@anthropic.com>  
  * feat(i18n): ✨ add internationalization for cloud features  
  Add i18n support for cloud-related UI components across all 6 languages:  
  - AccountCenter: translate account management, credit balance, and history  
  - UploadPanel: translate cloud provider and model names, status messages  
  - Layout: translate user profile tooltip  
  - List: translate cloud/local task type labels  
  - Settings: translate account tab label  
  Add new account.json namespace with translations for:  
  - Account center title and sign in/out buttons  
  - Credit balance section (monthly free, paid credits)  
  - Credit history table columns and type labels  
  Co-Authored-By: Claude (anthropic/claude-opus-4.5) <noreply@anthropic.com>  
  * feat(i18n): ✨ update credit description texts for account center  
  - Change paid credits description to "$1 USD = 1,500 credits"  
  - Change free credits description to monthly quota with UTC+0 reset time  
  - Rename "Monthly Free Credits" to "Free Credits" across all locales  
  - Remove unused reset_hint and never_expire fields  
  - Align description layout between free and paid credit cards  
  Co-Authored-By: Claude (anthropic/claude-opus-4.5) <noreply@anthropic.com>  
  * refactor(ui): ♻️ remove local task type icon from task list  
  Remove HomeOutlined icon for local tasks, keeping only cloud icon indicator.  
  Co-Authored-By: Claude (anthropic/claude-opus-4.5) <noreply@anthropic.com>  
  * fix(types): 🐛 resolve TypeScript type errors in cloud integration  
  - Remove unused imports in CloudService (net, fs, path, FormData)  
  - Add missing getCreditHistory method to CloudService  
  - Remove unused imports in Layout (Space, GithubOutlined)  
  - Remove unused openExternalLink function in Layout  
  - Add cloud API types to WindowAPI and ElectronAPI interfaces  
  - Add window, platform, and app types to electron.d.ts  
  - Add hasRunningTasks type to task API interface  
  - Create CloudFileInput interface for flexible file type handling  
  - Fix UploadPanel to properly convert UploadFile to CloudFileInput  
  Co-Authored-By: Claude (anthropic/claude-opus-4.5) <noreply@anthropic.com>  
  * feat(auth): ✨ add custom protocol handler for OAuth callback  
  Implement deep linking support for OAuth authentication flow:  
  - Register markpdfdown:// custom protocol for all platforms  
  - Handle OAuth callback URLs in main process  
  - Add IPC bridge to forward auth events to renderer  
  - Replace Clerk modal with inline SignIn component  
  - Configure ClerkProvider with allowedRedirectProtocols  
  - Add onOAuthCallback mock to test setup  
  Co-Authored-By: Claude (anthropic/claude-opus-4.5) <noreply@anthropic.com>  
  * feat(auth): ✨ replace Clerk SDK with device flow authentication  
  Remove @clerk/clerk-react dependency and implement a custom device flow  
  (RFC 8628) authentication system via AuthManager. The new flow:  
  - Main process manages tokens (access + refresh) with encrypted storage  
  - Renderer receives auth state changes via IPC event bridge  
  - AccountCenter UI shows user code for browser-based authorization  
  - CloudService retrieves tokens from AuthManager instead of receiving  
    them from the renderer  
  Also updates IPC channels, preload bridge, type definitions, i18n  
  strings, and test mocks to align with the new auth architecture.  
  Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>  
  * fix(auth): 🐛 unwrap API response in fetchUserProfile  
  The fetchUserProfile method was assigning the raw API response  
  directly to userProfile instead of extracting the nested data  
  field. Since the API returns { success, data: CloudUserProfile },  
  the user's name, email, and avatar_url were all undefined in the  
  renderer, causing avatar and username not to display after login.  
  Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>  
  * feat(auth): ✨ 添加自定义 User-Agent 和自动 token 刷新功能  
  在 AuthManager 中添加以下改进：  
  - 添加 buildUserAgent() 函数，为所有 API 请求设置自定义 User-Agent 头  
  - 添加 fetchWithAuth() 方法，自动携带认证令牌并在 401 时自动刷新 token  
  - 所有 API 请求现在都包含 User-Agent 和正确的认证头  
  - 改进登出流程，使用 fetchWithAuth 处理认证失败情况  
  此变更提高了 API 调用的可追踪性和认证流程的健壮性。  
  Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>  
  * feat(cloud): ✨ integrate credits API with real backend  
  Replace mock credit data with actual API calls:  
  - Add getCredits() endpoint to fetch current balance  
  - Add type filter support for credit history  
  - Update UI to show monthly and daily credit balances  
  - Add 7 credit transaction types (consume, topup, refund, etc.)  
  - Add TypeScript types for CreditsApiResponse  
  🤖 Generated with [Claude Code](https://claude.com/claude-code)  
  * feat(cloud): ✨ add multi-tier cloud model selection  
  Add three cloud model tiers with different credit pricing:  
  - Fit Lite: ~10 credits/page  
  - Fit Pro: ~20 credits/page  
  - Fit Ultra: ~60 credits/page  
  Changes:  
  - Update model selector to display 3 options with i18n support  
  - Pass selected model tier through IPC to cloud conversion  
  - Add translations for all 6 supported languages  
  Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>  
  * feat(cloud): ✨ add credit usage hint to Account page  
  Add i18n text explaining credit consumption rates for different  
  cloud models (Lite/Pro/Ultra) displayed next to Credit Balance title.  
  Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>  
  * feat(cloud): ✨ implement POST /api/v1/convert API integration  
  Replace mock implementation with real API call to create cloud conversion tasks:  
  - Add CreateTaskResponse and CloudModelTier types  
  - Use FormData for multipart/form-data file upload  
  - Support both file path and content as input  
  - Handle API errors properly with structured response  
  - Default to 'lite' model tier if not specified  
  Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>  
  * feat(cloud): ✨ implement full task management API integration  
  Replace mock data with real cloud API calls for complete task  
  lifecycle management. This covers all 10 API endpoints from the  
  client integration guide:  
  Backend integration:  
  - Replace mock getTasks with GET /api/v1/tasks  
  - Add getTaskById, getTaskPages, cancelTask, retryTask,  
    retryPage, getTaskResult, downloadPdf methods to CloudService  
  - Create CloudSSEManager for real-time task event streaming  
    with auto-reconnect, exponential backoff, and heartbeat  
  IPC & Preload:  
  - Add 13 CLOUD IPC channels and CLOUD_TASK_EVENT event  
  - Register 9 new IPC handlers in cloud.handler.ts  
  - Expose all new methods and onCloudTaskEvent in preload bridge  
  Renderer:  
  - Extend CloudContext with 7 new actions and SSE lifecycle  
  - Create cloudTaskMapper utility for API response mapping  
  - Update List page with cloud task actions and SSE live updates  
  - Create CloudPreview page for viewing cloud task results  
  - Add cloud-preview i18n translations for all 6 locales  
  Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>  
  * feat(cloud): ✨ display page images in cloud task detail  
  Add page image support to CloudPreview component by:  
  - Add image_url field to CloudTaskPageResponse type  
  - Add getPageImage IPC channel and handler for proxying image requests  
  - Implement dual URL handling:  
    - Presigned URLs (https://) - use directly in <img> tag  
    - Relative API paths - proxy through main process with auth token  
  - Update CloudPreview left panel to display page images  
  - Handle image loading states and errors gracefully  
  This enables users to view the original PDF page images alongside  
  their markdown conversion results in cloud task details.  
  Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>  
  * fix(auth): ⚡️ speed up token acquisition after OAuth callback  
  Add checkDeviceTokenStatus() method to immediately verify token status  
  when receiving protocol URL callback, instead of waiting for next polling  
  interval. This reduces token acquisition latency from ~5s to milliseconds.  
  The implementation:  
  - Calls /api/v1/auth/device/token immediately on callback  
  - Stops polling after successful token acquisition  
  - Handles 428 (authorization_pending) gracefully by continuing polling  
  - Thread-safe: concurrent requests don't cause issues  
  Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>  
  * feat(cloud): ✨ display model tier in task list  
  Add model_tier field to CloudTaskResponse type and use it for  
  displaying the correct model tier (lite/pro/ultra) in the task list.  
  Previously the code incorrectly used status_name for model tier mapping.  
  Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>  
  * fix(cloud): align model tier display with upload panel  
  Change task list model name from "Cloud Lite/Pro/Ultra" to  
  "Fit Lite/Pro/Ultra" to match the upload panel selector.  
  Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>  
  * feat(cloud): ✨ implement cloud task deletion with terminal state guard  
  Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>  
  * fix(cloud): 🐛 refresh credit balance when entering account page  
  Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>  
  * fix(ui): 🐛 fix account page content overflow by enabling tab-level scrolling  
  - Add height: 100vh and minHeight: 0 to Layout content area so flex  
    children get a constrained height  
  - Make Settings Tabs a flex column filling its container, with only  
    the tab content holder scrolling (tab bar stays fixed)  
  - Add scrollbar styles for settings-tabs consistent with existing  
    model-service-tabs  
  Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>  
  * feat(cloud): ✨ add page_range support to cloud convert API  
  Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>  
  * fix(cloud): 🐛 prevent duplicate SSE connections causing repeated events  
  The cloud task list received each SSE event 3 times because multiple  
  SSE connections were being established concurrently:  
  1. Main process auto-connect in initializeBackgroundServices  
  2. Renderer CloudContext useEffect calling sseConnect on auth  
  3. React re-renders causing disconnect+reconnect race conditions  
  Key changes:  
  - Remove main process SSE auto-connect; let renderer CloudContext  
    manage SSE lifecycle exclusively via IPC to avoid dual entry points  
  - Set connected flag synchronously before any await in connect() to  
    prevent concurrent calls from passing the guard  
  - Abort any lingering stream in startStream() before creating new one  
  - Use authManager.fetchWithAuth for automatic token refresh on 401  
  - Filter connected/heartbeat control events from renderer forwarding  
  - Fix page_completed counting to use page number (idempotent) instead  
    of naive increment that double-counts on SSE reconnect replay  
  - Fix pdf_ready status mapping from SPLITTING(2) to PROCESSING(3)  
  - Move fetchTasks out of setState callback using queueMicrotask  
  - Add connected event type to CloudSSEEventType for type safety  
  - Reset lastEventId on disconnect to prevent cross-session replays  
  - Add diagnostic logging throughout SSE pipeline  
  Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>  
  * feat(cloud): ✨ update credit transaction types for pre-auth billing model  
  - Replace consume_settle/page_retry with pre_auth, settle, pre_auth_release  
  - Add frozen fields to CreditsApiResponse for bonus and paid credits  
  - Fix description column to show API description instead of file_name  
  - Reorder credits column before description in history table  
  - Style pre_auth/pre_auth_release amounts as secondary (grey)  
  - Update transaction type translations for all 6 locales  
  Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>  
  * fix(cloud): 🐛 fix SSE event loss on reconnection by preserving Last-Event-ID  
  - disconnect() no longer resets lastEventId, preserving resumption point  
  - Add resetAndDisconnect() for explicit logout (clears lastEventId)  
  - Fix duplicate reconnect by clearing pending reconnectTimer  
  - Skip redundant reconnect when stream is aborted (not naturally ended)  
  - Log Last-Event-ID in reconnect/connect for debugging  
  Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>  
  * fix(auth): 🐛 distinguish transient vs permanent token refresh failures  
  - Add AuthTokenInvalidError for definitive auth failures (401/403)  
  - Only clear refresh token on permanent failures, keep it for transient errors  
  - Add retry logic for auto-refresh with exponential backoff  
  - Schedule init retry on transient failure during session restore  
  - Fix getAccessToken to attempt refresh when access token is missing  
  Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>  
  * perf(cloud): ⚡️ reduce task list polling frequency to lower server load  
  Active tasks: 10s → 60s, idle: 30s → 120s. Real-time updates  
  are handled by SSE, polling serves only as a fallback.  
  Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>  
  * refactor(cloud): ♻️ align cloud preview actions with local task behavior  
  - Remove Download PDF entry from More Actions menu  
  - Add retry failed pages action (status=8 with failed pages)  
  - Add delete action for terminal-state tasks  
  - Use Dropdown.Button pattern matching local Preview  
  - Add i18n keys for all 6 locales  
  Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>  
  * fix(list): 🐛 fix pagination and sorting for combined local/cloud task list  
  - Fetch up to 100 items from each source, then paginate locally  
  - Add unified sortTimestamp field to CloudTask for cross-source sorting  
  - Sort combined list by timestamp (newest first) before pagination  
  - Fix pagination total to include both local and cloud task counts  
  * feat(cloud): ⏱️ add 8-second timeout to cloud API requests  
  Add timeout support to AuthManager.fetchWithAuth() using AbortController.  
  Both initial requests and 401 retry requests now have 8-second timeout.  
  SSE heartbeat timeout (90s) remains unchanged.  
  Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>  
  * feat(cloud): 🏷️ add provider name to cloud task model display  
  Append provider name 'Markdown.Fit' to cloud task model_name field  
  for clearer identification of cloud tasks in the task list.  
  Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>  
  * feat(upload): ✨ add Office file support for cloud conversion  
  Add support for selecting and uploading Office documents (doc, docx, xls, xlsx, ppt, pptx) when using cloud conversion with authenticated users.  
  - Add allowOffice parameter to file select dialog  
  - Add file type detection (pdf, image, office, unsupported)  
  - Show appropriate hints when Office files are not supported  
  - Add validation to prevent unsupported file types  
  Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>  
  * fix(cloud): ⏱️ adjust timeout based on request type  
  - FormData uploads: 120s timeout  
  - Download requests (/result, /download): no timeout  
  - Other API requests: 8s timeout  
  Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>  
  * test(renderer): ✅ align list and preview tests with latest UI behavior  
  * chore(account): 🚧 disable recharge button until feature is ready  
  Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>  
  * fix(ci): 🐛 improve LLM PR review reliability for large diffs  
  - Reduce max diff size from 128KB to 64KB to avoid exceeding LLM context limits  
  - Replace silent curl failure with explicit HTTP status code checking and error output  
  - Add timeout (120s for LLM API, 30s for GitHub API) to prevent hanging requests  
  Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>  
  * fix(ci): 🐛 fix broken pipe error in diff truncation  
  Replace printf|head pipe with bash substring expansion to avoid  
  SIGPIPE under set -o pipefail when diff exceeds max size.  
  Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>  
  * fix(ci): 🔧 restore max diff size to 128KB  
  Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>  
  * fix(ci): 🐛 fix jq argument list too long for large diffs  
  Use --rawfile to pass system prompt and diff content via temp files  
  instead of --arg CLI arguments, avoiding ARG_MAX limit on Linux.  
  Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>  
  * fix(ci): 🐛 fix curl argument list too long for LLM request  
  Write request body to temp file and use curl -d @file syntax  
  to avoid ARG_MAX limit when sending large diffs to LLM API.  
  Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>  
  * fix(cloud): 🔒 address PR review security and quality issues  
  - Prevent refresh token plaintext persistence when encryption unavailable  
  - Strict-validate protocol URL paths (only allow auth/callback)  
  - Add missing page_range field to cloud.convert type definition  
  - Gate SSE verbose logging behind isDev check for production perf  
  - URL-encode all path parameters in CloudService API calls  
  Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>  
  * fix(cloud): 🔒 address second round PR review issues  
  - Add 100MB file size limit validation in cloud:convert IPC handler  
  - Normalize protocol URL path (lowercase, deduplicate slashes, decode)  
  - Deduplicate concurrent refresh token calls with in-flight promise  
  - Await shell.openExternal and handle browser launch failures  
  - Normalize CRLF to LF in SSE stream parser for server compatibility  
  - Sanitize Content-Disposition filename with path.basename and char filter  
  Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>  
  * fix(cloud): 🔒 address third round PR review issues  
  - Use async fs.readFile instead of sync readFileSync for upload (unblock main)  
  - Use async fs.promises.stat in cloud handler for file size validation  
  - Safe decodeURIComponent in protocol URL handler (catch malformed encoding)  
  - Replace brittle URL-substring timeout detection with explicit timeoutMs option  
  - Add content-type validation for SSE stream (reject non text/event-stream)  
  Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>  
  * fix(cloud): 🐛 fix SSE abort signal and normalize timeout errors  
  - Compose caller signal with timeout signal in fetchWithAuth using AbortSignal.any  
  - SSE disconnect/reconnect now reliably aborts in-flight fetch requests  
  - Normalize timeout AbortError to 'Request timeout' for better UX  
  - Remove duplicate comment line in UploadPanel  
  Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>  
  * fix(cloud): 🔒 harden protocol URL validation and signal compatibility  
  - Validate protocol URL host structurally without decodeURIComponent  
  - Reject percent-encoded characters in host to prevent bypass  
  - Add AbortSignal.any fallback for older runtimes  
  - Reset SSE connected flag on startStream failure to prevent deadlock  
  Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>  
  ---------


### :sparkles: New Features
- [`7cd348f`](https://github.com/MarkPDFdown/markpdfdown-desktop/commit/7cd348f62bfcf372b7584b0734d71e9c4e27b381) - **cloud**: ✨ Add cloud API integration with authentication and credits *(PR [#48](https://github.com/MarkPDFdown/markpdfdown-desktop/pull/48) by [@jorben](https://github.com/jorben))*

### :bug: Bug Fixes
- [`fabfd3e`](https://github.com/MarkPDFdown/markpdfdown-desktop/commit/fabfd3e797a47f3bd6cf350c5991f4ce1dfc1f3a) - **llm**: 🐛 修复 max_tokens 为 undefined 时导致的请求问题 *(PR [#44](https://github.com/MarkPDFdown/markpdfdown-desktop/pull/44) by [@jorben](https://github.com/jorben))*
- [`fd45101`](https://github.com/MarkPDFdown/markpdfdown-desktop/commit/fd45101a70626c5658fc83fc96acb2aee9f53e54) - **llm**: 🐛 修复 max_tokens 为无效值时导致的 API 错误 *(PR [#45](https://github.com/MarkPDFdown/markpdfdown-desktop/pull/45) by [@jorben](https://github.com/jorben))*
- [`10e3a9d`](https://github.com/MarkPDFdown/markpdfdown-desktop/commit/10e3a9ddaf17f740daaecf2a92a3709a1976760e) - **llm**: 🐛 修复 max_tokens 为无效值时导致的 API 错误 *(PR [#46](https://github.com/MarkPDFdown/markpdfdown-desktop/pull/46) by [@jorben](https://github.com/jorben))*

### :wrench: Chores
- [`aeba963`](https://github.com/MarkPDFdown/markpdfdown-desktop/commit/aeba963cb0491e543dab3e6d22a1af4474228dcd) - **about**: 🔗 更新官方网址为 https://markdown.fit *(PR [#49](https://github.com/MarkPDFdown/markpdfdown-desktop/pull/49) by [@jorben](https://github.com/jorben))*


## [0.2.2] - 2026-02-14
### :bug: Bug Fixes
- [`6c29cf0`](https://github.com/MarkPDFdown/markpdfdown-desktop/commit/6c29cf03472035d5ba3d5e559d67a009f610dc8b) - **build**: 📦 disable code signature verification for Windows updates *(PR [#42](https://github.com/MarkPDFdown/markpdfdown-desktop/pull/42) by [@jorben](https://github.com/jorben))*


## [0.2.1] - 2026-02-14
### :bug: Bug Fixes
- [`7ae4de8`](https://github.com/MarkPDFdown/markpdfdown-desktop/commit/7ae4de8abcd536ffaf5de19bb1cf9647c3533d3b) - **ci**: 🐛 filter out duplicate builder-debug.yml in upload-manifests job *(PR [#36](https://github.com/MarkPDFdown/markpdfdown-desktop/pull/36) by [@jorben](https://github.com/jorben))*
- [`d54cc64`](https://github.com/MarkPDFdown/markpdfdown-desktop/commit/d54cc641b175bcd00859329b6ab73e0ec7622fd8) - **updater**: 🐛 fix update checker UI stuck state and layout issues *(PR [#37](https://github.com/MarkPDFdown/markpdfdown-desktop/pull/37) by [@jorben](https://github.com/jorben))*
- [`b93e284`](https://github.com/MarkPDFdown/markpdfdown-desktop/commit/b93e2843032a9f7c3fa646515a3f08fa18995fad) - **ci**: 👷 improve LLM PR review workflow *(PR [#40](https://github.com/MarkPDFdown/markpdfdown-desktop/pull/40) by [@jorben](https://github.com/jorben))*
- [`e15c8ed`](https://github.com/MarkPDFdown/markpdfdown-desktop/commit/e15c8eda6cc8069783a4c32d195602d16d2116ba) - **updater**: 🐛 sanitize update error details *(PR [#38](https://github.com/MarkPDFdown/markpdfdown-desktop/pull/38) by [@jorben](https://github.com/jorben))*


## [0.2.0] - 2026-02-12
### :sparkles: New Features
- [`10d9bcf`](https://github.com/MarkPDFdown/markpdfdown-desktop/commit/10d9bcf0942c915588e23b1dd1279248b5b99a60) - **updater**: add in-app auto-update with electron-updater *(PR [#33](https://github.com/MarkPDFdown/markpdfdown-desktop/pull/33) by [@jorben](https://github.com/jorben))*
- [`938af80`](https://github.com/MarkPDFdown/markpdfdown-desktop/commit/938af806c79235191d074da6470ed0869f347f28) - **provider**: ✨ add preset providers with auto-injection and capability filtering *(PR [#32](https://github.com/MarkPDFdown/markpdfdown-desktop/pull/32) by [@jorben](https://github.com/jorben))*

### :bug: Bug Fixes
- [`b1ceeec`](https://github.com/MarkPDFdown/markpdfdown-desktop/commit/b1ceeecc7b41b53bc45d153d3c321d4967a15fc2) - **ci**: 🐛 skip lifecycle scripts during npm publish in release workflow *(PR [#30](https://github.com/MarkPDFdown/markpdfdown-desktop/pull/30) by [@jorben](https://github.com/jorben))*
- [`84b42f3`](https://github.com/MarkPDFdown/markpdfdown-desktop/commit/84b42f360c826a3276dc72ab286e3bd67eee6333) - **provider**: 🐛 improve model config layout responsiveness and scrolling *(PR [#31](https://github.com/MarkPDFdown/markpdfdown-desktop/pull/31) by [@jorben](https://github.com/jorben))*


## [0.1.8] - 2026-02-11
### :bug: Bug Fixes
- [`53a71a3`](https://github.com/MarkPDFdown/markpdfdown-desktop/commit/53a71a33ebb3ba795742e21675617c53e660bed0) - **ci**: avoid duplicate builds on release workflow *(PR [#13](https://github.com/MarkPDFdown/markpdfdown-desktop/pull/13) by [@jorben](https://github.com/jorben))*
- [`ef0d984`](https://github.com/MarkPDFdown/markpdfdown-desktop/commit/ef0d984cb46b320e83f0fcbf0dc1aa865e661248) - **deps**: ⬆️ upgrade Electron to v38 and fix deprecated boolean package *(PR [#9](https://github.com/MarkPDFdown/markpdfdown-desktop/pull/9) by [@jorben](https://github.com/jorben))*
- [`98f8ebf`](https://github.com/MarkPDFdown/markpdfdown-desktop/commit/98f8ebfc32f33f8b3b790b11fdb3a5d2873afc37) - **links**: update GitHub repository URLs to markpdfdown-desktop *(PR [#15](https://github.com/MarkPDFdown/markpdfdown-desktop/pull/15) by [@jorben](https://github.com/jorben))*
- [`00aa1d5`](https://github.com/MarkPDFdown/markpdfdown-desktop/commit/00aa1d54a7745d0cef91a840f5412ad773f19e87) - **worker**: 🐛 Fix ConverterWorker not picking up pages after split *(PR [#21](https://github.com/MarkPDFdown/markpdfdown-desktop/pull/21) by [@jorben](https://github.com/jorben))*
- [`f355a87`](https://github.com/MarkPDFdown/markpdfdown-desktop/commit/f355a873d58d922a279a900a0082583227556c1a) - **provider**: 🐛 show disabled providers in settings *(PR [#28](https://github.com/MarkPDFdown/markpdfdown-desktop/pull/28) by [@jorben](https://github.com/jorben))*
- [`9ac73f4`](https://github.com/MarkPDFdown/markpdfdown-desktop/commit/9ac73f494b990fdd1080a14645fb6198ed3b3e02) - **splitter**: 🐛 Add file availability pre-check and upload validation for Windows *(PR [#23](https://github.com/MarkPDFdown/markpdfdown-desktop/pull/23) by [@jorben](https://github.com/jorben))*

### :white_check_mark: Tests
- [`d4393b6`](https://github.com/MarkPDFdown/markpdfdown-desktop/commit/d4393b61992a8523a5f462917420cb62445d606d) - add ResizeObserver and getComputedStyle mocks for renderer tests *(PR [#18](https://github.com/MarkPDFdown/markpdfdown-desktop/pull/18) by [@jorben](https://github.com/jorben))*


## [0.1.7] - 2026-01-25
### :bug: Bug Fixes
- [`cf5549e`](https://github.com/MarkPDFdown/markpdfdown-desktop/commit/cf5549e130e9394f4f1bc5f7c5b8e368596c0124) - **deps**: ⚡️ optimize electron dependency for smaller builds *(PR [#6](https://github.com/MarkPDFdown/markpdfdown-desktop/pull/6) by [@jorben](https://github.com/jorben))*
- [`a6174e9`](https://github.com/MarkPDFdown/markpdfdown-desktop/commit/a6174e93c95d2693e148e990dd6c81ec53743a7a) - **icon**: 🐛 fix app icon not displaying on macOS when running via npx *(PR [#8](https://github.com/MarkPDFdown/markpdfdown-desktop/pull/8) by [@jorben](https://github.com/jorben))*
- [`3fe8ace`](https://github.com/MarkPDFdown/markpdfdown-desktop/commit/3fe8ace6f6c12252aaf69c6b5225ad5a71b1cd8c) - **ci**: 🐛 use PAT to trigger CI from changelog PR *(PR [#11](https://github.com/MarkPDFdown/markpdfdown-desktop/pull/11) by [@jorben](https://github.com/jorben))*


## [0.1.6] - 2026-01-25
### :bug: Bug Fixes
- [`44b6566`](https://github.com/MarkPDFdown/markpdfdown-desktop/commit/44b6566c6d9c1f1f5985ba96c2d757e7434d534d) - **deps**: 🐛 move electron to optionalDependencies for build compatibility *(commit by [@jorben](https://github.com/jorben))*


## [0.1.5] - 2026-01-25
### :bug: Bug Fixes
- [`30224e1`](https://github.com/MarkPDFdown/markpdfdown-desktop/commit/30224e1efa03628249c21b224eb88e99e02775de) - **cli**: 🐛 improve npx execution reliability *(PR [#3](https://github.com/MarkPDFdown/markpdfdown-desktop/pull/3) by [@jorben](https://github.com/jorben))*


## [0.1.3] - 2026-01-24
### :sparkles: New Features
- [`b651de7`](https://github.com/MarkPDFdown/markpdfdown-desktop/commit/b651de72898233e8c1881ccf390ea08446e58e2c) - Add About Us page and provider management features *(commit by [@jorben](https://github.com/jorben))*
- [`50c167c`](https://github.com/MarkPDFdown/markpdfdown-desktop/commit/50c167c292e8c8f8864c861276ca9144103c0e06) - Update layout and provider components, enhance functionality *(commit by [@jorben](https://github.com/jorben))*
- [`ad9dbc1`](https://github.com/MarkPDFdown/markpdfdown-desktop/commit/ad9dbc162df9298444b553cbfd5ac8b76f1b1304) - Update Provider and List components to enhance user experience *(commit by [@jorben](https://github.com/jorben))*
- [`9f23b0a`](https://github.com/MarkPDFdown/markpdfdown-desktop/commit/9f23b0a8b63ce5e983d2cfca90a0e02705b4b637) - Update About Us page and Settings component *(commit by [@jorben](https://github.com/jorben))*
- [`6ae68b5`](https://github.com/MarkPDFdown/markpdfdown-desktop/commit/6ae68b5870de7a88fab05a32547b2b5c8ee212da) - Built the backend service framework *(commit by [@jorben](https://github.com/jorben))*
- [`d8688de`](https://github.com/MarkPDFdown/markpdfdown-desktop/commit/d8688de16c1f570ed9cff0cf4f8d6877debe03b1) - Refactor vendor management functionality *(commit by [@jorben](https://github.com/jorben))*
- [`c4acf69`](https://github.com/MarkPDFdown/markpdfdown-desktop/commit/c4acf698bc0adcc2e169a49ba9ee00dcc8220dfc) - Add provider information update functionality *(commit by [@jorben](https://github.com/jorben))*
- [`8d234f3`](https://github.com/MarkPDFdown/markpdfdown-desktop/commit/8d234f38543b567d9dd8c3cdc6885e7a5599f9a7) - Add model management feature *(commit by [@jorben](https://github.com/jorben))*
- [`442f5b0`](https://github.com/MarkPDFdown/markpdfdown-desktop/commit/442f5b054c38a835544a7bdbd7d9af877bc6d94c) - Add multiple LLM client implementations *(commit by [@jorben](https://github.com/jorben))*
- [`f8b081e`](https://github.com/MarkPDFdown/markpdfdown-desktop/commit/f8b081e0c91b67788c2aecdc3700cc026fb8c975) - Add model connection test feature *(commit by [@jorben](https://github.com/jorben))*
- [`2e0f37f`](https://github.com/MarkPDFdown/markpdfdown-desktop/commit/2e0f37ffa7f4f6e690c8d3593e712a3f873837b0) - Add image processing and dynamic API suffix setting functionality *(commit by [@jorben](https://github.com/jorben))*
- [`d79f50d`](https://github.com/MarkPDFdown/markpdfdown-desktop/commit/d79f50d523c2debef27ca0f1eb1b55c21f792fb7) - Add Ollama client support *(commit by [@jorben](https://github.com/jorben))*
- [`5cfa270`](https://github.com/MarkPDFdown/markpdfdown-desktop/commit/5cfa2706d01fd73167b8ae7494a5666cb6f85b24) - Implement model data fetching and selection functionality *(commit by [@jorben](https://github.com/jorben))*
- [`ba5552f`](https://github.com/MarkPDFdown/markpdfdown-desktop/commit/ba5552ffaf915cc14e0a3336d33ed217a0b6965c) - Add Task and TaskDetail models and database migrations *(commit by [@jorben](https://github.com/jorben))*
- [`cdf9891`](https://github.com/MarkPDFdown/markpdfdown-desktop/commit/cdf98917281d157aa05c67c903367f2676175cde) - Add UUID library and update task and provider models *(commit by [@jorben](https://github.com/jorben))*
- [`8dec743`](https://github.com/MarkPDFdown/markpdfdown-desktop/commit/8dec743a701b3e619a8f020fe0f405369210ce0b) - Add file upload and task creation functionality *(commit by [@jorben](https://github.com/jorben))*
- [`124c045`](https://github.com/MarkPDFdown/markpdfdown-desktop/commit/124c04522db498ed82b9d9ea8055a4b6236ef471) - Implement pagination for task list retrieval *(commit by [@jorben](https://github.com/jorben))*
- [`bae265c`](https://github.com/MarkPDFdown/markpdfdown-desktop/commit/bae265c530f4b462d874913a98c46203f90d2fe9) - Add task update and delete functionality *(commit by [@jorben](https://github.com/jorben))*
- [`f902759`](https://github.com/MarkPDFdown/markpdfdown-desktop/commit/f90275965bc2b080fcd8dcfa1e7d3102725f934a) - Add task management and file handling features *(commit by [@jorben](https://github.com/jorben))*
- [`f6cdb17`](https://github.com/MarkPDFdown/markpdfdown-desktop/commit/f6cdb179bef310645af21b0d5e9b733876ab2ce9) - **worker**: implement SplitterWorker with PDF/image processing pipeline *(commit by [@jorben](https://github.com/jorben))*
- [`95dc26f`](https://github.com/MarkPDFdown/markpdfdown-desktop/commit/95dc26f4041e16bb437907372c60372d0c069fe9) - ConverterWorker implementation with preview enhancements *(PR [#2](https://github.com/MarkPDFdown/markpdfdown-desktop/pull/2) by [@jorben](https://github.com/jorben))*

### :bug: Bug Fixes
- [`c33481b`](https://github.com/MarkPDFdown/markpdfdown-desktop/commit/c33481b9f4dcdb06d7f3e35f3e394d220db625bb) - Fix the issue of missing top rounded corners in the Content component style *(commit by [@jorben](https://github.com/jorben))*
- [`6a5ac67`](https://github.com/MarkPDFdown/markpdfdown-desktop/commit/6a5ac67014f6a8af32d40e74970ba6dd09530525) - Replace the route with Hash mode to adapt to the local file mode *(commit by [@jorben](https://github.com/jorben))*
- [`1eb8126`](https://github.com/MarkPDFdown/markpdfdown-desktop/commit/1eb8126b772013ae00ae6333e4b1217a5e966dad) - Message handling logic in components *(commit by [@jorben](https://github.com/jorben))*

### :recycle: Refactors
- [`4665cf9`](https://github.com/MarkPDFdown/markpdfdown-desktop/commit/4665cf966a58c98b3dd8d47b79225ee9584e6fc4) - Upgrade backend to TypeScript *(commit by [@jorben](https://github.com/jorben))*
- [`133d6bb`](https://github.com/MarkPDFdown/markpdfdown-desktop/commit/133d6bb4dcd9414fa20a0046dda3331edcfee4de) - Standardize file naming conventions *(commit by [@jorben](https://github.com/jorben))*

### :wrench: Chores
- [`df3cf27`](https://github.com/MarkPDFdown/markpdfdown-desktop/commit/df3cf27c0f95e20375079bfaf6f83942a1106e6f) - Configure main interface style *(commit by [@jorben](https://github.com/jorben))*
- [`e569200`](https://github.com/MarkPDFdown/markpdfdown-desktop/commit/e5692007fbecdcd4ccbabce897972edc348fb811) - Modify some style *(commit by [@jorben](https://github.com/jorben))*
- [`11ec498`](https://github.com/MarkPDFdown/markpdfdown-desktop/commit/11ec498cd1990b23217b4cffb79756037b763b08) - Complete the homepage layout *(commit by [@jorben](https://github.com/jorben))*
- [`b9e514d`](https://github.com/MarkPDFdown/markpdfdown-desktop/commit/b9e514d77a2902643dcf05979b364f0adeefcbc4) - Add file list functionality *(commit by [@jorben](https://github.com/jorben))*
- [`e79cf16`](https://github.com/MarkPDFdown/markpdfdown-desktop/commit/e79cf16f570448f7bb29c12d15878e2eb7927a4e) - Fix the style issues of the upload panel *(commit by [@jorben](https://github.com/jorben))*
- [`7e0a3bc`](https://github.com/MarkPDFdown/markpdfdown-desktop/commit/7e0a3bc1e3d2e01662a310f7c7b17e77f3a4ebc0) - Update dependencies and add new features *(commit by [@jorben](https://github.com/jorben))*
- [`22ae106`](https://github.com/MarkPDFdown/markpdfdown-desktop/commit/22ae106aae9615b15bd3f37789e2be3e6ae23291) - Optimize the layout of the About component, add an outer div to adjust the height, and ensure the content is centered. *(commit by [@jorben](https://github.com/jorben))*
- [`f15eee0`](https://github.com/MarkPDFdown/markpdfdown-desktop/commit/f15eee0ef6f17388f36181ee8bb7dd9cf856b4db) - Change CommonJS to Module Style *(commit by [@jorben](https://github.com/jorben))*
- [`621b620`](https://github.com/MarkPDFdown/markpdfdown-desktop/commit/621b620a5fcb4da39f1508a12dfc053dcbdf8a7d) - Add ESLint configuration and ignore files, optimize code structure *(commit by [@jorben](https://github.com/jorben))*
- [`51156ea`](https://github.com/MarkPDFdown/markpdfdown-desktop/commit/51156ea541d367d7eadfb04b23acb59ed76c1c29) - Update database configuration and build scripts *(commit by [@jorben](https://github.com/jorben))*
- [`8d38447`](https://github.com/MarkPDFdown/markpdfdown-desktop/commit/8d384477620d923a4beb00917da65a24df873c0d) - Remove .eslintignore file and update ESLint configuration *(commit by [@jorben](https://github.com/jorben))*
- [`bb118c0`](https://github.com/MarkPDFdown/markpdfdown-desktop/commit/bb118c0002a8c9c93e5ad9f3e567e8d6ecbd8f9e) - Update build scripts to generate Prisma client *(commit by [@jorben](https://github.com/jorben))*
- [`661af52`](https://github.com/MarkPDFdown/markpdfdown-desktop/commit/661af5246b77f985f4069cd89ccb78c36122ed41) - Refactor database migration logic *(commit by [@jorben](https://github.com/jorben))*
- [`124e3f5`](https://github.com/MarkPDFdown/markpdfdown-desktop/commit/124e3f5e0daa6b3fd4cd02d9a49e221efb614b98) - Update icons and build scripts *(commit by [@jorben](https://github.com/jorben))*
- [`63a6f92`](https://github.com/MarkPDFdown/markpdfdown-desktop/commit/63a6f9227b63808703b04501c153cf522029ebf7) - Update build output directory and file loading paths *(commit by [@jorben](https://github.com/jorben))*
- [`9c3904a`](https://github.com/MarkPDFdown/markpdfdown-desktop/commit/9c3904ab2cff8e7452d7cee37ce0de45264295e5) - Update React and related type definitions versions *(commit by [@jorben](https://github.com/jorben))*
- [`6d89091`](https://github.com/MarkPDFdown/markpdfdown-desktop/commit/6d890911fc16dafd1144b79399feae9e037113c3) - Update tsconfig.app.json to include the new directory "app/llm" and remove the Groq option from the AddProvider component. *(commit by [@jorben](https://github.com/jorben))*
- [`8572fba`](https://github.com/MarkPDFdown/markpdfdown-desktop/commit/8572fbafca91fa0c9c172a88d3140ac55da90a77) - Update dependencies and configurations *(commit by [@jorben](https://github.com/jorben))*
- [`2e93bc0`](https://github.com/MarkPDFdown/markpdfdown-desktop/commit/2e93bc086fa97174a89cf2e0f5cabbc0cdabacbb) - Update .gitignore file, remove old database file paths, add new database file paths, and delete dev.db and dev.db-journal files *(commit by [@jorben](https://github.com/jorben))*
- [`f71a423`](https://github.com/MarkPDFdown/markpdfdown-desktop/commit/f71a423191a4164eccfc8843c4a4cf9b6c6293e2) - add husky pre-commit hook to run tests *(commit by [@jorben](https://github.com/jorben))*

[0.1.3]: https://github.com/MarkPDFdown/markpdfdown-desktop/compare/0.0.1...0.1.3
[0.1.5]: https://github.com/MarkPDFdown/markpdfdown-desktop/compare/0.1.4...0.1.5
[0.1.6]: https://github.com/MarkPDFdown/markpdfdown-desktop/compare/0.1.5...0.1.6
[0.1.7]: https://github.com/MarkPDFdown/markpdfdown-desktop/compare/0.1.6...0.1.7
[0.1.8]: https://github.com/MarkPDFdown/markpdfdown-desktop/compare/0.1.7...0.1.8
[0.2.0]: https://github.com/MarkPDFdown/markpdfdown-desktop/compare/0.1.8...0.2.0
[0.2.1]: https://github.com/MarkPDFdown/markpdfdown-desktop/compare/0.2.0...0.2.1
[0.2.2]: https://github.com/MarkPDFdown/markpdfdown-desktop/compare/0.2.1...0.2.2
[0.3.1]: https://github.com/MarkPDFdown/markpdfdown-desktop/compare/0.2.2...0.3.1
