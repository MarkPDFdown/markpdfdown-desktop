# Changelog
All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.3.3] - 2026-03-02
### :bug: Bug Fixes
- [`f3389c2`](https://github.com/MarkPDFdown/markpdfdown-desktop/commit/f3389c2c904397910630b6e2c898787d1b359a47) - **upload**: 🐛 prevent action bar overlap on long file lists *(PR [#53](https://github.com/MarkPDFdown/markpdfdown-desktop/pull/53) by [@jorben](https://github.com/jorben))*


## [0.3.2] - 2026-03-02
### :bug: Bug Fixes
- [`9ae48af`](https://github.com/MarkPDFdown/markpdfdown-desktop/commit/9ae48afd6bb281bbfb9fa3a1458e8e7c41e0f118) - **list**: 🐛 move cloud icon to model column *(PR [#51](https://github.com/MarkPDFdown/markpdfdown-desktop/pull/51) by [@jorben](https://github.com/jorben))*


## [0.3.1] - 2026-03-01
### :boom: BREAKING CHANGES
- due to [`7cd348f`](https://github.com/MarkPDFdown/markpdfdown-desktop/commit/7cd348f62bfcf372b7584b0734d71e9c4e27b381) - ✨ Add cloud API integration with authentication and credits *(PR [#48](https://github.com/MarkPDFdown/markpdfdown-desktop/pull/48) by [@jorben](https://github.com/jorben))*:
  - Default settings landing tab changed from `Model Service` to `Account`.
  - Cloud conversion architecture introduces account/device-flow auth and credits-based usage.
  - IPC channels and cloud task workflow contracts changed to support the new cloud pipeline.
  - Full implementation details: PR [#48](https://github.com/MarkPDFdown/markpdfdown-desktop/pull/48).


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
[0.3.3]: https://github.com/MarkPDFdown/markpdfdown-desktop/compare/0.3.2...0.3.3
[0.3.2]: https://github.com/MarkPDFdown/markpdfdown-desktop/compare/0.3.1...0.3.2
