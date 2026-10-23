# SpaceLaunch 小程序

![](https://github.com/Mr-Pao/SpaceLaunch/blob/main/小程序码.jpg)

航天发射日历类微信小程序：即将发射、已发射历史、航天活动、火箭型号库、年度发射统计。

## 架构

数据源是 The Space Devs 的 LL2 API（海外、未认证 15 次/小时）。小程序不直接请求它，
而是由 GitHub Actions 定时抓取 → 裁剪 + 中文化 + 图片镜像 → 上传腾讯云 COS，
小程序只读 COS 上的静态 JSON：

```
GitHub Actions（海外节点）        COS + CDN（成都）
  sync.yml    每 15 分钟~每天   →    space-data/*.json
  archive.yml 每小时 8 页       →    space-data/history/pNN.json（7656 条全量归档）
  backfill.yml 每 15 分钟       →    给归档分片补中文（不占 LL2 配额）
                                          ↓ uni.request
                                  小程序（Storage 缓存优先渲染）
```

前端三层缓存：内存 → Storage → CDN。冷启动先渲染缓存，再后台静默刷新。

部署细节、请求预算、踩过的坑见 [`docs/部署说明.md`](docs/部署说明.md)。

## 目录

| 路径 | 说明 |
|---|---|
| `pages/` | 9 个页面：即将发射 / 火箭库 / 已发射 / 活动 / 统计 / 发射详情 / 火箭详情 / 机构 / 版本记录 |
| `components/` | 发射卡片、倒计时、沉浸式导航条、首页倒计时大卡 |
| `custom-tab-bar/` | 悬浮胶囊 tabBar（**原生 wxml/wxss，不是 .vue**） |
| `utils/` | 数据层 `data.js`、格式化 `format.js`、收藏、历史分片、分享、tabBar 同步 |
| `scripts/` | 同步/归档/回填脚本 + `lib/`（fetch、slim、translate、image、cos、aggregate） |
| `dist/` | 生成的 JSON 快照（gitignore） |

## 数据版本

`scripts/sync.js` 与 `utils/data.js` 里的 `DATA_VERSION` 必须一致（当前 **8**）。
改数据结构时两边一起 +1，旧缓存会因 key 带版本号而自动失效。

## 本地跑

```bash
cd scripts
npm install
node sync.js --dataset=upcoming --base=dev   # 走开发端点，不消耗正式配额
node archive.js --pages=1 --dry              # 归档干跑，只抓不传
```

完整说明见 `docs/部署说明.md` 第四节。
