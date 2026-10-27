#!/usr/bin/env node
'use strict'

/**
 * GCAT（Jonathan McDowell 通用人造空间物体编目）抓取 → 静态 JSON 快照
 *
 * 数据源：https://planet4589.org/space/gcat/data/cat/satcat.html
 * 授权：CC-BY（小程序内须标注 "data from GCAT (J. McDowell, planet4589.org/space/gcat)"）
 *
 * 该文件是 <PRE> 包裹的固定宽度文本（32 列），列宽按标题行对齐提取。
 * 本脚本产出三个数据集，统一支撑「探索」页三个新页面：
 *   - satellites.json + satellites/{i}.json  航天器/卫星百科（活跃子集，分片）
 *   - orbit-stats.json                       全球在轨资产（聚合统计）
 *   - debris-events.json                     在轨解体 / 再入事件流（按日期排序）
 *
 * 用法：
 *   node gcat.js                正常抓取 + 上传（CI 用）
 *   node gcat.js --dry-run     只写本地 dist/，不上传（调试用）
 *   GCAT_SATCAT_LOCAL=file node gcat.js --dry-run   用本地样本代替网络抓取（本机验证）
 */

const fs = require('fs')
const path = require('path')
const { upload } = require('./lib/cos')

const OUT_DIR = path.resolve(__dirname, '..', 'dist')
const DATA_VERSION = 14
const CHUNK = 800 // 每片卫星数

// satcat.html 的列（顺序与标题行一致）。字段内部含空格，必须用固定列宽切片，
// 且字段名互相包含（Name⊂PLName、Mass⊂DryMass⊂TotMass），故用「列边界(前后空白)」正则锚定起始。
const FIELDS = ['JCAT', 'Satcat', 'Launch_Tag', 'Piece', 'Type', 'Name', 'PLName', 'LDate', 'Parent', 'SDate', 'Primary', 'DDate', 'Status', 'Dest', 'Owner', 'State', 'Manufacturer', 'Bus', 'Motor', 'Mass', 'DryMass', 'TotMass', 'Length', 'Diamete', 'Span', 'Shape', 'ODate', 'Perigee', 'Apogee', 'Inc', 'OpOrbitOQU', 'AltNames']

// GCAT 状态码 → 中文（覆盖常见值，其余保留原码）
const STATUS_MAP = {
  'R': '火箭体', 'R A': '在役火箭体', 'R O': '在轨火箭体',
  'P': '载荷', 'P A': '在役载荷', 'P M': '载人飞船', 'P C': '货运飞船', 'P R': '可回收载荷',
  'AR': '在轨', 'O': '在轨', 'AO': '绕非地球天体',
  'A': '活跃',
  'DSO': '在轨解体', 'D': '已再入', 'L': '月球表面', 'LO': '丢失', 'N': '未知', 'OX': '氧化',
  'XP': '实验中', 'X': '未知'
}
// 视为「已解体/再入/终结」的状态（进入事件流）
const ENDED_STATUS = new Set(['DSO', 'D', 'L', 'LO', 'N', 'OX'])
// 火箭体（不是航天器/卫星，单列为"在轨资产"但不进卫星百科）
const ROCKET_STATUS = new Set(['R', 'R A', 'R O'])

// 在轨 = 未终结（仍挂在天上，含火箭体、载荷、碎片残骸）
function isInOrbit(rec) { return !ENDED_STATUS.has(rec.status) }
// 卫星百科 = 在轨且为航天器/载荷（排除火箭体残骸）
function isCatalog(rec) { return isInOrbit(rec) && !ROCKET_STATUS.has(rec.status) }

// GCAT 轨道分类代码 → 中文
const ORBIT_MAP = {
  'LLEO': '近地低轨', 'LEO': '近地轨道', 'MEO': '中地球轨道', 'GEO': '地球同步轨道',
  'HEO': '大椭圆轨道', 'GTO': '地球同步转移轨道', 'DSO': '深空轨道', 'EEO': '地球逃逸轨道',
  'CLO': '环月轨道', 'SO': '太阳轨道', 'LLO': '月球低轨', 'HCO': '日心轨道',
  'LLEO/I': '近地低轨', 'LEO/I': '近地轨道', 'GEO/I': '地球同步轨道', 'SO/I': '太阳轨道',
  'LLEO/P': '近地低轨(极)', 'LLEO/S': '近地低轨(太阳同步)', 'GEO/P': '同步轨道(极)', 'GEO/S': '同步轨道(太阳同步)'
}
// 运营方/所有者代码（GCAT 用 4 字母缩写）→ 可读名。覆盖主要发射与服务商。
const OWNER_MAP = {
  'SPXS': 'SpaceX', 'NASA': 'NASA', 'USNA': '美国海军', 'USAF': '美国空军', 'USSF': '美国太空军',
  'ROSC': '俄罗斯航天', 'CNSA': '中国航天', 'CASA': '中国国家航天局', 'JXA': 'JAXA', 'ESA': '欧空局',
  'EUM': '欧空局(EUMETSAT)', 'FR': '法国', 'GB': '英国', 'DE': '德国', 'IT': '意大利',
  'IN': '印度', 'ISRO': '印度空间研究组织', 'IL': '以色列', 'KR': '韩国', 'KP': '朝鲜',
  'JP': '日本', 'CA': '加拿大', 'AU': '澳大利亚', 'BR': '巴西', 'SA': '沙特',
  'IR': '伊朗', 'SG': '新加坡', 'TW': '中国台湾', 'LU': '卢森堡', 'INTL': '国际', 'COMM': '商业'
}

// 国家/地区代码（GCAT 用 FIPS 风格两字母）→ 中文。覆盖主要航天实体。
const STATE_MAP = {
  'SU': '苏联', 'US': '美国', 'RU': '俄罗斯', 'CN': '中国', 'JP': '日本', 'FR': '法国',
  'GB': '英国', 'DE': '德国', 'IN': '印度', 'ESA': '欧洲航天局', 'IT': '意大利', 'CA': '加拿大',
  'KR': '韩国', 'KP': '朝鲜', 'TW': '中国台湾', 'IL': '以色列', 'AU': '澳大利亚', 'BR': '巴西',
  'UK': '英国', 'ES': '西班牙', 'NL': '荷兰', 'SE': '瑞典', 'CH': '瑞士', 'BE': '比利时',
  'SA': '沙特', 'IR': '伊朗', 'PK': '巴基斯坦', 'ID': '印尼', 'SG': '新加坡', 'TH': '泰国',
  'VN': '越南', 'ZA': '南非', 'AR': '阿根廷', 'MX': '墨西哥', 'TK': '土耳其', 'AE': '阿联酋',
  'PL': '波兰', 'UA': '乌克兰', 'BY': '白俄罗斯', 'CZ': '捷克', 'NO': '挪威', 'FI': '芬兰',
  'DK': '丹麦', 'NZ': '新西兰', 'LU': '卢森堡', 'EU': '欧盟'
}

const SATCAT_URL = 'https://planet4589.org/space/gcat/data/cat/satcat.html'

/** 从 <PRE> 文本块里定位标题行（同时含 JCAT 与 AltNames 的那一行），再按列边界算每列起始 */
function computeColumns(buf) {
  const lines = buf.split('\n')
  const header = lines.find((l) => l.includes('JCAT') && l.includes('AltNames'))
  if (!header) throw new Error('找不到 GCAT 标题行')
  const starts = {}
  for (const f of FIELDS) {
    const re = new RegExp('(^|\\s)' + f.replace(/[-_]/g, '\\$&') + '\\s')
    const m = header.match(re)
    starts[f] = m ? m.index + (m[1] ? 1 : 0) : header.indexOf(f)
  }
  const cols = FIELDS.map((f, i) => {
    const s = starts[f]
    const e = i < FIELDS.length - 1 ? starts[FIELDS[i + 1]] : header.length
    return { f, s, e }
  })
  return cols
}

function colOf(cols, line, field) {
  const c = cols.find((x) => x.f === field)
  if (!c) return ''
  return (line.slice(c.s, c.e) || '').trim()
}

/** 解析固定宽度文本为原始记录数组 */
function parseSatcat(buf) {
  const cols = computeColumns(buf)
  const lines = buf.split('\n')
  const out = []
  for (const line of lines) {
    if (!/^S\d+/.test(line)) continue // 只取数据行（JCAT 编号行）
    const rec = {
      jcat: colOf(cols, line, 'JCAT'),
      satcat: colOf(cols, line, 'Satcat'),
      intl: colOf(cols, line, 'Piece'),
      name: colOf(cols, line, 'Name'),
      alt: colOf(cols, line, 'PLName'),
      launch: colOf(cols, line, 'LDate'),
      reentry: colOf(cols, line, 'DDate'),
      status: colOf(cols, line, 'Status'),
      type: colOf(cols, line, 'Type'),
      owner: colOf(cols, line, 'Owner'),
      state: colOf(cols, line, 'State'),
      orbitRaw: colOf(cols, line, 'OpOrbitOQU'),
      perigee: colOf(cols, line, 'Perigee'),
      apogee: colOf(cols, line, 'Apogee'),
      inc: colOf(cols, line, 'Inc'),
      mass: colOf(cols, line, 'Mass')
    }
    out.push(rec)
  }
  return out
}

/** 把原始状态码/轨道/国家映射成前端友好的中文 + 干净字段 */
function decorate(rec) {
  const orbitClean = (rec.orbitRaw || '').replace(/\s*-\s*$/, '').trim()
  const orbitKey = orbitClean.replace(/\s+/g, ' ').trim()
  const statusZh = STATUS_MAP[rec.status] || (rec.status || '未知')
  const orbitZh = ORBIT_MAP[orbitKey] || orbitClean || ''
  const stateZh = STATE_MAP[rec.state] || rec.state || ''
  const ownerZh = OWNER_MAP[rec.owner] || rec.owner || ''
  return {
    id: rec.jcat,
    satcat: rec.satcat,
    intl: rec.intl,
    name: rec.name || rec.alt || '(未命名)',
    alt: rec.alt,
    launch: rec.launch,
    reentry: rec.reentry === '-' ? '' : rec.reentry,
    status: rec.status,
    statusZh,
    type: rec.type,
    owner: rec.owner,
    state: rec.state,
    stateZh,
    ownerZh,
    orbit: orbitClean,
    orbitZh,
    perigee: rec.perigee === '-' || rec.perigee === '?' ? '' : rec.perigee,
    apogee: rec.apogee === '-' || rec.apogee === '?' ? '' : rec.apogee,
    inc: rec.inc === '-' ? '' : rec.inc,
    mass: rec.mass === '-' ? '' : rec.mass
  }
}

/** 抓取 satcat 文本（CI 走网络；本地测试走 GCAT_SATCAT_LOCAL 环境变量） */
async function fetchSatcatText() {
  const local = process.env.GCAT_SATCAT_LOCAL
  if (local && fs.existsSync(local)) {
    console.log('  · 使用本地样本: ' + local)
    return fs.readFileSync(local, 'utf8')
  }
  const res = await fetch(SATCAT_URL, { signal: AbortSignal.timeout(120000) })
  if (!res.ok) throw new Error('GCAT HTTP ' + res.status)
  return res.text()
}

/** 年份提取（"1957 Oct  4" → 1957），用于年代聚合 */
function yearOf(s) {
  const m = (s || '').match(/(\d{4})/)
  return m ? parseInt(m[1], 10) : null
}

async function main() {
  const dryRun = process.argv.includes('--dry-run')
  fs.mkdirSync(OUT_DIR, { recursive: true })

  console.log('=== 同步 GCAT ===')
  const text = await fetchSatcatText()
  const raw = parseSatcat(text)
  console.log('  · 解析记录数: ' + raw.length)

  // 三类集合：
  //   catalog —— 在轨航天器/载荷（卫星百科主列表，排除火箭体）
  //   inOrbit —— 所有未终结对象（全球在轨资产统计，含火箭体）
  //   ended   —— 已再入/解体对象（事件流）
  const catalog = raw.filter(isCatalog).map(decorate)
  const inOrbit = raw.filter(isInOrbit).map(decorate)
  const ended = raw.filter((r) => ENDED_STATUS.has(r.status)).map(decorate)
  console.log(`  · 卫星百科(在轨航天器): ${catalog.length} · 在轨资产总计: ${inOrbit.length} · 已终结(再入/解体): ${ended.length}`)

  // 卫星百科按发射日期倒序：首屏就是最新入轨的卫星，而不是 GCAT 编号最老的
  catalog.sort((a, b) => (a.launch < b.launch ? 1 : a.launch > b.launch ? -1 : 0))

  // ---- 卫星百科：活跃子集分片 ----
  // 分片与图库保持一致：每一个片都是带 list 的包装对象，
  // 否则前端 request() 的 Array.isArray(body.list) 守卫会拒绝（裸数组没有 .list）。
  // 第 0 片额外挂 chunkSize/total/served，省得前端再拉一个文件才知道总数。
  fs.mkdirSync(path.join(OUT_DIR, 'satellites'), { recursive: true })
  const generatedAt = new Date().toISOString()
  const total = catalog.length
  const chunks = Math.max(1, Math.ceil(total / CHUNK))
  for (let i = 0; i < chunks; i++) {
    const slice = catalog.slice(i * CHUNK, (i + 1) * CHUNK)
    const body = {
      v: DATA_VERSION,
      dataset: 'satellites',
      chunk: i,
      count: total,
      chunks,
      generatedAt,
      list: slice
    }
    const out = i === 0
      ? Object.assign({}, body, { chunkSize: CHUNK, total, served: slice.length })
      : body
    const file = i === 0 ? 'satellites.json' : `satellites/${i}.json`
    fs.writeFileSync(path.join(OUT_DIR, file), JSON.stringify(out))
  }
  console.log(`  → satellites.json  ${total} 条 / ${chunks} 片`)

  // ---- 全球在轨资产：聚合统计（基于 inOrbit，含火箭体）----
  const byState = {}
  const byOrbit = {}
  const byDecade = {}
  for (const r of inOrbit) {
    const s = r.stateZh || r.state || '未知'
    byState[s] = (byState[s] || 0) + 1
    const o = r.orbitZh || r.orbit || '未知'
    byOrbit[o] = (byOrbit[o] || 0) + 1
    const y = yearOf(r.launch)
    if (y) {
      const d = Math.floor(y / 10) * 10
      byDecade[d] = (byDecade[d] || 0) + 1
    }
  }
  const orbitStats = {
    v: DATA_VERSION,
    dataset: 'orbitStats',
    generatedAt: new Date().toISOString(),
    total: inOrbit.length,
    // 聚合数据集没有逐条 list，但前端 request() 守卫要求 body.list 为数组，
    // 给一个空数组既绕过守卫、也不影响 readStorage（聚合页本就每次拉 CDN，体积极小）
    list: [],
    byState: Object.entries(byState).sort((a, b) => b[1] - a[1]).slice(0, 25).map(([k, v]) => ({ k, v })),
    byOrbit: Object.entries(byOrbit).sort((a, b) => b[1] - a[1]).map(([k, v]) => ({ k, v })),
    byDecade: Object.entries(byDecade).sort((a, b) => a[0] - b[0]).map(([k, v]) => ({ k: parseInt(k, 10), v }))
  }
  fs.writeFileSync(path.join(OUT_DIR, 'orbit-stats.json'), JSON.stringify(orbitStats))
  console.log(`  → orbit-stats.json  各国 ${orbitStats.byState.length} / 轨道 ${orbitStats.byOrbit.length} / 年代 ${orbitStats.byDecade.length}`)

  // ---- 在轨解体 / 再入事件流：按再入日期排序 ----
  const events = ended
    .filter((r) => r.reentry)
    .sort((a, b) => (a.reentry > b.reentry ? 1 : a.reentry < b.reentry ? -1 : 0))
    .map((r) => ({
      id: r.id,
      name: r.name,
      intl: r.intl,
      reentry: r.reentry,
      status: r.status,
      statusZh: r.statusZh,
      state: r.state,
      stateZh: r.stateZh,
      orbit: r.orbit,
      orbitZh: r.orbitZh,
      owner: r.owner
    }))
  const debris = {
    v: DATA_VERSION,
    dataset: 'debrisEvents',
    generatedAt: new Date().toISOString(),
    count: events.length,
    list: events
  }
  fs.writeFileSync(path.join(OUT_DIR, 'debris-events.json'), JSON.stringify(debris))
  console.log(`  → debris-events.json  ${events.length} 条事件`)

  if (dryRun) {
    console.log('\n[dry-run] 仅本地输出，未上传 COS')
    return
  }

  // ---- 上传 COS ----
  // GCAT 季度才更新一次，缓存给足 1 天，避免每次进页都打 CDN
  const CACHE = 'public, max-age=86400'
  const tasks = ['satellites.json', 'orbit-stats.json', 'debris-events.json']
  for (let i = 0; i < chunks; i++) tasks.push(i === 0 ? null : `satellites/${i}.json`)
  for (const f of tasks.filter(Boolean)) {
    await upload(path.join(OUT_DIR, f), `space-data/${f}`, CACHE)
    console.log('  ↑ ' + f)
  }
  console.log('\n=== GCAT 同步完成 ===')
}

main().catch((e) => {
  console.error('GCAT 同步失败:', e.message)
  process.exit(1)
})
