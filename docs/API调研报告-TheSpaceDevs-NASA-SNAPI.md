# TheSpaceDevs / NASA / Spaceflight News API 调研报告

- **调研时间**：2026-10-28 20:20（只读调研 + 端点实测，未改动任何代码）
- **调研对象**：
  - https://thespacedevs.com/snapi （Spaceflight News API）
  - https://api.nasa.gov/ （NASA 开放 API 目录）
  - https://api.spaceflightnewsapi.net/v4/docs/ （SNAPI 文档 / OpenAPI 规范）
- **结论先行**：三家能补的东西完全不同。**SNAPI 是唯一能补上你小程序最大空白的那个**（现在完全没有新闻/资讯），且它自带 LL2 的 `launch_id`，能把「发射」和「报道」闭起来。NASA 里有 3 个真能用（近地天体、每日天文图、地球全貌），但 **APOD 的官方端点已经废弃**，必须换新地址。其余大多不可用或与航天主题弱相关。

---

## 一、三家是什么关系（先理清，避免重复投入）

| 站点 | 归属 | 本质 | 你现在的状态 |
|---|---|---|---|
| **LL2**（Launch Library 2） | The Space Devs | **事实数据库**：发射、火箭、宇航员、空间站、对接、机构、场地 | **已在用**（2.2.0），是小程序的数据地基 |
| **SNAPI**（Spaceflight News） | The Space Devs | **内容流**：新闻、博客、报告 | **完全没用** |
| **api.nasa.gov** | NASA | **影像与科学数据**目录（15 个子 API） | **完全没用** |

一句话：LL2 告诉你「什么时候发射」，SNAPI 告诉你「这件事后来怎么样了」，NASA 给你「图和科学背景」。

---

## 二、SNAPI —— 最值得做的一个

### 2.1 基本信息（实测确认）

| 项 | 值 |
|---|---|
| 版本 | 4.37.1（v4） |
| 鉴权 | **无需 API Key**（`security: none`） |
| 费用 | 免费（官方鼓励 Patreon 赞助，非强制） |
| 实测总量 | **36,679 篇文章** |
| 分页 | `limit` / `offset`，返回 `{count, next, previous, results}` |
| GraphQL | 有，`/v4/graphql/` |

### 2.2 端点与字段

| 端点 | 内容 | 说明 |
|---|---|---|
| `GET /v4/articles/` | 新闻文章 | 主用 |
| `GET /v4/articles/{id}/` | 单篇 | |
| `GET /v4/blogs/` | 博客 | 多为机构博客（如 NASA Curiosity 日志） |
| `GET /v4/reports/` | 报告 | 如 ISS 日报，量少 |
| `GET /v4/info/` | 元信息 | |

**Article 字段（全部）**：
`id, title, authors[], url, image_url, news_site, summary, published_at, updated_at, featured, launches[], events[]`

**最关键的两个字段是 `launches[]` 和 `events[]`** —— 它们装的是 **LL2 的 UUID**，实测样本：

```json
"launches": [{ "launch_id": "df8d4fdb-9add-4ce9-9f0e-aae1c61df212",
               "provider": "Launch Library 2" }]
```

这意味着：**一篇新闻可以直接链回你已有的发射详情页**，反之发射详情页也能挂「相关报道」。这是纯增量价值，不需要任何新数据源。

### 2.3 检索能力（比想象中强）

`/v4/articles/` 支持的参数远超「拉个列表」：

- `has_launch` / `has_event`（布尔）—— **只取「和某次发射/事件有关」的新闻**，这一条就能把资讯流收敛成航天垂直内容，过滤掉泛科技水文
- `launch=<uuid>` / `event=<uuid>` —— 给定发射，取它的全部相关报道
- `news_site` / `news_site_exclude` —— 按源筛选
- `title_contains_one` / `summary_contains_one`（传数组）—— 关键词命中任一
- `published_at_gt/gte/lt/lte` —— 时间窗，CI 增量抓取就靠它
- `ordering`（如 `-published_at`）、`is_featured`

### 2.4 内容源

实测 `news_site=NASASpaceflight` 命中 **2,380 篇**。已知包含 NASASpaceflight、NASA 官方博客等数十家英文航天媒体。

> **风险点**：**全是英文**。你的小程序是中文的，新闻标题/摘要必须走翻译。好消息是你项目里已经有「译文三层机制」（人工校对表 / 术语纠正 / 巡检），这套能力可以直接复用——但要意识到这会给 SNAPI 增加一道工序，不是免费的。

---

## 三、NASA 各 API 实测（逐个真跑过，不是看文档）

### 3.1 可用性总表

| API | 实测 | 数据内容 | 对你的价值 |
|---|---|---|---|
| **NeoWs** 近地天体 | ✅ 200 | 小行星直径/速度/最近距离/危险标记 | ★★★ 高 |
| **APOD** 每日天文图（**新端点**） | ✅ 200 | 图/视频 + 标题 + 解说 + 版权 | ★★★ 高 |
| **EPIC** 地球全彩 | ✅ 200 | 每天 13 张地球全貌 + 坐标/姿态 | ★★☆ 中 |
| **NASA Image Library** | ✅ 200 | 15 万+ 图像/视频，含多尺寸 | ★★☆ 中 |
| **TLE API** 两行根数 | ✅ 200 | 卫星轨道根数（第三方托管） | ★★☆ 中（但工程重） |
| **Insight** 火星天气 | ✅ 200 | 火星气温/气压/风速 | ★☆☆ 低（数据停在 2022） |
| **EONET** 地球自然事件 | ✅ 200 | 飓风/野火/火山 + 轨迹 | ★☆☆ 低（非航天主题） |
| **DONKI** 空间天气 | ❌ **503** | 太阳耀斑/CME/地磁暴 | 暂不可用 |
| **CNEOS** 近地天体轨道 | ❌ **502** | 精确轨道/撞击概率 | 暂不可用 |
| **Exoplanet** 系外行星 | ❌ **404** | 系外行星表 | **端点已失效** |
| GIBS / Trek WMTS | 未测 | 地图瓦片服务 | 小程序瓦片渲染成本高 |

### 3.2 重点说三个

#### ① NeoWs 近地天体 —— 与你已有内容天然咬合

实测返回结构（2026-10-29 当天 6 颗）：

```
name, id, neo_reference_id, nasa_jpl_url,
absolute_magnitude_h,
estimated_diameter{ kilometers{min,max}, meters{...} },
is_potentially_hazardous_asteroid,
is_sentry_object,
close_approach_data[{ close_approach_date_full,
  relative_velocity{ kilometers_per_hour, kilometers_per_second },
  miss_distance{ kilometers, lunar, astronomical } }]
```

字段干净、单位齐全、无需翻译（数值型）。**这是三个来源里工程成本最低、数据质量最高的一个**。

你已有 GCAT 的「解体 / 再入」事件流——那是「东西掉下来」。NeoWs 是「东西从外面飞过来」。两者合起来就是一个完整的**「太空环境」**栏目：地球周围的物体 + 来自外部的近地天体。

#### ② APOD —— **官方端点已死，必须换地址**（这次调研最重要的技术发现）

`https://api.nasa.gov/planetary/apod` **现在对任何日期都返回 HTTP 200 + 同一个 NASA logo 占位图**，不报错、静默失败。我测了今天和 2024-06-01 两天，返回完全一致：

```json
{ "title": "NASA Science",
  "explanation": "To view this video please enable JavaScript...",
  "url": "https://science.nasa.gov/wp-content/themes/nasa-child/assets/images/nasa-logo@2x.png" }
```

原因（已查证）：NASA 于 **2026-09-29** 把 APOD 迁到 `science.nasa.gov`，旧 API 未同步；**旧端点将于 2026-12-01 彻底关闭**。这是社区里已有多人在踩的坑（KDE 壁纸、多个第三方 App 都因此静默失效）。

**可用替代**（我实测通过）：

```
GET https://science.nasa.gov/wp-json/wp/v2/apod-basic/?per_page=1
```

返回字段（实测 2026-10-28）：

`date, post_id, title, permalink, media_type, explanation(HTML), credit, copyright, alt, url, hdurl, basic_html`

要点：
- `hdurl` 才是真图（`assets.science.nasa.gov/dynamicimage/...?w=1600`，自带缩放参数，可省一次图片处理）
- `explanation` 是 **HTML 带 `<a>` 链接**，入库前要清洗
- `media_type` 可能是 `video`，那种日子的 `hdurl` 是占位图，要单独处理
- `url` 字段现在是**文章页**不是图片——沿用旧 API 习惯会拿错

#### ③ EPIC 地球全彩 —— 视觉上最讨巧

每天约 13 张（实测 13），DSCOVR 卫星从 L1 点拍的地球全貌。带 `centroid_coordinates`（经纬度中心）、姿态四元数、日月位置。

图片 URL 是确定的拼接规则：`/EPIC/api/natural/images` + `archive/natural/YYYY/MM/DD/jpg/{image}.jpg`。做「每日地球」卡片很轻。

---

## 四、LL2 的一处版本提示

你项目现在用的是 **2.2.0**，官方已发布 **2.3.0**（`https://ll.thespacedevs.com/2.3.0/`）。

- 我尝试抓 2.3.0 变更日志，文档页是 JS 渲染，取不到正文；本机直连 thespacedevs 也超时（与你记忆里的网络限制一致）
- **不着急升级**。2.2.0 现有管道跑得好好的，升级要先在 CI 上验证字段是否兼容，属于独立任务，不该和这次新功能混在一起
- 限流已确认：**未认证 15 次/小时**（免费），更高配额走 Patreon。你现在全部走 CI 预抓，所以不构成约束

---

## 五、和你小程序现状的匹配度

### 5.1 你现在有什么（盘点）

发射库 / 火箭资料与实力榜 / 宇航员 / 空间站·远征队·对接 / 活动 / 图库 / 数据统计 / 每日一图 / 往年今日 / GCAT 卫星百科·全球在轨·解体再入。

**强项**：事实数据（谁、何时、何箭、何轨）非常完整，且都是结构化、可筛选的。
**短板很明确**：**全是「数据」，没有「内容」**。用户看完「某发火箭明天发射」之后，没有下文可读。

### 5.2 空白与对应来源

| 空白 | 谁能补 | 优先级 |
|---|---|---|
| **新闻 / 资讯流**（完全空白） | SNAPI | **P0** |
| **近地小天体**（完全空白） | NeoWs | P1 |
| **天文 / 深空**（完全空白） | APOD 新端点 | P1 |
| **地球观测**（完全空白） | EPIC / NASA Image Library | P2 |
| 卫星实时轨迹（半空白：有编目无轨道） | TLE API + SGP4 | P2（工程重） |

---

## 六、推荐方案

### P0 · SNAPI 资讯流（强烈建议，收益最大）

**做什么**：新增「资讯」tab 或探索页入口，列表 + 详情（标题中文、摘要中文、配图、来源与原文链接）。

**为什么是最优先**：
1. 补的是**结构性空白**（你没有任何内容消费场景），不是锦上添花
2. `has_launch=true` 能把泛科技水文滤掉，天然是航天垂直内容
3. `launches[]` 可直接回连发射详情页——**「发射 → 报道」闭环**，这是现有模块之间的新连接，不需要新数据源
4. 工程量小：一个 CI 抓取器 + 一个列表页 + 一个图文详情页，和你现有 `events` 那套几乎同构

**抓取策略**：CI 每 2 小时拉一次 `has_launch=true&ordering=-published_at&limit=30`，只保留最近 200 条，增量按 `published_at_gt` 过滤。**绝不实时调用**。

**必须注意**：
- 版权：**只存标题 + 摘要 + 跳原链接，不全文转载、不二次排版**。SNAPI 聚合的是第三方媒体的文章，正文版权在媒体手里
- 翻译：标题+摘要走你已有的三层译文机制
- 内容合规：见第七节风险

### P1 · NeoWs 近地天体（性价比最高）

**做什么**：「太空环境」栏目下的「今日近地飞掠」——今日/本周有几颗、多大、多近（用「地月距离」做参照最直观）、是否标为潜在危险。

**为什么排 P1 而非 P2**：字段全数值、无需翻译、无版权问题、数据稳定、一天拉一次就够。它是三个来源里**投入产出比最好的**。

**注意**：`is_potentially_hazardous_asteroid` 要解释清楚——它指「尺寸和轨道足够近，需要长期监测」，**不等于会撞地球**。小程序里不做这个说明，容易变成谣言源。这与你之前处理 GCAT「解体」含义踩过的坑是同一类问题。

### P1 · APOD 每日天文（视觉锚点）

**做什么**：每日一张天文图 + 中文解说。

**必须用新端点** `science.nasa.gov/wp-json/wp/v2/apod-basic/`，不要用 `api.nasa.gov/planetary/apod`。

**可以和你现有的「每日一图」合并成一个模块**：现在每日一图是「发射现场照」，APOD 是「宇宙」。做成同一页两个 tab 或轮播，比新开一个页面更合理——你之前已经因为「入口太多」砍过一次探索页了。

### P2 · EPIC 地球全貌 / NASA 图像库

- **EPIC**：每日地球，视觉强、工程轻，适合放「每日一图」里做第三块
- **NASA Image Library**：15 万+ 公有领域图像，适合做**专题图集**（阿波罗、哈勃、韦布、火星车）。但注意它和你现有「发射现场图库」定位不同——那个是「新闻纪实」，这个是「资料档案」，别混在一个 tab 里

### 暂缓 / 不做

| 项 | 原因 |
|---|---|
| DONKI 空间天气 | 实测 **503**，服务不稳，不能作为功能依赖 |
| CNEOS 精确轨道 | 实测 **502** |
| Exoplanet | 端点 **404**，已失效 |
| Insight 火星天气 | InSight 任务 2022 年结束，数据不再更新，做出来是「死数据」 |
| EONET 自然事件 | 数据可用，但飓风野火火山与「航天发射」主题关联弱，会把小程序定位冲淡 |
| TLE 实时轨迹 | 技术上可行（小程序端 SGP4 + 用户定位做过境预报），但计算量大、精度受限于 TLE 时效、还要处理权限与定位。**收益远小于投入**，除非你明确想做「卫星过境提醒」这个垂直点 |
| 实时直连任一 API | 限流 + 本机网络 + 小程序域名白名单，三重不合适。必须走现有 CI→COS 链路 |

---

## 七、工程落地要点（共用）

| 项 | 说明 |
|---|---|
| **架构** | 完全复用现有 `CI 抓取 → COS → 小程序 CDN 读` 链路。新增抓取器挂到独立 workflow 或并入 `sync.yml` 的 dataset 开关，不引入新的运行时依赖 |
| **限流测算** | SNAPI 无 key 无明确硬限流（实测稳定）；NASA 有 key 1000 次/小时、DEMO_KEY 仅 30 次/小时/IP。**CI 里必须配置真实 key**（免费申请），别用 DEMO_KEY 跑批 |
| **缓存** | 沿用你已有的 TTL + 独立缓存版本机制。新闻类 TTL 要短（1~2 小时），近地天体/APOD 一天一次即可 |
| **图片** | 全部镜像到 COS（你已踩过「直连海外图源 127KB/张、国内加载半天」的坑）。APOD 的 `hdurl` 自带 `?w=1600` 参数，取合适尺寸再镜像 |
| **翻译** | SNAPI 与 APOD 全英文，走既有三层译文机制；数值类（NeoWs/EPIC）不需要 |
| **版权** | NASA 内容多为公有领域（仍需看单条 `copyright` 字段，APOD 有署名摄影师的情况）；SNAPI 只做摘要+跳转；GCAT 保持 CC-BY 署名 |

### ⚠️ 一个必须提前想清楚的风险：内容合规

这是接 SNAPI 最大的非技术风险，比限流、比翻译都重要：

1. **第三方新闻内容**进入小程序，平台侧对内容安全有要求。航天新闻里出现国家、军事、涉台涉疆等地缘表述是**高频**的（发射场、卫星用途、军方载荷）。
2. 建议做法：CI 侧加**关键词过滤 + 白名单源**（只取 NASA 官方博客、NASASpaceflight 这类纯技术源），入库前过滤，而不是抓完再筛。
3. 详情页**永远跳原文**，不在小程序内做全文转载——既规避版权，也规避内容责任。
4. 如果判断这块风险不可控，**替代方案**：只做「与发射关联的报道标题 + 跳转」，即 `has_launch=true` 且只展示标题，不展示摘要。这样内容面最小，仍能实现「发射↔报道」闭环。

---

## 八、结论

按「补空白 / 投入产出 / 风险」三项综合排序：

1. **SNAPI 资讯流** —— 唯一能补结构性空白的，且能和现有发射库互链。**建议先做，但先把内容合规方案定下来再做。**
2. **NeoWs 近地天体** —— 投入最小、数据最干净，能和 GCAT 事件流组成「太空环境」栏目。
3. **APOD（新端点）** —— 视觉价值高，但**必须换地址**，且建议并入现有「每日一图」而非新开页面。
4. **EPIC / NASA 图像库** —— 有余力再做，属于素材补充。
5. **其余（DONKI/CNEOS/Exoplanet/Insight/EONET/TLE）** —— 不做或暂缓，实测已排除。

**不建议**同时上四个。你之前刚因为「探索页入口过多」调整过一次顺序，模块数量已经接近用户耐心上限。建议**一次只加一个模块**，从 SNAPI 开始，跑顺了再谈下一个。

---

## 附录：实测记录（2026-10-28 20:15–20:25）

| 请求 | 结果 |
|---|---|
| `GET /v4/schema/?format=json` | 200，52,821 B，OpenAPI 3.0.3，v4.37.1 |
| `GET /v4/articles/?limit=1` | 200（首次超时，重试即成功），`count=36679` |
| `GET /v4/articles/?news_site=NASASpaceflight` | 200，`count=2380` |
| `api.nasa.gov/planetary/apod`（今天） | 200 但**返回 NASA logo 占位** ❌ |
| `api.nasa.gov/planetary/apod?date=2024-06-01` | 200 但**同样占位** ❌ |
| `science.nasa.gov/wp-json/wp/v2/apod-basic/?per_page=1` | **200，10,534 B，数据完整** ✅ |
| `api.nasa.gov/neo/rest/v1/feed` | 200，14,237 B，当日 6 颗 ✅ |
| `api.nasa.gov/EPIC/api/natural` | 200，13 张 ✅ |
| `api.nasa.gov/insight_weather` | 200，36,505 B（历史数据） |
| `api.nasa.gov/DONKI/GST` | **503** upstream connect error ❌ |
| `ssd-api.jpl.nasa.gov/cad.api` | **502** ❌ |
| `api.nasa.gov/planetary/exoplanet` | **404** ❌ |
| `eonet.gsfc.nasa.gov/api/v3/events` | 200，13,260 B ✅（主题弱） |
| `images-api.nasa.gov/search?q=artemis` | 200，15,185 hits ✅ |
| `tle.ivanstanojevic.me/api/tle/?search=ISS` | 200，返回 ISS 等 TLE ✅ |
| `ll.thespacedevs.com/2.3.0/launches/` | 本机超时（网络限制，非服务故障） |

> 实测用的临时文件放在 `dist/_api/`（已在 .gitignore 内），调研结束后已清理。
