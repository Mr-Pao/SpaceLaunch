# SpaceLaunch 小程序

航天发射跟踪类微信小程序：即将发射、历史发射、航天资讯、图库、火箭与航天器百科、太空资产。

![小程序码](小程序码.jpg)

数据不是小程序直连 API 拿的 —— 上游接口都有频率限制、海外延迟和域名限制，
所以全部由 GitHub Actions 在海外节点定时抓取、裁剪、中文化、图片转存，
落到腾讯云 COS，小程序只读静态 JSON。

## 功能

**五个 tab**

| tab | 内容 |
|---|---|
| 今日 | 每日一图 / 每日天文 / 每日地球三卡轮播、「此刻在天上」的在轨航天员、当前任务、往年今日 |
| 发射 | 下一个发射倒计时、即将发射与已发射列表、搜索与多维筛选 |
| 图库 | 铺满整屏的漂流图墙；分类浏览发射图片 / 发射视频 / 今日地球 / 天文 / 星云，另设「NASA 影像」独立入口 |
| 火箭 | 型号库、综合榜（贝叶斯收缩成功率 × 对数活跃度）、型号搜索 |
| 我的 | 收藏的发射与火箭、统计入口、版本记录 |

**详情与百科**

- 发射详情：时间线、箭体、载荷、工位、图片与视频内联播放
- 火箭 / 机构 / 发射工位 / 航天员 / 空间站 / 远征队
- 太空资产：全球在轨、卫星目录、解体与再入事件
- 近地天体、航天资讯、活动日历、发射统计
- 全局搜索：发射 / 火箭 / 航天员 / 工位 / 机构

## 架构

```
GitHub Actions（海外节点）                      COS + CDN（成都）
├─ sync.yml        每 15 分钟 ~ 每小时    →    space-data/*.json
├─ archive.yml     每小时 4 次（页数按配额自动）→ space-data/history/pNN.json
├─ backfill.yml    每小时 4 次（补译文）   →    不占上游配额
├─ news.yml        每 3 小时             →    space-data/news.json
├─ nasa-daily.yml  每天 12:00            →    space-data/apod.json / epic.json
├─ neo.yml         每天 10:20            →    space-data/neo-nears.json
├─ gcat.yml        每月 1 号             →    space-data/satellites*.json
└─ nasa-images.yml 每月 1 号             →    space-data/nasa-images.json
                                                     ↓ uni.request
                                             小程序（Storage 缓存优先渲染）
```

小程序端三级缓存：**内存 → Storage → CDN**。冷启动先用缓存渲染，再后台静默刷新，
新数据通过 `onUpdate` 回调回填页面，所以更新通常不用退出重进。

大集合分片传输：卫星目录两万余条按 `chunks` 切开，列表页只取第一片，触底再增量拉取，
避免单次 `setData` 过大（微信建议单次 ≤256KB）。

## 数据源

| 来源 | 用途 | 说明 |
|---|---|---|
| [The Space Devs LL2](https://thespacedevs.com/llapi) | 发射、火箭、机构、工位、航天员、空间站、乘组、事件 | 未认证 15 次/小时，靠 Actions 分流 |
| [SNAPI](https://spaceflightnewsapi.net/) | 航天资讯 | 每轮回原文复查封面，避免快照链接失效 |
| [NASA APOD](https://api.nasa.gov/) | 每日天文 | Basic JSON，无需 API key |
| [NASA EPIC](https://epic.gsfc.nasa.gov/) | 每日地球 | 当日全量 13 帧 |
| [NASA Image Library](https://images-api.nasa.gov/) | 星云等主题影像 | 主题白名单 + 批量翻译 |
| [NASA NeoWs](https://api.nasa.gov/) | 近地天体接近事件 | 按接近时刻去重 |
| [GCAT / planet4589](https://planet4589.org/space/gcat/) | 卫星目录、在轨统计、解体与再入 | Jonathan McDowell，CC-BY |

译文分四层：专名白名单 → 人工覆盖表 → 术语纠错表 → 机器翻译（Google 优先，限流降级
MyMemory）。所有译文在 CI 侧落盘缓存，小程序端不发起任何翻译请求。

## 目录

| 路径 | 说明 |
|---|---|
| `pages/` | 30 个页面：5 个 tab + 详情与百科 |
| `components/` | 发射卡片、倒计时、沉浸式导航条、筛选抽屉、各板块 section、星空背景 |
| `custom-tab-bar/` | 悬浮胶囊 tabBar（**原生 wxml/wxss/js，不是 .vue**） |
| `utils/` | 数据层 `data.js`、格式化 `format.js`、搜索匹配、收藏、分享、分片历史、主题混入 |
| `scripts/` | 抓取与生成脚本 + `lib/`（fetch、slim、translate、image、cos、aggregate）+ 校验脚本 |
| `.github/workflows/` | 11 条流水线：9 条定时抓取 + 2 条手动（配置上传、配置自检） |
| `docs/` | 部署说明、API 调研、代码评审记录 |
| `dist/` | 生成的 JSON 快照（不入库） |

## 技术约定

- **`DATA_VERSION`**：`utils/data.js`、`scripts/sync.js`、`scripts/images.js` 三处必须一致
  （当前 `14`）。缓存 key 带版本号，改数据结构时要一起 +1，否则老用户会读到结构不匹配的缓存。
- **校验脚本**（零依赖，纯 Node，改完顺手跑一遍）：

  ```bash
  node scripts/verify-pure.js     # 纯函数与数据口径
  node scripts/verify-config.js   # 两端配置判定一致性
  node scripts/verify-slim.js     # 裁剪后的字段完整性
  ```

## 本地开发

项目用 HBuilderX 构建（根目录没有 CLI 工程配置），微信端产物在
`unpackage/dist/dev/mp-weixin`。用 HBuilderX 打开本目录直接运行，或用微信开发者工具
导入该产物目录。

数据脚本（在 `scripts/` 下执行，Node 环境，需自备 COS 与环境变量）：

```bash
cd scripts
npm install
node sync.js --dataset=upcoming --base=dev   # 走开发端点，不消耗正式配额
node archive.js --pages=1 --dry              # 归档干跑，只抓不传
```

部署、配额预算与踩坑记录见 [`docs/部署说明.md`](docs/部署说明.md)。

## 数据署名

- 卫星目录、在轨统计与解体事件数据来自 **GCAT**（Jonathan McDowell），CC-BY 授权，
  来源标注已出现在对应页面与「我的 → 关于」。
- 天文与地球影像来自 NASA（APOD / EPIC / Image Library），版权归 NASA 及各影像作者。
- 发射、火箭、机构等基础数据来自 The Space Devs。

本项目仅用于学习与个人使用，不提供任何形式的商业服务或数据保证。
