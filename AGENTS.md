# SpaceLaunch 小程序 · 项目记忆

uni-app (Vue 3) 微信小程序：航天发射跟踪。五 tab（今日 / 发射 / 图库 / 火箭 / 我的），
30 个页面，数据全靠 GitHub Actions 抓取后写腾讯 COS，前端静态拉 JSON。

- 技术栈：uni-app + Vue 3。`manifest.json` 里 `"vueVersion": "3"`，`main.js` 用 `createSSRApp`。
- **不是 Vue2**：禁止 `Vue.filter` / `new Vue()` / `Vue.prototype`。`uview-ui` 曾因此崩在 `app.js`，已整体摘除；
  将来要组件库用 `uview-plus`（uview 的 Vue3 分支），不要再装回 `uview-ui`。
- 工程形态：**HBuilderX 工程，根目录没有 `package.json`** → 不能用 `npx uni build`，编译只能在 HBuilderX 里做。
  数据管道的依赖清单在 `scripts/package.json`（`cos-nodejs-sdk-v5` `^2.14.6`、`sharp` `^0.35.5`）。
- 微信 appid `wxb1a4cbb5fa337016`；uni-appid `__UNI__C1A5695`。
- COS 桶 `spacelaunch-1258113633`（ap-chengdu），对象前缀 `space-data/`（数据）与 `space-img/`（图片），
  直连域名，**无 CDN 缓存层**，控制台改完即生效。
- 当前版本 **3.3.1 / versionCode 30301**。3.3.0 已发布；3.3.1 已提审（commit `630e350`）。
- 用户偏好：一次一个需求、迭代快、不满意就果断删、爱用截图诊断；结论要短要可执行，不要表演式汇报。

## 一、版本与发布（硬约束）

- 版本号 `X.Y.Z`：**Z 严格 +1**；要改 X.Y 必须先问用户。
- `versionCode = X*10000 + Y*100 + Z`（3.3.1 → `30301`），以**字符串**写在 `manifest.json`。
- 三处必须一致，`scripts/verify-pure.js` 会逐条对拍：
  - `manifest.json` 的 `versionName`
  - `utils/changelog.js` **末条**的 `version`（数组旧在前、新的追加到末尾，页面渲染时 reverse）
  - 实际打进包里的版本
- 重复性小修、审核暗门的改动**不记** changelog，一个版本对应一块完整工作。
- **审核期一律不动 `manifest.json` 与 `utils/changelog.js`**，改动攒到下一版。
  实例：3.3.1 提审中做的 21 个文件修复，全部挂到 3.3.2。
- `scripts/app-config.json` 是**提审/发布的反向开关**，搞反就是线上事故：
  - 提审前 → `{ "reviewVersions": ["3.3.1"] }`（非空即可，值本身无所谓）
  - 过审发布后 → `{ "reviewVersions": [] }`
  - 两者只隔几分钟就要互翻一次。**新会话接手先 `cat scripts/app-config.json` 判断当前该是哪一边，别按惯性清空。**
  - 必须走 git 改（push 触发 `.github/workflows/config.yml` 上传 COS 并覆盖），
    别只改 COS 控制台 —— 否则下次 push 会用仓库里的旧值盖回去。
  - 自测/开发期全程 `[]`。
- 发布顺序风险示例：`today.vue` 拉 `astronautsInspace`，而该产物由 CI 的 astronauts 分支在
  UTC 23:10（北京 07:10）产出 —— COS 上还没有它时「此刻在天上」就是空的。
  上线前先手动 dispatch 一次 `dataset=astronauts`，或等夜间自动跑。

## 二、常用命令与 CI

- 本地没有构建命令：改源码 → HBuilderX 编译 → 微信开发者工具。
- 四个守卫（`scripts/` 下的 Node 脚本，本机跑不了，见第五节）：
  - `node scripts/verify-pure.js` — 最大一道，约 297 条断言：DATA_VERSION 十处一致、
    manifest 与 changelog 对拍、`aggregateByYear` / `placeZh` / `countryOf` 等纯函数。
  - `node scripts/verify-config.js` — 审核暗门 17 项断言（`wx` / `uni` 桩 + 每次重新 import 绕过模块缓存）。
  - `node scripts/check-tabbar.js` — `pages.json` 与 `custom-tab-bar/index.js` 的 tabBar 一致性。
  - `node scripts/check-template-scope.js` — 模板作用域校验（约 50 条）。
- `node scripts/verify-slim.js` — **别随便跑**，会消耗 2 个正式 LL2 配额，只在改 `scripts/lib/slim.js` 字段映射时用。
- 数据管道脚本（**全部 CI 定时触发，本地不要手跑**）：
  - `scripts/sync.js` 15 分钟~每小时；`scripts/archive.js` 每小时 4 次
  - `scripts/news.js` 每 3 小时；`scripts/nasa-daily.js` 每天；`scripts/neo.js` 每天 UTC 02:20
  - `scripts/gcat.js` / `scripts/nasa-images.js` 每月 1 号
  - `scripts/videos.js` / `scripts/timeline.js` / `scripts/images.js` 每小时增量
- **CI 重跑技巧**：workflow 的 `on.push.paths` 只认 `scripts/sync-request.json`。
  改了脚本但该文件内容不变，纯代码 push **不会**触发抓取；要重跑必须动这个文件。
- 预览截图管道：`scripts/gen-preview-*.mjs` 生成自包含 HTML（真 COS 数据 + 编译后 wxss）
  → Edge 无头截图 → `sharp` 压 jpg。Edge 命令：
  `--headless=new --window-size=375,812 --force-device-scale-factor=2 --virtual-time-budget=8000 --screenshot=<Windows 绝对路径>`。
  **`--screenshot` 不认相对路径**，给相对路径会报「系统找不到指定的路径」。
  `gen-preview-today.mjs` 已失效（读已删除的 `components/activity-section/*.wxss`），补首页截图得重写。

## 三、踩过的坑（血泪清单，别重犯）

### 移动端表现
- **白闪**（详情页 `navigateBack` 转场那一帧整屏白）：
  - `pages.json` 的 `backgroundColor` / `globalStyle` **只是页面配置，管不到 WebView 底层**；
    `page { background-color }` 是内容根节点，WebView 没画内容时它也不存在。
  - 真正设 WebView 底色的是 `uni.setBackgroundColor`，而它**只对调用时那一个页面生效**。
    原先只写在 `App.vue` 的 onLaunch，等于只给启动页上了色。
  - 修法：`utils/page-bg.js` 是全局 mixin，`main.js` 里 `app.mixin(pageBg)`，每页 **onShow** 重设 `#0a0e17`。
  - **刻意不挂 onLoad**：页面自己的 onLoad 承担数据加载，mixin 掺进去有覆盖风险，收益只有一帧。
  - `utils/share.js` 用的是同一套 mixin 打法。
  - 仍待真机复核；若还闪，下一步是详情页根容器最外层加
    `position:fixed; inset:0; z-index:-2; background:#04060a` 的不透明底。
- **切 tab 弹键盘**：带焦点的 input + `wx.switchTab` 会把键盘带到目标页，甚至在新页自己重新弹起。
  - 全项目仅 5 处原生 input，此前零处 `hideKeyboard`。
  - 修法三处：`custom-tab-bar/index.js` 的 `go()` 在 `setData` **之前** 调 `wx.hideKeyboard({fail(){}})`
    （try/catch 包住）；`pages/rockets/rockets.vue` 新增 `onHide`；`pages/index/index.vue` 既有 `onHide` 里追加 `uni.hideKeyboard()`。
- `pages/search/search.vue` 的 input 是裸 `focus` 属性，每次 onShow 都自动聚焦弹键盘（从结果进详情再返回也弹）。
  嫌烦就改 `:focus="autoFocus"` + onLoad 置 true / onHide 置 false。
- iOS 11：`env(safe-area-inset-bottom)` 前必须有裸值兜底，`constant()` 与 `env()` 双写（全库现各 14 处）。
- 主包约 1.39 MB，无 subPackages，在 2 MB 限内 —— 新增重资源前先算账。

### 数据层 `utils/data.js`
- 三级缓存：L1 内存 → L2 Storage（key 带 `_v{DATA_VERSION}`）→ L3 CDN JSON；
  `load(name, {onUpdate})` 支持先渲染缓存再静默刷新回填。
- **`decorate()` 必须 `Object.assign` 以原始数据打底**，只覆盖需要改写的字段。
  旧的白名单式写法会**静默丢掉新字段且不报错**（3.2.20 曾把 `neoNears.totalKnown` 丢干净）。
  **症状识别：线上 JSON 对、页面显示 0 → 先 curl 原始 JSON，再查装饰层。**
- "停留在页面上就该看到更新" 的页面，`load()` **必须传 `onUpdate`**；进页面即重取的详情页/搜索页不必传。
  - `force` 分支**不触发** onUpdate，直接拿新数据。
  - `utils/list-mixin.js` 用变量 `conf.dataset` 统一取数且**已接 onUpdate**（index / event 两页走它）——
    用正则扫 `load('x'` 字面量做审计会**漏掉它**，必须单独看 mixin。
  - 后台刷新要保留用户已展开的量（`news-section` 用 `Math.max(shown, limit)` 否则「展开更多」会被收回）。
- **DATA_VERSION 实际有十处**，当前全部 = **14**：
  - `const DATA_VERSION = 14`：`utils/data.js`、`scripts/sync.js`、`scripts/images.js`、`scripts/gcat.js`、
    `scripts/nasa-daily.js`、`scripts/nasa-images.js`、`scripts/neo.js`、`scripts/news.js`（verify-pure 用 `pickVersionIn` 抠）
  - payload 里写 `v: 14`：`scripts/videos.js`、`scripts/timeline.js`（用 `pickPayloadVersionIn` 抠）
  - 升级必须**十处同改**，一处漏掉就是 videos/timeline 曾硬编码 13 的同类漂移。
- `DATA_VERSION` 只在 slim 结构变化时升（升了 = 25 个数据集的缓存 key 全失效）。
  图库另有独立后缀 `GALLERY_V`（图库天天涨，不该牵动全局缓存）。
- `scripts/sync.js` 上传是**白名单式显式 `upload()`（全文仅 4 处，无目录扫描）**：
  新增产物必须自己写 upload，否则 CI 跑完 COS 上根本没有文件。
  已有通用 `derive` 机制（`{file, dataset, filter, pick}`），与主文件共用同一 `generatedAt`。
- 分片数据集：`gallery.json` / `satellites.json` 是「索引 + 第 0 片」，后续片用 `galleryChunk()` /
  `satelliteChunk()` 触底拉取（卫星目录两万余条，每片 800）。
- 图库索引签名曾是 `md5(JSON.stringify(slice))`，不含 `count/chunks` → 尾部追加时第 0 片被跳过，
  count 永久停在 515（实际 614，线上少 99 张）。现签名含 `{slice,count,chunks,total}`，
  `total` 只给第 0 片（避免 `launchTotal` 变化白传所有片）。
- 弱网 / 无缓存时 `load()` 是 **reject**，不是返回 null。
  别写 `await spaceData.load('x').catch(() => null)` 再接 `xLoaded = true` —— 首屏弱网会变成**永久空 tab**
  （`pages/gallery-all/gallery-all.vue` 四个 loader 踩过；已去掉 `.catch`，让异常落外层 catch、
  标志保持 false 以便下次切回自动重试）。

### GCAT（Jonathan McDowell，CC-BY）
- `satcat.html` 是定宽文本，字段名互相包含（`Name`⊂`PLName`、`Mass`⊂`DryMass`⊂`TotMass`）。
  **列起始位置用正则 `(^|\s)FIELD\s` 锚列边界**（`scripts/gcat.js:153`），**不能用 `indexOf`** —— 会锚到子串上。
- **`status` 是"相位结束码"，不是类型**：
  - 在轨：`O` / `OX`（失联）/ `N`（改名）/ `DK`（已对接）/ `DSO`（深空）/ `AO`（附着在轨）/
    `GRP`（抓取在轨）/ `ATT`（附着）/ `DSA`（深空附着）/ `REL`（释放）/ `TFR`、`C` / `EVA DP`（出舱部署）
  - 已终结（`ENDED_STATUS`）：`R` 再入 / `D` 主动离轨 / `L` 落地 / `E` 爆炸解体 / `AR` 附着再入 / `R?`、`L?` 待定
  - **`R` 不是"火箭体"而是"已再入"**。
- **类别看 `type` 的首字母**（`CLASS_MAP` + `typeClass()`）：`P` 载荷 / `R1`~`R5` 箭体 / `C` 部件 / `D` 碎片 / `Z` 未知。
  写 `type === 'R'` 判箭体**恒为 0**。
- 产物：`satellites.json`（+ `satellites/N.json` 分片）、`orbit-stats.json`（四聚合 `byState/byOrbit/byClass/byDecade`，
  **无 `list`**）、`debris-events.json`。CC-BY 署名必须出现在 catalog / orbit / debris 三页 + 「我的 → 关于」。
- 季度更新的数据，CI 每月 1 号跑。

### 近地天体 NeoWs
- `scripts/neo.js` + `.github/workflows/neo.yml`，每天 UTC 02:20 抓未来 7 天飞掠地球的小行星。
- 同一物体可能出现两条记录（不同接近时刻），**按「临时编号 + 接近时刻」去重**（`dedupeKey`）。
- `PHA`（潜在威胁小行星）**≠ 会撞地球**：实测一周命中率约 21%，Sentry 风险表为 0 → **不做警示色**。
- 距离主轴用地月距离（LD）。
- 入口 `pages/neo` 独立；`pages/environment` 已降级为转发壳（`?tab=debris` → 太空资产，否则 → neo）。

### 译文质量（四层优先级，从高到低）
1. `utils/format.js` 的专名白名单（如 `CHINA_ASTRO_ZH`）
2. `scripts/translation-overrides.json` —— 原文 → 人工译文，命中就**完全不机翻、也不进缓存**
3. `scripts/data/i18n-terms.json` —— 机翻错译 → 正确译法，**写缓存之前 + `getZh` 返回之前各跑一遍**
   （历史脏数据不用清缓存也会被修正）
4. 机翻（`scripts/lib/translate.js`）：默认 `auto` = 先 Google 免费端点、失败降级 MyMemory；CI 用 `google`。
   失败静默留空，前端回退英文。并发 2 + 350ms 间隔（3 并发/200ms 会吃 429）。
- **别直接改 COS 上的数据文件**——全是 CI 产物，下一轮就被覆盖。改数据只能改脚本或人工表再 push。
- `astronauts.json` 862 条里**没有 `nameZh` / `nationZh` 键**（字段名叫 `agencyName`），
  中文名全靠 `format.js` 的 `CHINA_ASTRO_ZH` 查表（覆盖中国籍 30 人 + 香港黎家盈）。
  要彻底解决得在 CI 侧给 862 条补中文转写。
- 翻译缓存 `dist/translation-cache.json` 随数据同步到 COS，CI 每轮先下载再增量翻，真实翻译量每天个位数。
- 星云曾整页中文全空：Google 限流时不要死磕，达阈值就降级 MyMemory，失败阈值按批量放大，标题优先。

### 资讯 SNAPI（v4，免 key）
- `news.json` 由 `scripts/news.js` 每 3 小时抓一轮，保留最近 200 条；
  `launches[]` 里的 LL2 UUID 用于回连发射详情。
- `launches[]` = **本文提到的发射集合，不是主角**，没有主次字段；`launchRefs` 由 CI 算好。
  **没 `net` 的必剔**（没有 net 就翻不到归档，点进去必然「未找到」）—— 这是有意为之，
  别为了「每条都有发射标签」去放松。
- SNAPI 的 `launch_id` 是**事后挂**的：稿子先出现在「最新」那一路（launches 空），
  过一阵才进 `has_launch=true` 那一路。所以 `news.js` 有一道「2.6 补关联发射」：
  用本轮 incoming 的 `launches` 覆盖旧条目并 `delete it.launchRefs` 让下游重算。
  **旧条目"原样保留"的合并写法会让标签永远长不出来**（曾 28/61 有、最新的全无）。
- `cleanSummary` 必须在翻译**之前**跑（去 APOD 尾句、`appeared first on ...`、按词边界截断）。
- 封面必须用自家 CDN 图：SNAPI 快照 URL 会失效，`news.js` 每轮复查、失效就回原文重找。
- `web-view` 只能打开已配业务域名 → 一律「复制链接」。

### 审核暗门（勿回退）
- 事实（2026-10-25 实测纠错）：**审核员跑的是 `develop` 环境，`version` 恒为空**，不是 release。
  所以 `reviewVersions` 白名单对审核员永远不命中，真正起作用的是
  「白名单非空 + 拿不到版本号 → 工具态」这条兜底。
  `reviewVersions` 的实际语义 = **审核期总开关**：非空 = 审核中，空 = 正常期。
- `utils/config.js` 的分派：
  - `devtools` → 恒完整态（本机开发不受开关影响）
  - `develop`（= 审核员）/ `trial` / `unknown` → 白名单非空即工具态
  - `release` → 按白名单匹配
  - 基础库 < 2.2.2（`getAccountInfoSync` 不存在）→ 视为 devtools 放行
- **`custom-tab-bar/index.js` 里有一份等价实现**，原因是硬约束：
  - 微信原生组件，uni-app 编译器**直接拷贝目录、不做模块打包**；
    `require('../../utils/config.js')` 加载的是 ESM 源码，运行时报 `export` 语法错，审核暗门直接失效。
  - `verify-config` 用字符串抠函数名对拍，改名会让 17/17 直接红。
  - **结论：保留双份，改一边必须同步另一边，不要再尝试 unify**（判定结果另落 `appReviewResolved` 供原生组件读）。
- 请求失败一律按完整态兜底，绝不影响正常使用；TTL 5 分钟 + 内存缓存共享一次请求。
- 工具态内容：隐藏活动 tab 与活动列表、收起详情页长文、列表卡片去大图。
  各 tab 页自己处理去向（`switchTab` 失败 → `reLaunch` / 跳 rockets）。
- 真机想看完整态：本机覆盖暗门 `setOverride(false)`。

### LL2（The Space Devs Launch Library 2）
- 未认证 15 次/小时**按 IP** 计，本地调试会烧光配额。
- `mode=detailed` 易超时（**本机必超时 → 只能在 CI 抓**；国内拉 `limit=50&mode=normal` 要 27–160 秒，
  这是整套 CI 方案的根本原因）。
- `timeline` / `spacecraft_stage` / `vid_urls` 只在**单条 / detailed** 响应里有；
  `mode=normal` 连 `vid_urls` 这个键都不返回。
- **`vid_urls` 在 launch 顶层**，不在 `mission` 里（`slim.js` 曾读 `mission.vid_urls`，恒空 →
  「视频库 0 条」被误判成数据源不提供，写进了注释和 commit message）。
- `priority` 与「官方优先」是**反的**（官方那条 priority=10 最大），排序必须按 `type.id`
  （1 官方 / 3 转播 / 4 重播）。
- `relative_time` 是 ISO 时长。
- `mirrorImages` 去重 key 必须带预设宽度（不同尺寸同 URL 会被误合并）。
- 其他字段坑（实测）：`launch.image` / `event.image` / `agency.image|logo` 都是**对象**；
  `agency.founding_year` 是 number；`agency.launchers` 是字符串 `"A | B"` 不是数组；
  `/config/launcher/` 是 404，正确路径是 `/launchers/`。

### 其他历史坑
- `utils/format.js` 的 `dayOf` 用**正则按原串截取**，不用 `new Date()` ——
  东八区下 `new Date` 会把跨零点 UTC 时刻算成前一天，与页面口径分叉。
- 发射详情已拆成五件套：
  - `components/launch-detail/launch-detail.vue`（壳：状态 + 加载 + 页面级能力）
  - `launch-content.vue`（正文全部卡片，改父状态一律 `$emit` 回传）
  - `launch-photo.vue`（看图器：stage 满屏 + 横滑 + 底部按钮）
  - `launch-hero.vue`（首图轮播 + 图片库入口）
  - `launch-poster.vue`（离屏 canvas 海报）
  - `cur/curId/curNet`、`descExpanded`、`tlOpen` **必须留在父组件**
    （前者是 `loadKey` 触发条件，后两者换任务要复位）。
  - 子组件全部显式 `import` + `components` 注册，**不依赖 easycom**。
  - `$refs.detail` 对外能力保留：`shareText` / `shareImg` / `curId` / `_netQuery()` / `refreshReview()`。
- `launch-poster.vue` 里 `uni.createSelectorQuery().in(this)` 比原来深了一层组件，是全仓唯一用例。
  真机上海报生成不出来时，把 canvas 与绘制代码搬回父组件即可，其余拆分不受影响。
- 唯一看图入口是 `pages/launch/launchInfo?photo=1&setAlbum=...`；图片详情页是 `pages/photo-detail`
  （**必须挂 `nav-bar` 才有返回键**）。
- `favorites.js` 的 `createStore`：`sl_favorites_v1`（发射）与 `sl_fav_rockets_v1`（火箭）**必须分开**。
- 图库 `pages/gallery-all` 现是**分类浏览器**：
  - 顶部 tab `image/video/earth/astro/nasa`，`?tab=` 深链（`TAB_KEYS` 校验，默认 `image`）
  - `loadTab` 按 `*Loaded` 懒加载，每个 tab 只取一次
  - image tab 保留三列瀑布 + `galleryChunk` 增量 + `imageShow=60`
  - video 用 `split2` 两列 + `player-mask` 内联播放（抄 `video-gallery`）
  - 图库主页 `pages/gallery/gallery.vue` 的底部 dock **只有一个「看全部」入口**
    （3.2.27 收的口子）；NASA 影像已并入 `gallery-all` 的 `nasa` tab，
    **README 里「另设 NASA 影像入口」这句已过期，别再按它加回第二个 dock**
- 装列是**顺序贪心**，前缀切片不会重排（已验证 60→120 时前 60 格落位一致），所以增量渲染安全。
- 大集合别塞响应式：`rockets` 532 条放实例 `_all` + `libVersion` 做依赖、`launchers` 剥 `description*`、
  今日页宇航员只留 `inSpace` 11 条 → 单次 `setData` 从 734KB 降到 12KB 量级。
- 图片镜像管线（`scripts/lib/image.js`）：下载（跟随 302）→ `sharp` 压缩 → HEAD 判重 → 上传 → 回填 URL。
  - 尺寸**宽 480 / 上限 30KB**；带 alpha 的 logo 存 **PNG palette**（转 JPEG 会变黑底），其余 JPEG q72→40 逐档降。
  - 文件名 `md5(原URL)[0:16]`，内容不变地址恒定，靠 HEAD 跳过重复上传，`space-img/` 缓存一年。
  - 实测 244KB→15.2KB、PNG logo 47KB→6.8KB。镜像失败**保留原地址**不阻断出数据。
- COS 计费：入流量免费，外网下行成都地域约 0.5 元/GB。
  真正的成本风险是图片而不是 JSON —— 所以必须缩略图（30KB 内）+ 懒加载。
- GitHub Actions 公开仓库连续 60 天无提交会静默停用定时任务，workflow 里有保活步骤。

## 四、关键模块地图

- `pages/`（30 页注册 = 30 个 .vue）：
  - tab 五页：`today`（今日）/ `index`（发射）/ `gallery`（图库）/ `rockets`（火箭）/ `mine`（我的）
  - 二级与详情：`launch/launchInfo`、`rocket`、`agencies`、`pad`、`astronaut`、`stations`、`station`、
    `expedition`、`event`（内含 `eventInfo`）、`news`、`space-assets`（三 tab：在轨 / 卫星目录 / 解体）、
    `catalog`、`orbit`、`debris`、`neo`、`media`、`video-gallery`、`nasa-images`、`gallery-all`、
    `photo-detail`、`search`、`stats`、`version`、`environment`（转发壳）
- `components/`：`launch-detail/` 五件套、`nav-bar`、`countdown`、`next-launch`、`launch-card`、
  `launch-calendar`、各 `*-section`（catalog / debris / neo / news / orbit）、`filter-sheet`、
  `skeleton-card`、`star-field`。
- `custom-tab-bar/`：悬浮胶囊 tabBar，**原生 `wxml/wxss/js`，不是 .vue**，与 `pages.json` 的 `tabBar` 配置对拍。
- `utils/`：
  - `data.js` 数据层 / `format.js` 中文格式化与专名表 / `config.js` 审核开关
  - `page-bg.js` 底色 mixin / `share.js` 分享 mixin（覆盖 26 页）
  - `search-match.js` / `favorites.js` / `list-mixin.js` / `changelog.js`
  - `media.js` / `album.js` / `daily.js` / `history.js` / `nav-mixin.js` / `rocket-lookup.js` / `tabbar.js` / `timeline.js`
- 数据集键名（`utils/data.js` 的 `FILES`）：
  `upcoming` / `upcomingMore` / `previous` / `events` / `agencies` / `launchers` / `cores` /
  `astronauts` / `astronautsInspace` / `astronautsSearch` / `spacestations` / `expeditions` /
  `dockings` / `pads` / `stats` / `onthisday` / `timelines` / `videos` / `gallery` / `satellites` /
  `orbitStats` / `debrisEvents` / `neoNears` / `news` / `apod` / `epic` / `nasaImages`
- 启动页数据要分片：启动只需 ~47KB（`astronauts-inspace.json` 11 条 2.2KB）——
  曾实拉 1415.7KB（利用率 3.3%）。App 预热只留 `onthisday` + `news`。
- 首页「每日一览」三卡：每日一图（APOD）/ 每日地球（EPIC）/ 每日天文，均走 `pages/photo-detail`。
- `docs/`：`部署说明.md`、多份 `代码评审-*.md` 与调研报告、`screenshots/`、
  `ai-knowledge/`（三份可直接上传微信 AI 知识库的文档）。
  **知识库绝不写实时数据**（在轨数量、下次发射日期、总发射次数）—— 静态快照会被 AI 拿过期数字自信作答，
  比不回答更糟；只传稳定的解释性内容。

## 五、本机环境限制（务必如实告知用户）

- **本机没有 Node.js**（已核实：Git Bash `node` not found；Program Files / npm / nvm / scoop /
  HBuilderX 捆绑目录均无 `node.exe`）。→ `verify-pure` / `verify-config` / `check-tabbar` /
  `check-template-scope` **四个守卫都跑不了**。
  **不要拿猜测冒充结果**，改完必须明确说「守卫未跑，需在 CI 或装了 Node 的机器上验证」。
- **Python 3.11.15 可用**（`C:\Espressif\tools\python\python`，ESP-IDF 带的，PATH 里已有 `python`）。
  跑脚本务必 `PYTHONIOENCODING=utf-8 python x.py`，否则 GBK 控制台报 `UnicodeEncodeError`。
- **`manifest.json` 允许 JS 注释**（第 8 行 `/* 5+App特有相关 */`，HBuilderX 标准产物）。
  严格 `json.loads()` 会报「Expecting property name」——**这是误报不是 bug**，
  先剥 `/* */` 与 `//` 再校验，别去"修"这个文件。
- 网络：本机 `api.github.com` / `i.ytimg.com` / `pbs.twimg.com` **不通**；
  LL2 单条详情必超时（只能在 CI 抓）；`lldev.thespacedevs.com` 不限速但数据陈旧，
  已做成 `--base=dev` 开关供本地联调。**CI 在海外**，翻译也靠海外节点。
- Windows + Git Bash；文本文件行尾多为 **CRLF**，脚本改 `pages.json` 时注意别把行尾刷掉。
- `.gitignore` 已排除：`dist/`（数据快照，不入库）、`unpackage/`、`node_modules/`、
  `scripts/node_modules/`、`minitool/`、`.skill/`、`.workbuddy/`、`project.private.config.json`。

## 六、交接须知

- 每次会话结束前，**把本轮产生持久价值的结论写回本文件**（踩的坑、定下的规则、版本现状、待办）；
  过时的事实就地改掉，别让新旧两条并存。写之前自问：新开对话的人只读这一份，能不能接着干？
- `.workbuddy/memory/` 是旧工具 WorkBuddy 的目录，**DSH 完全不读**，只作历史档案；
  本文件才是项目记忆的权威来源。那份 `MEMORY.md` 的版本主线（1.0 → 3.3.1）想看细节再去翻日期日志。
- 待办（截至 2026-11-01）：
  1. 3.3.1 提审中；过审发布后立刻把 `scripts/app-config.json` 清回 `[]` 并 push。
  2. 白闪修复仍待真机复核（若仍闪 → 详情页根容器最外层加不透明底）。
  3. `satellites/26.json` ~ `41.json` 是**孤儿分片**：`gcat.js` 写完新分片后应按 `chunks` 反查删除多余片（未做）。
  4. EPIC 停更（上游 DSCOVR 无新帧）、APOD 视频日被 `media_type !== 'image'` 跳过 —— 方案已给，用户未选。
  5. 宇航员中文名剩余约 123 条，靠 CI 每日 UTC 23:10 自动跑（`ASTRO_NAME_LIMIT=280/轮`）。
  6. 2026-10-31 那批 21 个文件的修复（gallery-all 空 tab、DATA_VERSION 扩到十处、
     iOS `constant()` 补齐、`console.log` 清理、`.catch` 补齐）**仍留在工作区未提交**，
     随 3.3.2 发布；别忘了先在 CI 跑守卫再提。
