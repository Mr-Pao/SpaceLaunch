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
const { mirrorImages } = require('./lib/image')
const translate = require('./lib/translate')

const OUT_DIR = path.resolve(__dirname, '..', 'dist')
const DATA_VERSION = 14
const API = 'https://api.spaceflightnewsapi.net/v4/articles/'
const UA = 'SpaceLaunch/1.1 (+https://github.com/Mr-Pao/SpaceLaunch)'

const KEEP = 200 // 保留最近多少条
const FETCH_LIMIT = 30 // 每路抓多少条
const SUMMARY_MAX = 300 // 摘要截断长度（字符），太长翻译慢且列表用不上
const DRY = process.argv.includes('--dry-run')

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
    // 关联的 LL2 发射 UUID，前端可回连发射详情页
    launches: (raw.launches || []).map((x) => x && x.launch_id).filter(Boolean).slice(0, 2)
  }
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
