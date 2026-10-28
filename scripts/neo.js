'use strict'

/**
 * NeoWs 近地天体同步
 *
 * 数据源：NASA NeoWs（Near Earth Object Web Service）
 *   GET https://api.nasa.gov/neo/rest/v1/feed            今天起 7 天
 *   GET https://api.nasa.gov/neo/rest/v1/feed?start_date=&end_date=  过去的 7 天
 *   GET https://api.nasa.gov/neo/rest/v1/neo/browse?size=1          拿「已发现总数」
 *
 * 为什么选它（对比 GCAT 那一路）：
 *   1. 字段全是数值 + 一个 JPL 外链，没有文本、不需要翻译、没有配图；
 *   2. 没有版权问题（NASA 公有领域），也不涉及内容合规；
 *   3. 一天的更新量只有几十条 / 十几 KB，一天跑一次就够。
 *
 * 与 GCAT 的「解体 / 再入」事件流合起来构成「太空环境」：
 *   GCAT 是「地球上的东西掉下来」，NeoWs 是「外面的东西飞过来」。
 *
 * ⚠️ 两个必须处理的数据问题（实测发现，不处理会出错）：
 *
 *   ① **同一物体可能存两条记录**：`(2004 TP1)` 与 `612856 (2004 TP1)` 是同一次
 *      飞掠的两个 id（临时编号 / 永久编号各建一条）。直接渲染会出现两张一模一样
 *      的卡片，所以按「临时编号 + 接近时刻」去重。
 *
 *   ② **`is_potentially_hazardous_asteroid` 不等于「会撞地球」**：它只表示
 *      「尺寸足够大且轨道足够近，需要长期监测」。实测 7 天 43 颗里 9 颗命中（21%），
 *      真正进了撞击概率清单（`is_sentry_object`）的是 0 颗。所以这个字段只以
 *      「潜在危险 · 需长期监测」的形式出现在详情里，不当危险标签用。
 */

const fs = require('fs')
const path = require('path')
const https = require('https')
const { upload, hasCosConfig, readCosJson } = require('./lib/cos')

const API = 'https://api.nasa.gov/neo/rest/v1'
// CI 从 Secrets 注入；没有就用 DEMO_KEY（30 次/小时、50 次/天按 IP）。
// 一天只跑 3 个请求，DEMO_KEY 也够，但 GitHub runner 是共享 IP，可能被别人吃光。
const KEY = process.env.NASA_API_KEY || 'DEMO_KEY'
const DATA_VERSION = 14
const OUT_DIR = path.resolve(__dirname, '..', 'dist')
const OUT_FILE = 'neo-nears.json'
const dryRun = process.argv.includes('--dry-run')

// 往后看几天。NeoWs 的 feed 单次窗口上限就是 7 天
const SPAN_DAYS = 7
const UA = 'SpaceLaunch/1.1 (+https://github.com/Mr-Pao/SpaceLaunch)'

const MONTHS = {
  Jan: 0, Feb: 1, Mar: 2, Apr: 3, May: 4, Jun: 5,
  Jul: 6, Aug: 7, Sep: 8, Oct: 9, Nov: 10, Dec: 11
}

function getJson(url, tries = 3) {
  return new Promise((resolve, reject) => {
    const attempt = (n) => {
      const req = https.get(url, { timeout: 45000, headers: { 'User-Agent': UA } }, (res) => {
        if (res.statusCode === 429 || res.statusCode >= 500) {
          res.resume()
          if (n > 1) {
            // NASA 的限流窗口是每小时，退避要给足
            const wait = (4 - n) * 8000
            console.log(`  ! HTTP ${res.statusCode}，${wait / 1000}s 后重试`)
            setTimeout(() => attempt(n - 1), wait)
            return
          }
          return reject(new Error('HTTP ' + res.statusCode + '（重试用尽）'))
        }
        if (res.statusCode !== 200) {
          res.resume()
          return reject(new Error('HTTP ' + res.statusCode))
        }
        const chunks = []
        res.on('data', (c) => chunks.push(c))
        res.on('end', () => {
          try {
            resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')))
          } catch (e) {
            reject(new Error('返回不是合法 JSON'))
          }
        })
      })
      req.on('timeout', () => req.destroy(new Error('请求超时')))
      req.on('error', (e) => (n > 1 ? setTimeout(() => attempt(n - 1), 3000) : reject(e)))
    }
    attempt(tries)
  })
}

function ymd(d) {
  return d.toISOString().slice(0, 10)
}

function shiftDays(base, n) {
  const d = new Date(base.getTime())
  d.setUTCDate(d.getUTCDate() + n)
  return d
}

let prevCache
/**
 * 上一轮已经传上去的 payload，只在某一段抓取失败时才用得上。
 *
 * 失败写 0 比不更新更糟：「过去 7 天 0 次」看着像个正常数字，不会有人怀疑，
 * 但它其实是「这个数没抓到」。所以宁可沿用旧值 —— 数字旧一天，
 * 也好过凭空出现一个错的。
 */
async function prevPayload() {
  if (prevCache !== undefined) return prevCache
  try {
    prevCache = (await readCosJson(`space-data/${OUT_FILE}`)) || {}
  } catch (e) {
    prevCache = {}
  }
  return prevCache
}

/**
 * `close_approach_date_full` 形如 "2026-Oct-29 17:05"，是 UTC。
 * 不走 Date.parse：这种带英文月份的格式各引擎解析行为不一致。
 */
function parseApproach(s) {
  const m = String(s || '').match(/^(\d{4})-([A-Za-z]{3})-(\d{1,2})\s+(\d{2}):(\d{2})$/)
  if (!m || MONTHS[m[2]] === undefined) return null
  return new Date(Date.UTC(+m[1], MONTHS[m[2]], +m[3], +m[4], +m[5]))
}

/** 北京时间 `MM-DD HH:mm`，列表直接显示，前端不用再算时区 */
function bjShort(iso) {
  const t = new Date(new Date(iso).getTime() + 8 * 3600 * 1000)
  const p = (n) => String(n).padStart(2, '0')
  return `${p(t.getUTCMonth() + 1)}-${p(t.getUTCDate())} ${p(t.getUTCHours())}:${p(t.getUTCMinutes())}`
}

/**
 * 展示名。
 *   `(2015 HO116)`              → `2015 HO116`（临时编号，去掉括号）
 *   `524522 Zoozve (2002 VE68)` → `Zoozve`（有正式名就用名字）
 *   `2019 OK`                   → `2019 OK`（4 位年份不能当永久编号剥掉）
 */
function displayName(name) {
  const n = String(name || '').trim()
  const onlyTmp = n.match(/^\(([^)]+)\)$/)
  if (onlyTmp) return onlyTmp[1]

  let out = n.replace(/\s*\([^)]*\)\s*$/, '').trim()
  // 前导数字是永久小行星编号（如 524522）才剥；4 位年份是临时编号的一部分，要留
  const lead = out.match(/^(\d+)\s+/)
  if (lead && lead[1].length >= 5) out = out.slice(lead[0].length)
  return out || n
}

/** 去重键：临时编号 + 接近时刻。同一物体的两条记录这两项都相同 */
function dedupeKey(name, iso) {
  const n = String(name || '').trim()
  const tmp = (n.match(/\(([^)]+)\)/) || [])[1] || n
  return tmp.toLowerCase() + '|' + iso
}

/** 把 feed 的 near_earth_objects 拍平并规范化 */
function flatten(feed, out) {
  const days = (feed && feed.near_earth_objects) || {}
  for (const arr of Object.values(days)) {
    for (const o of arr || []) {
      const ca = (o.close_approach_data || [])[0]
      if (!ca) continue
      const when = parseApproach(ca.close_approach_date_full)
      if (!when) continue

      const iso = when.toISOString()
      const key = dedupeKey(o.name, iso)
      if (out.seen.has(key)) continue
      out.seen.add(key)

      const dm = o.estimated_diameter && o.estimated_diameter.meters
      const lunar = ca.miss_distance ? +ca.miss_distance.lunar : null
      const km = ca.miss_distance ? +ca.miss_distance.kilometers : null
      const vh = ca.relative_velocity ? +ca.relative_velocity.kilometers_per_hour : null

      out.list.push({
        id: String(o.id),
        name: o.name,
        disp: displayName(o.name),
        at: iso,
        atShort: bjShort(iso),
        // 地月距离（1 = 月球轨道半径，38.44 万公里）。这是最直观的尺度
        lunar: lunar === null ? null : Math.round(lunar * 100) / 100,
        // 万公里，给「xx 万公里外」这类表述用
        wkm: km === null ? null : Math.round(km / 1000) / 10,
        // km/s 比 km/h 直观（每秒多少公里）
        vkms: vh === null ? null : Math.round(vh / 36) / 100,
        // 直径区间（米）。NeoWs 给的是估算区间，不是确定值
        dmin: dm ? Math.round(dm.estimated_diameter_min) : null,
        dmax: dm ? Math.round(dm.estimated_diameter_max) : null,
        mag: typeof o.absolute_magnitude_h === 'number' ? Math.round(o.absolute_magnitude_h * 10) / 10 : null,
        haz: !!o.is_potentially_hazardous_asteroid,
        sentry: !!o.is_sentry_object,
        jpl: o.nasa_jpl_url || ''
      })
    }
  }
}

async function main() {
  const today = new Date()
  const start = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()))
  const out = { list: [], seen: new Set() }

  console.log('=== NeoWs 近地天体同步 ===')
  console.log(`  API key: ${KEY === 'DEMO_KEY' ? 'DEMO_KEY（未配置 NASA_API_KEY）' : '已配置'}`)

  // ---- 1. 未来 7 天（不带日期参数就是「今天起 7 天」）----
  const feed = await getJson(`${API}/feed?api_key=${KEY}`)
  flatten(feed, out)
  console.log(`  · 未来 7 天: ${feed.element_count || 0} 条`)

  // ---- 2. 过去 7 天（只用于「过去一周共掠地多少颗」这句统计）----
  let pastCount = 0
  try {
    const past = await getJson(
      `${API}/feed?start_date=${ymd(shiftDays(start, -SPAN_DAYS))}&end_date=${ymd(shiftDays(start, -1))}&api_key=${KEY}`
    )
    pastCount = past.element_count || 0
    console.log(`  · 过去 7 天: ${pastCount} 条`)
  } catch (e) {
    // 这一段拿不到不影响主列表，但别把统计写成 0（详见 prevPayload 注释）
    const old = await prevPayload()
    pastCount = old.pastCount || 0
    console.log(`  ! 过去 7 天抓取失败，沿用上轮 ${pastCount}: ${e.message}`)
  }

  // ---- 3. 已发现的近地天体总数（browse 只取 1 条，靠 page.total_elements）----
  let totalKnown = 0
  try {
    const browse = await getJson(`${API}/neo/browse?size=1&api_key=${KEY}`)
    totalKnown = (browse.page && browse.page.total_elements) || 0
    console.log(`  · 已发现近地天体: ${totalKnown}`)
  } catch (e) {
    const old = await prevPayload()
    totalKnown = old.totalKnown || 0
    console.log(`  ! 总数抓取失败，沿用上轮 ${totalKnown}: ${e.message}`)
  }

  // 按接近时刻升序：时间线从最近的一次开始，和「解体 / 再入」倒序不同——
  // 那边是历史记录，这边是未来日程
  out.list.sort((a, b) => (a.at < b.at ? -1 : a.at > b.at ? 1 : a.lunar - b.lunar))

  const hazCount = out.list.filter((x) => x.haz).length
  const closest = out.list.reduce((best, x) => {
    if (x.lunar === null) return best
    return !best || x.lunar < best.lunar ? x : best
  }, null)

  const payload = {
    v: DATA_VERSION,
    dataset: 'neoNears',
    generatedAt: new Date().toISOString(),
    // 已发现的近地天体总数（NeoWs 全库，不是本份列表的长度）
    totalKnown,
    // 未来 7 天的接近次数
    count: out.list.length,
    // 其中被标为「潜在危险」的数量（只是需长期监测，不是撞击预警）
    hazardous: hazCount,
    // 过去 7 天的接近次数，用于「过去一周掠地 N 颗」的对比
    pastCount,
    window: { start: ymd(start), end: ymd(shiftDays(start, SPAN_DAYS)) },
    closest: closest
      ? { disp: closest.disp, at: closest.at, lunar: closest.lunar, dmax: closest.dmax }
      : null,
    list: out.list
  }

  fs.mkdirSync(OUT_DIR, { recursive: true })
  fs.writeFileSync(path.join(OUT_DIR, OUT_FILE), JSON.stringify(payload))
  console.log(`  → ${OUT_FILE}  ${out.list.length} 条（潜在危险 ${hazCount}）`)

  if (dryRun) {
    console.log('\n[dry-run] 仅本地输出，未上传 COS')
    if (!hasCosConfig()) console.log('  （当前也没有 COS 配置）')
    return
  }

  // 一天只变一次，缓存给 6 小时足够；改小了反而每次进页都回源
  await upload(path.join(OUT_DIR, OUT_FILE), `space-data/${OUT_FILE}`, 'public, max-age=21600')
  console.log('\n=== NeoWs 同步完成 ===')
}

module.exports = { displayName, dedupeKey, parseApproach, flatten }

if (require.main === module) {
  main().catch((e) => {
    console.error('NeoWs 同步失败:', e.message)
    process.exit(1)
  })
}
