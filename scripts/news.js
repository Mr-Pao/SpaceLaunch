'use strict'

/**
 * SNAPI 航天资讯抓取
 *
 * 数据源：Spaceflight News API v4（api.spaceflightnewsapi.net），
 * The Space Devs 出品，免鉴权、无明确硬限额，聚合数十家航天天媒体。
 *
 * 设计要点：
 * 1. **两路合并**。一路 `has_launch=true` 取「和某次发射相关」的报道（能回连
 *    发射详情页，是这块内容最有价值的部分），一路取最新（保证内容量）。
 *    两路都按发布时间倒序，合并按 id 去重。
 * 2. **增量合并**。先读 COS 上的旧 news.json，新的并入后按时间倒序截断到
 *    KEEP 条。已入库的条目原样保留（含已翻好的中文、已镜像的 COS 图），
 *    只处理新增的，避免每轮重翻全部。
 * 3. **翻译走既有 translate 库**。按原文哈希缓存，CI 每轮从 COS 拉缓存，
 *    常见摘要命中缓存不发请求。翻不出来就留空，前端回退英文。
 * 4. **封面图必须镜像**。SNAPI 的 image_url 都是海外域名（NASA/媒体 CDN），
 *    国内直连一张几百 KB 要好几秒，全部压成 480px thumb 存 COS。
 * 5. **内容合规前置过滤**。航天新闻里军事/地缘表述高频，在入库前就用关键词
 *    过滤掉，而不是抓完再筛（详见 BLOCK_WORDS 注释）。
 *
 * 用法：
 *   node scripts/news.js              正常同步（上传 COS）
 *   node scripts/news.js --dry-run    只抓取+落 dist，不上传
 */

const fs = require('fs')
const path = require('path')
const { upload, hasCosConfig, readCosJson } = require('./lib/cos')
const { mirrorImages, coverFromPage } = require('./lib/image')
const translate = require('./lib/translate')

const OUT_DIR = path.resolve(__dirname, '..', 'dist')
const DATA_VERSION = 14
const API = 'https://api.spaceflightnewsapi.net/v4/articles/'
const UA = 'SpaceLaunch/1.1 (+https://github.com/Mr-Pao/SpaceLaunch)'

const KEEP = 200 // 保留最近多少条
const FETCH_LIMIT = 30 // 每路抓多少条
const SUMMARY_MAX = 300 // 摘要截断长度（字符），太长翻译慢且列表用不上
const DRY = process.argv.includes('--dry-run')

// 封面失效修补：每轮最多回几篇文章页找新图（每条 1 次页面 + 1 次图片下载）
const MAX_COVER_REPAIR = 8
// 同一条最多补救几轮。再失败就当这篇文章真没图，永久走占位
const MAX_COVER_TRIES = 3
// 自家 CDN 的标识。镜像成功的地址一定含它，其余一律视为「没托管好」
const CDN_MARK = 'myqcloud.com'

/**
 * 内容合规黑名单。
 *
 * 只拦「明显不适合在小程序里出现」的表述，不做宽泛的政治过滤 ——
 * 过严会把正常技术报道也杀掉（比如 "military satellite" 很常见，
 * 但确实是敏感表述，宁可少一条内容也不留风险）。
 *
 * 命中标题或摘要任一处即整条丢弃。
 */
const BLOCK_WORDS = [
  'war',
  'warfare',
  'weapon',
  'missile',
  'military',
  'troops',
  'invasion',
  'sanction',
  'nuclear strike',
  'espionage',
  'spy satellite',
  'cyberattack',
  'propaganda',
  'coup'
]
// 用词边界匹配，避免 "software" 里的 "war"、"ward" 之类误伤
const BLOCK_RE = new RegExp('\\b(' + BLOCK_WORDS.join('|') + ')\\b', 'i')

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms))
}

/** 去掉 HTML 标签与实体，压平空白 */
function plain(html) {
  return String(html || '')
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\[\s*(…|\.\.\.)\s*\]\s*$/g, '') // SNAPI 摘要尾部常见 "[…]"
    .replace(/\s+/g, ' ')
    .trim()
}

/** ISO → 北京时间 'YYYY-MM-DD HH:mm' */
function bjTime(iso) {
  const t = Date.parse(iso)
  if (!t) return ''
  const d = new Date(t + 8 * 3600 * 1000)
  const p = (n) => String(n).padStart(2, '0')
  return (
    d.getUTCFullYear() +
    '-' +
    p(d.getUTCMonth() + 1) +
    '-' +
    p(d.getUTCDate()) +
    ' ' +
    p(d.getUTCHours()) +
    ':' +
    p(d.getUTCMinutes())
  )
}

/**
 * 抓一路文章。SNAPI 偶发超时（实测首次请求失败、重试即成功），
 * 所以给 3 次退避重试。
 *
 * timeout 给到 60s：limit=30 的响应体不小，网络差的时候 30s 经常刚好卡在边界上，
 * 表现为「每次都失败、重试也没用」，其实只是等得不够久。
 */
async function fetchArticles(query) {
  const url = `${API}?${query}&limit=${FETCH_LIMIT}`
  let lastErr
  for (let i = 0; i < 3; i++) {
    try {
      const res = await fetch(url, {
        headers: { 'User-Agent': UA, Accept: 'application/json' },
        signal: AbortSignal.timeout(60000)
      })
      if (!res.ok) throw new Error('HTTP ' + res.status)
      const body = await res.json()
      return Array.isArray(body.results) ? body.results : []
    } catch (e) {
      lastErr = e
      if (i < 2) {
        console.warn(`  ! 抓取失败，3s 后重试: ${e.message}`)
        await sleep(3000)
      }
    }
  }
  throw lastErr
}

/**
 * 判断摘要是否是「垃圾文本」。
 *
 * SNAPI 的 summary 由各家源站自己提供，质量参差 —— NASA 系站点（尤其是 APOD）
 * 经常把整页导航文案塞进来，形如「APOD Science APOD APOD：2026年10月28日 –
 * 今天的APOD档案提交索引搜索日历RSS教育关于讨论…」，翻了也是废话。
 *
 * 判据很朴素：某个词重复 4 次以上且占比超过 12%，或本来就短得没信息量。
 * 命中就把摘要清空，前端只显示标题，比显示一段垃圾好。
 */
function badSummary(text) {
  const words = String(text || '')
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
  if (words.length < 8) return true
  const counts = {}
  for (const w of words) {
    if (w.length > 2) counts[w] = (counts[w] || 0) + 1
  }
  let max = 0
  for (const k in counts) if (counts[k] > max) max = counts[k]
  return max >= 4 && max / words.length > 0.12
}

/**
 * 源站导航条特征串。
 *
 * NASA 系站点（尤其 APOD）会把整页导航当成摘要返回，形式高度固定。
 * 这类文本的词频不一定够高（APOD 只占 9%，撞不到 badSummary 的 12% 阈值），
 * 但它本身就是一份固定的样板串，直接认串比算命准。
 */
const NAV_NOISE = [
  /Today[’'`]s APOD Archive/i,
  /Submissions Index Search Calendar/i,
  /Discover the cosmos!\s*Each day a different image/i,
  /Astronomy Picture of the Day\s+Discover/i,
  /\bRSS\s+Education\s+About\s+Discuss\b/i
]

/**
 * 媒体站的尾部样板：「The post X appeared first on Y.」
 * 中文机翻出来是「……首先出现在 NASASpaceFlight.com 上。」垃圾又碍眼。
 */
const TAIL_RE =
  /\s*(?:The\s+)?(?:post|article|story|piece)?[^.!?]{0,80}?(?:first\s+appeared|appeared\s+first|originally\s+appeared)\s+on\s+[^.!?]*\.?\s*$/i

/**
 * 摘要在**翻译之前**的清洗（顺序很重要：先洗后翻）。
 *
 * 为什么必须在翻译前处理：译文进的是按原文哈希索引的缓存，
 * 一旦把垃圾翻完存进去，以后每轮都要靠 getZh 出口再兜一次，永远清不干净。
 *
 * 返回空串表示「这条没有可用摘要」，前端自动不渲染摘要行。
 */
function cleanSummary(text) {
  let s = String(text || '').trim()
  if (!s) return ''

  // 1. 尾部样板直接切掉，前面如果有正文就留着
  const tail = TAIL_RE.exec(s)
  if (tail && tail.index > 0) s = s.slice(0, tail.index).trim()

  // 2. 整段就是导航条 —— 没有正文可救，整条丢弃
  if (NAV_NOISE.some((re) => re.test(s))) return ''

  // 3. 剩下的再跑词频兜底
  if (badSummary(s)) return ''

  return s
}

/** 把 SNAPI 原始条目裁成前端用的精简结构（不含译文，译文后补） */
function slim(raw) {
  const title = plain(raw.title)
  if (!title) return null
  // 摘要：先清洗（切尾部样板 / 丢导航条），再按词边界截断，
  // 避免 slice 把单词拦腰砍断（出现「…未来通」这种半截词）
  let summary = cleanSummary(plain(raw.summary))
  if (summary.length > SUMMARY_MAX) {
    let cut = summary.slice(0, SUMMARY_MAX)
    const at = Math.max(cut.lastIndexOf('. '), cut.lastIndexOf(' '))
    if (at > SUMMARY_MAX * 0.6) cut = cut.slice(0, at)
    summary = cut.trim().replace(/[,;:，；：]$/, '') + '…'
  }
  if (BLOCK_RE.test(title) || BLOCK_RE.test(summary)) {
    console.log(`  · 跳过（合规过滤）: ${title.slice(0, 40)}`)
    return null
  }
  const at = bjTime(raw.published_at)
  return {
    id: raw.id,
    title,
    summary,
    image: raw.image_url || '',
    site: raw.news_site || '',
    url: raw.url || '',
    at,
    // 列表里只显示「月-日 时:分」，详情页用完整时间
    atShort: at ? at.slice(5) : '',
    // 关联的 LL2 发射 UUID，前端可回连发射详情页。
    // 上限放到 8：实测一篇综述稿最多挂 6-7 个（Rocket Report 那期 6 个），
    // 留 5 会悄悄少列一个，用户点开弹窗就发现对不上正文。
    launches: (raw.launches || []).map((x) => x && x.launch_id).filter(Boolean).slice(0, 8)
  }
}

/**
 * 发射的「定位索引」：uuid → { n: 发射时间(net), m: 任务名 }。
 *
 * SNAPI 只给 LL2 的 launch UUID，不给发射时间。小程序打开一条发射的路径是
 * 「快照 200 条 → 归档分片（按时间切，共 76 片）」，而归档查找要靠 net 才能
 * 直达目标分片，否则只能从最新往回翻（限深 12 片）—— 十几年前的老任务
 * （好奇号 2011 的 MSL 在 p22）数据明明在库里，却永远翻不到，点进去就是
 * 「未找到该发射任务」。
 *
 * 所以在 CI 里问归档一次「这些 uuid 落在哪一片」，把 net 写进 news.json，
 * 前端点击时直接带 net 跳转，一次请求命中。查不到的记 null，下轮不再扫。
 *
 * 顺带把任务名一起存下来：资讯里要显示的是「所属任务 · MSL｜2011-11-26」，
 * 只给日期没有名字，读者没法判断这个链接值不值得点。
 */
const LOCATOR_KEY = 'space-data/launch-locator.json'
const HIST_PREFIX = 'space-data/history/'

/**
 * 未来/最近发射的快照（前端同款数据），用来给 locator 补 net。
 *
 * 归档 `history/` 只收**已发射**的任务，未来发射压根不在里面 —— 于是
 * 「猎鹰 9 号将发射 27 颗星链」这种最该连的新闻，uuid 在归档里扫不到，
 * 被记成 null，按钮反而消失；而几十年前的老任务因为躺在归档里，全部能连上。
 * 结果就是「能点的全是老任务」。
 *
 * 三份快照覆盖不同时段：
 *   upcoming     最近 100 个待发（约到 2026-12-30）
 *   previous     最近 100 次已发
 *   upcomingMore 更远的待发 375 条（2026-12-31 ~ 2039）
 * 少最后一份的话，Artemis 这类挂远期任务的报道会一条都连不上 —— 实测
 * 「NASA 全力推进阿耳忒弥斯 III、IV 和 V」挂了 2 个 uuid，两个都定位不到。
 */
const SNAPSHOT_KEYS = [
  'space-data/launches-upcoming.json',
  'space-data/launches-previous.json',
  'space-data/launches-upcoming-more.json'
]

/** 旧版 locator 存的是裸 net 字符串，读的时候统一成 { net, name } */
function normLoc(v) {
  if (!v) return null
  if (typeof v === 'string') return { net: v, name: '' }
  return { net: v.n || null, name: v.m || '' }
}

async function loadSnapshotNets(ids, map) {
  if (!ids.size) return 0
  let filled = 0
  for (const key of SNAPSHOT_KEYS) {
    // 需要的都补上了就别再下后面的 —— 最后一份远期待发有 757KB，
    // 只有在真被远期任务挡住时才值得付这个代价
    let missing = false
    for (const id of ids) {
      const c = normLoc(map[id])
      if (!c || !c.net) {
        missing = true
        break
      }
    }
    if (!missing) break

    let d = null
    try {
      d = await readCosJson(key)
    } catch (e) {
      continue
    }
    const list = (d && d.list) || []
    for (const x of list) {
      const id = String(x.id)
      // 只补「还没定位到」的：归档/快照里已经查实的不要被覆盖
      if (!ids.has(id)) continue
      const cur = normLoc(map[id])
      if ((cur && cur.net) || !x.net) continue
      map[id] = { n: x.net, m: x.name || '' }
      filled++
    }
  }
  return filled
}

async function loadLocator() {
  try {
    const d = await readCosJson(LOCATOR_KEY)
    return d && d.map && typeof d.map === 'object' ? d.map : {}
  } catch (e) {
    console.log(`  · 定位索引不存在（按首轮全量扫）: ${e.message}`)
    return {}
  }
}

/**
 * 在归档分片里找这些 uuid，命中的把 { net, name } 写进 map；
 * 扫完整库仍没有的写 null，下轮不再重复请求。
 * 返回本轮新命中的数量。
 *
 * `want` 多一类：**查到 net 但没任务名**的（旧版 locator 只存了 net 字符串）。
 * 这类必须重扫一遍把名字补上 —— 资讯里要显示「所属任务 · 名称｜日期」，
 * 只有日期读者没法判断值不值得点。补完就带 name，之后不会再扫。
 */
async function scanArchive(ids, map) {
  const want = new Set(
    ids.filter((id) => {
      if (!(id in map)) return true // 从没查过
      const cur = normLoc(map[id])
      return !!(cur && cur.net && !cur.name) // 查到了时间、缺名字
    })
  )
  if (!want.size) return 0

  let index = null
  try {
    index = await readCosJson(HIST_PREFIX + 'index.json')
  } catch (e) {
    console.warn('  ! 归档索引拉取失败，本轮跳过定位: ' + e.message)
    return 0
  }
  const pages = (index && index.pages) || []
  if (!pages.length) return 0

  let found = 0
  const CONC = 6
  for (let i = 0; i < pages.length && want.size; i += CONC) {
    const batch = pages.slice(i, i + CONC)
    const lists = await Promise.all(
      batch.map(async (p) => {
        try {
          const d = await readCosJson(HIST_PREFIX + p.file)
          return (d && d.list) || []
        } catch (e) {
          return []
        }
      })
    )
    for (const list of lists) {
      for (const x of list) {
        const id = String(x.id)
        if (!want.has(id)) continue
        map[id] = x.net ? { n: x.net, m: x.name || '' } : null
        if (x.net) found++
        want.delete(id)
      }
    }
    process.stderr.write(
      `\r    · 归档扫描 ${Math.min(i + CONC, pages.length)}/${pages.length} 片，命中 ${found}   `
    )
  }
  process.stderr.write('\n')

  for (const id of want) map[id] = null
  return found
}

async function main() {
  console.log('=== 同步 SNAPI 资讯 ===')
  fs.mkdirSync(OUT_DIR, { recursive: true })
  // ---- 1. 两路抓取 ----
  // 串行而非并发：SNAPI 对突发并发不友好，本机实测并发两路会互相拖慢甚至超时
  const note = (m) => process.stderr.write(m + '\n')
  note('  · 抓取「关联发射」…')
  const withLaunch = await fetchArticles('has_launch=true&ordering=-published_at')
  note(`    → ${withLaunch.length} 条`)
  note('  · 抓取「最新」…')
  const latest = await fetchArticles('ordering=-published_at')
  note(`    → ${latest.length} 条`)

  const seen = new Set()
  const incoming = []
  for (const raw of [...withLaunch, ...latest]) {
    if (!raw || seen.has(raw.id)) continue
    seen.add(raw.id)
    const s = slim(raw)
    if (s) incoming.push(s)
  }
  console.log(`  · 合规过滤后 ${incoming.length} 条`)

  // ---- 2. 与 COS 旧数据合并（保留已翻好的中文与已镜像的图）----
  let old = []
  if (!DRY && hasCosConfig()) {
    try {
      const prev = await readCosJson('space-data/news.json')
      old = Array.isArray(prev.list) ? prev.list : []
      console.log(`  · 线上已有 ${old.length} 条`)
    } catch (e) {
      console.log(`  · 读线上旧数据失败（按首次跑处理）: ${e.message}`)
    }
  } else if (DRY) {
    const localPath = path.join(OUT_DIR, 'news.json')
    if (fs.existsSync(localPath)) {
      try {
        const prev = JSON.parse(fs.readFileSync(localPath, 'utf8'))
        old = Array.isArray(prev.list) ? prev.list : []
        console.log(`  · 本地已有 ${old.length} 条`)
      } catch (e) {
        // 忽略
      }
    }
  }

  const byId = new Map()
  for (const item of old) if (item && item.id != null) byId.set(item.id, item)
  const fresh = []
  for (const item of incoming) {
    if (!byId.has(item.id)) fresh.push(item) // 只有新的才需要翻译/镜像
  }
  console.log(`  · 新增 ${fresh.length} 条`)

  // ---- 2.5 旧条目重洗 ----
  // 清洗规则是会长大的：某天发现一个新站点的摘要带样板尾巴，加条规则，
  // 但已入库的条目不会重抓 —— 它们会一直带着脏摘要躺到被 KEEP 挤掉为止。
  // 所以每轮对旧条目重跑一遍清洗；摘要一旦被改动，旧译文立刻作废（原文变了）。
  //
  // 还有个细节：库里的摘要可能是上一轮按 300 字符硬截断的半截句，
  // 只要这一轮还抓得到同一条，就用新抓的清洗版覆盖掉，让格式自己升级。
  const incomingById = new Map()
  for (const it of incoming) incomingById.set(it.id, it)

  const reTexts = []
  let reClean = 0
  for (const it of old) {
    if (!it || it.id == null) continue
    const nx = incomingById.get(it.id)
    const next = nx ? nx.summary : cleanSummary(it.summary)
    // 只比 trim 后的结果：尾部空格差异不算改动，否则会白白丢掉已有译文
    if (next.trim() === (it.summary || '').trim()) continue
    it.summary = next
    it.summaryZh = ''
    if (next) reTexts.push(next)
    reClean++
  }
  if (reClean) console.log(`  · 旧条目摘要重洗 ${reClean} 条`)

  // ---- 2.6 补关联发射 ----
  // SNAPI 的 launch_id 是「事后」才挂上的：一篇稿子先出现在「最新」那一路
  // （launches 为空），过一阵才被标进 `has_launch=true` 那一路。
  // 旧条目一律原样保留，于是 launches 永远停在当初的空数组 ——
  // 前端那个「发射」标签就再也长不出来，看着像新资讯全都缺按钮。
  // 这里用这一轮抓到的值补回去。
  let relinked = 0
  for (const it of old) {
    if (!it || it.id == null) continue
    const nx = incomingById.get(it.id)
    if (!nx || !Array.isArray(nx.launches) || !nx.launches.length) continue
    const before = (it.launches || []).join(',')
    const after = nx.launches.join(',')
    if (before === after) continue
    it.launches = nx.launches
    // 关联变了旧定位就作废，5.6 会按新的 launches 重新算 launchRefs
    delete it.launchRefs
    relinked++
  }
  if (relinked) console.log(`  · 补关联发射 ${relinked} 条`)

  // ---- 3. 翻译（新增条目 + 被重洗的旧摘要）----
  await translate.loadCache()
  const texts = []
  for (const it of fresh) {
    texts.push(it.title)
    if (it.summary) texts.push(it.summary)
  }
  texts.push(...reTexts)

  if (texts.length) {
    await translate.translateTexts(texts)
    for (const it of fresh) {
      it.titleZh = translate.getZh(it.title)
      it.summaryZh = it.summary ? translate.getZh(it.summary) : ''
    }
    const t = translate.summary()
    console.log(
      `  · 翻译: 命中 ${t.hit} / 成功 ${t.ok} / 失败 ${t.fail} / 缓存池 ${t.cached}` +
        (t.quotaExhausted ? '  ⚠️ 配额用尽，剩余下轮补' : '')
    )
    if (t.dirty && !DRY) {
      const cachePath = translate.saveCache()
      try {
        await upload(cachePath, 'space-data/translation-cache.json', 'public, max-age=3600')
        console.log('  ↑ translation-cache.json')
      } catch (e) {
        console.warn('  ! 翻译缓存上传失败（不影响数据）: ' + e.message)
      }
    }
  }

  // ---- 3.5 旧条目译文回填 ----
  // 只查缓存与人工表，不发新请求：术语表改一个词（比如 Sols → 火星日），
  // 历史条目的译文就能在下一轮同步里自动改对，不用清缓存也不用重翻。
  let refilled = 0
  for (const it of old) {
    if (!it || it.id == null) continue
    const tz = translate.getZh(it.title)
    if (tz && tz !== it.titleZh) {
      it.titleZh = tz
      refilled++
    }
    if (it.summary) {
      const sz = translate.getZh(it.summary)
      if (sz && sz !== it.summaryZh) {
        it.summaryZh = sz
        refilled++
      }
    }
  }
  if (refilled) console.log(`  · 旧条目译文回填 ${refilled} 处`)

  // ---- 4. 封面图镜像（只处理新增，旧条目已是 COS 地址）----
  if (fresh.length) {
    await mirrorImages(fresh, [{ path: 'image', preset: 'thumb' }])
  }

  for (const it of fresh) byId.set(it.id, it)

  // ---- 5. 按发布时间倒序截断 ----
  const list = [...byId.values()]
    .sort((a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : 0))
    .slice(0, KEEP)

  // ---- 5.2 修补失效封面 ----
  //
  // SNAPI 的 image_url 只是抓取当时的快照，之后会失效，而它自己不会更新：
  //   · NASA 换图床：blogs.nasa.gov/... 301 到 www.nasa.gov，原路径吃 404
  //   · 媒体删旧图：Spaceflight Now 的 2025 年配图，文章还在图没了
  //   · 站点 og 抓歪：APOD 那条拿到的是 NASA 站内 logo，不是当天那张天文图
  // 而段 4 只镜像「新增」条目、失败也不回填，于是第一次没下载成功的地址
  // 会被永久沿用 —— 真机上就永久是一块纯黑，用户看到的就是「这条没图」。
  //
  // 这里对最终留下的条目再扫一遍：地址不在自家 CDN 上的，回文章页重新找图
  // （og:image → 正文首图）。找不到就置空让前端画占位图标，别留一个打不开的黑块。
  // 置空不等于放弃：记 coverTries，还有次数就下轮再试，够数了才认命。
  let coverFixed = 0
  let coverDropped = 0
  if (!DRY && hasCosConfig()) {
    const broken = list
      .filter((it) => {
        // 从来没有过封面（SNAPI 就没给）就别占配额，前端本来就画占位
        if (!it.image && !it.coverTries) return false
        // 已经在自家 CDN 上，不用管
        if (it.image && it.image.indexOf(CDN_MARK) >= 0) return false
        return (it.coverTries || 0) < MAX_COVER_TRIES
      })
      .slice(0, MAX_COVER_REPAIR)

    for (const it of broken) {
      it.coverTries = (it.coverTries || 0) + 1
      const fixed = await coverFromPage(it.url)
      if (fixed) {
        it.image = fixed
        delete it.coverTries
        coverFixed++
      } else {
        it.image = ''
        // coverTries 不能删：留着这个数才能让 filter 判定「试够了，别再抓」
        coverDropped++
      }
    }
    if (broken.length) {
      console.log(`  · 封面修补: 尝试 ${broken.length} 条 / 换图成功 ${coverFixed} / 暂无图 ${coverDropped}`)
    }
  }

  // ---- 5.5 关联发射定位 ----
  // 只处理最终留下的这 200 条（被挤掉的不必浪费请求）。
  // 定位索引是累积的，老 uuid 查过一次就不再问归档。
  //
  // locator 初值用 null 而不是 {}：dry-run / 没配 COS 时压根没跑定位，
  // 这时候不能把条目上已有的 launchRef 抹掉
  let locator = null
  if (!DRY && hasCosConfig()) {
    locator = await loadLocator()
    const ids = new Set()
    for (const it of list) for (const id of it.launches || []) ids.add(String(id))
    if (ids.size) {
      const before = Object.keys(locator).length
      const snap = await loadSnapshotNets(ids, locator)
      const found = await scanArchive([...ids], locator)
      console.log(
        `  · 关联发射定位: ${ids.size} 个 uuid / 快照补 ${snap} / 归档命中 ${found} / 索引累计 ${Object.keys(locator).length} 条`
      )
      if (Object.keys(locator).length !== before) {
        const p = path.join(OUT_DIR, 'launch-locator.json')
        fs.writeFileSync(
          p,
          JSON.stringify({ v: 1, generatedAt: new Date().toISOString(), map: locator })
        )
        try {
          await upload(p, LOCATOR_KEY, 'public, max-age=86400')
          console.log('  ↑ launch-locator.json')
        } catch (e) {
          console.warn('  ! 定位索引上传失败（不影响资讯本身）: ' + e.message)
        }
      }
    }
  }

  // ---- 5.6 关联发射落成数组 ----
  // `launches[]` 是「这篇文章涉及的发射」，可以 0 个也可能 6 个（综述稿尤其多），
  // 数组顺序是 SNAPI 的提及顺序、没有语义。所以：
  //   1. 全部保留，不猜「哪个是主角」—— 猜错就是好奇号那种事故；
  //   2. 按 |net - 发布时间| 升序排，让最像这条新闻的那次排第一，
  //      前端「一条直接跳、多条让用户选」正好用这个顺序；
  //   3. 定位不到 net 的丢掉 —— 没有 net 就翻不到归档分片，点进去必然
  //      「未找到该发射任务」，列出来只是给用户挖坑。
  if (locator) {
    let linked = 0
    let multi = 0
    let total = 0
    for (const it of list) {
      const at = Date.parse(String(it.at || '').replace(' ', 'T') + 'Z')
      const refs = []
      for (const id of it.launches || []) {
        const loc = normLoc(locator[String(id)])
        if (!loc || !loc.net) continue
        const t = Date.parse(loc.net)
        const gap = isFinite(t) && isFinite(at) ? Math.abs(t - at) / 86400000 : 1e9
        refs.push({ id: String(id), net: loc.net, name: loc.name || '', gap })
      }
      refs.sort((a, b) => a.gap - b.gap)
      for (const r of refs) delete r.gap

      if (refs.length) {
        it.launchRefs = refs
        linked++
        total += refs.length
        if (refs.length > 1) multi++
      } else {
        delete it.launchRefs
      }
      // 老字段：早期版本只存一个。留着会跟 launchRefs 打架，统一清掉
      delete it.launchRef
    }
    if (list.length) {
      console.log(
        `  · 带关联发射的资讯: ${linked} / ${list.length} 条（共 ${total} 个发射，其中 ${multi} 条挂多个，前端弹窗选）`
      )
    }
  }

  const payload = {
    v: DATA_VERSION,
    dataset: 'news',
    generatedAt: new Date().toISOString(),
    count: list.length,
    list
  }

  const outPath = path.join(OUT_DIR, 'news.json')
  fs.writeFileSync(outPath, JSON.stringify(payload))
  const kb = (fs.statSync(outPath).size / 1024).toFixed(0)
  console.log(`  → news.json  ${list.length} 条 / ${kb} KB`)

  // ---- 6. 上传 ----
  if (DRY) {
    console.log('  （dry-run，不上传）')
    return
  }
  if (!hasCosConfig()) {
    console.warn('  ! 未配置 COS，跳过上传')
    return
  }
  await upload(outPath, 'space-data/news.json', 'public, max-age=1800')
  console.log('  ↑ news.json')
}

main().catch((e) => {
  console.error('SNAPI 同步失败:', e && e.message)
  process.exit(1)
})
