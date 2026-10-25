# 全量代码评审报告

- 日期：2026-10-25
- 范围：v3.1.8 工作区（commit `ef55528`），源码约 17400 行
- 性质：**只分析，未改动任何文件**

## 扫描覆盖

机械扫描（脚本自动，全部通过）：

- require / import 引用完整性：0 失效
- pages.json 页面注册：无缺失、无未注册文件
- tabBar：pages.json 与 custom-tab-bar/index.js 完全一致
- 死样式（`</style>` 之外的 CSS）：无
- 语法（node --check 全部 js）：无错误
- env(safe-area-inset) 兜底：2 处报警均为误报（三层写法完整）

人工精读：`scripts/videos.js`、`scripts/timeline.js`、`scripts/lib/cos.js`、`scripts/lib/image.js`、`utils/data.js`、`utils/config.js`、`pages/launch/launchInfo.vue`、`pages/media/media.vue`、`.github/workflows/sync.yml`

---

## P1 — 建议必修

### 1. CI 数据清空风险（timelines / videos）

**位置**：`scripts/lib/cos.js:112`（readCosJson）、`scripts/timeline.js:127`、`scripts/videos.js:100`

`readCosJson` 把「网络失败」和「文件不存在」都返回 `null`。两个增量脚本读不到旧数据时按空 list 处理，本轮只写入新抓的几条就覆盖上传——**线上历史数据（600 / 400 条）一次性清零且不可自愈**（下轮读到的就是清零后的文件）。

videos.js:101 有本地 dist 兜底，但 CI 是全新 runner 且 dist 被 gitignore，**兜底在 CI 上无效**。

**修法**（二选一，可都做）：

1. `readCosJson` 区分 404（返回 null）与其它错误（抛错，本轮中止）：
   ```js
   const res = await fetch(url, ...)
   if (res.status === 404) return null   // 真的不存在
   if (!res.ok) throw new Error('HTTP ' + res.status)
   ```
2. 上传前防回退校验：`if (before > 20 && list.length < before * 0.3) { 跳过上传并告警 }`

### 2. LL2 配额在 timeline 轮超限

**位置**：`.github/workflows/sync.yml:11-13`、`scripts/timeline.js:35`

固定每小时 8 次（upcoming 4 + events 1 + previous 1 + video 2），timeline 轮再加 8 = **16 > 15 次/小时**。sync.yml 注释「合计约 11 次/小时」是按 3 小时摊销的算法，LL2 限额按时间窗口计。timeline 整轮可能 429（`getJson retries: 0` 不重试），靠下轮自愈但浪费一整轮配额。

**修法**：`TIMELINE_PER_RUN` 降到 6（8+6=14），或配 `LL2_TOKEN` 一劳永逸。

---

## P2 — 建议修

### 3. 老基础库正式版用户被误判进审核态

**位置**：`utils/config.js:120`

兜底规则「拿不到版本号 → 工具态」。但微信基础库 < 2.2.2 没有 `getAccountInfoSync`，**正常用户**也会拿不到版本号 → 全部进工具态。

**修法**：确认 `manifest.json` / 后台的最低基础库设置 ≥ 2.2.2；不是则改兜底条件或提升最低库版本。

### 4. launchers / pads 缺 SOFT_TTL

**位置**：`utils/data.js:68`（SOFT_TTL）

走默认 15 分钟，但这两个数据集每天才更新一次。launchers 435KB，用户每次打开火箭页间隔 >15 分钟就重拉 435KB。

**修法**：`SOFT_TTL` 加 `launchers: 12h`、`pads: 12h`（与各自更新频率对齐）。

### 5. timelines / videos 未纳入存储管理

**位置**：`utils/data.js:148`（EVICT_ORDER）、`utils/data.js:86`（HARD_TTL）

两个新增数据集（各约 200KB+ 且会持续增长）既不在淘汰顺序里，也没有硬过期上限——存储紧张时它们不会被让位。

**修法**：EVICT_ORDER 加 `videos, timelines`（放 pads 之后）；HARD_TTL 各给 7 天。

### 6. clear() 清不掉历史版本缓存

**位置**：`utils/data.js:400`

cacheKey 带 DATA_VERSION，版本升级后旧 key 永久残留在用户 Storage（10MB 配额）。

**修法**：clear() 改为遍历所有版本 key：按 `sl_data_` 前缀 + 已知数据集名逐个尝试删除，或使用 `uni.getStorageInfoSync().keys` 过滤前缀。

---

## P3 — 记录在案，可不修

| # | 问题 | 位置 | 说明 |
|---|---|---|---|
| 7 | videos 覆盖回退 | videos.js:156 | 重抓同一 id 时 cover 先写回 YouTube 原链再镜像；镜像失败的窗口期封面黑块，下一圈自愈（headObject 命中复用） |
| 8 | videos 游标漂移 | videos.js:124 | 快照每小时刷新，cursor 的 index 语义漂移；循环扫模式自愈，个别条目漏抓/重复 |
| 9 | timeline 快照 id 重复 | timeline.js:135 | 发射中状态可能同时在 upcoming/previous → 同轮重复请求浪费 1 配额，概率低 |
| 10 | slim.js 的 vid 是死代码 | scripts/lib/slim.js | 列表端点不返回 vid_urls，`vid` 恒为 `[]`，前端靠 videos.json 合并。**3.1.8 事故正是这个字段引发的**，建议删除防再踩 |
| 11 | cut() 两处不一致 | timeline.js:57 / videos.js:49 | 超长截断一处 n+1 字符、一处 n 字符 |
| 12 | 无效查询参数 | timeline.js:109 | 单条详情无视 `?mode=normal` 一律 detailed，参数留着误导 |
| 13 | GitHub 共享出口 IP | sync.yml | 未配 LL2_TOKEN 时按 IP 限流理论上受其它 GitHub Actions 用户连累（现状能跑，实际宽松） |
| 14 | config 5 分钟缓存窗口 | config.js:38 | 控制台改白名单后，已打开过的设备最多 5 分钟内仍用旧值（设计取舍，知晓即可） |

---

## 审核态专项结论（2026-10-25 修正版）

> 初版结论「空版本号 → 工具态，方向安全」**是错的**，用户实测推翻。修正如下。

### 审核暗门当前完全失效（升级为 P1-3）

微信开放社区官方回复确认：**审核员审核时 envVersion 返回 `develop`（开发版口径）**，
开发版下 `miniProgram.version` 为空。审核预览通道（微信开发者助手）同理。

而 `utils/config.js:301`：

```js
// 审核态只在正式版生效：开发版/体验版永远完整态，不读 COS
if (!isReleaseBuild()) return Promise.resolve({ review: false })
```

审核员是 develop → `isReleaseBuild()` 为 false → **直接返回完整态，
白名单判定（config.js:95-122）根本执行不到**。整套机制只在 release 生效，
而 release 恰恰不需要隐藏 —— 暗门从未对审核员生效过。

佐证：用户在微信开发者助手打开待审核的 3.1.0，看到的是完整态。
另：此前多轮提审均通过，说明工具态隐藏的内容（活动 tab、长文折叠等）
本身未触发拒审 —— 暗门可能并非必要，修复价值需权衡。

### 修复方案（P1-3，约 20 行，仅改 config.js）

1. 去掉 `isReleaseBuild()` 一票放行，按环境分派：
   - **开发者工具**（`uni.getSystemInfoSync().platform === 'devtools'`）→ 永远完整态（保护本地开发）
   - **develop 真机 / trial / release** → 走白名单：
     - 白名单非空：release 有版本号按白名单匹配；develop 无版本号 → 兜底工具态（审核员落在此格）
     - 白名单为空：完整态
2. 自己真机预览想看完整态：用已有 `setOverride` 本机覆盖暗门，或平时白名单留空。
3. 副作用（需知晓）：**体验版也开始受白名单控制**，发给测试人员的是工具态。

### 白名单版本号（修复后依然要做）

COS 白名单目前是 `["3.1.0"]`，manifest 已是 **3.1.8**。提审 3.1.8 前必须
把 `app-config.json` 改成 `{"reviewVersions": ["3.1.8"]}`，过审后清空。

## 修复顺序建议

1. P1-1（数据清空）→ 2. P1-3（审核暗门失效）→ 3. P1-2（配额）→ 4. P2 按需 → 5. P3 顺手

P1-1 + P1-2 + P1-3 合计约 40 行改动，风险低，建议一次做完。
