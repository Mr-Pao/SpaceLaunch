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

// satcat 的 Status 列是「相位结束码」，语义以官方 phases 文档为准：
// https://planet4589.org/space/gcat/web/intro/phases.html
//   O 在轨 / OX 在轨但失联 / N 改名 / DK 已对接 / DSO 深空飞行 /
//   AO 附着在轨 / GRP 抓取在轨 / ATT 附着 / DSA 深空附着 / REL 释放
//   R 已再入 / D 主动离轨 / L 已落地 / E 爆炸解体 / AR 附着再入
// 注意：R 不是「火箭体」而是「已再入」；火箭体是 Type 列（R1~R5）
const STATUS_MAP = {
  O: '在轨', OX: '在轨(失联)', N: '在轨(改名)', DK: '已对接', DSO: '深空',
  AO: '附着在轨', GRP: '抓取在轨', ATT: '附着', DSA: '深空附着', REL: '已释放',
  TFR: '在轨', C: '在轨', 'EVA DP': '出舱部署',
  R: '已再入', D: '主动离轨', L: '已落地', E: '爆炸解体', AR: '附着再入',
  'R?': '已再入(待定)', 'L?': '已落地(待定)', ERR: '数据异常'
}

// 仍在轨（未终结）：含失联、深空、已对接、附着等
const IN_ORBIT_STATUS = new Set(['O', 'OX', 'N', 'DK', 'DSO', 'AO', 'GRP', 'ATT', 'DSA', 'REL', 'TFR', 'C', 'EVA DP'])
// 已终结：再入 / 主动离轨 / 落地 / 爆炸解体
const ENDED_STATUS = new Set(['R', 'D', 'L', 'E', 'AR', 'R?', 'L?'])
// 终结事件分型：解体 / 再入 / 离轨 / 落地
const EVENT_KIND = { E: 'breakup', R: 'reentry', AR: 'reentry', 'R?': 'reentry', D: 'deorbit', L: 'landing', 'L?': 'landing' }

// 对象类别 = SatType 码首字母（P 载荷 / R 火箭体 / C 部件 / D 碎片 / Z 未知）
const CLASS_MAP = { P: '载荷', R: '火箭体', C: '部件', D: '碎片', Z: '未知' }
function typeClass(rec) {
  const c = (rec.type || '').trim().charAt(0).toUpperCase()
  return CLASS_MAP[c] ? c : 'Z'
}

// 在轨 = 相位未终结（仍挂在天上，含火箭体、碎片残骸）
function isInOrbit(rec) { return IN_ORBIT_STATUS.has(rec.status) }
// 已终结 = 再入/离轨/落地/解体
function isEnded(rec) { return ENDED_STATUS.has(rec.status) }
// 卫星百科 = 在轨 且 载荷（排除火箭体、碎片、部件）
function isCatalog(rec) { return isInOrbit(rec) && typeClass(rec) === 'P' }

// GCAT 轨道分类代码 → 中文（基础码；带 /S /P /I 后缀时由 detailOrbit 拼接）
const ORBIT_MAP = {
  LLEO: '近地低轨', LEO: '近地轨道', MEO: '中地球轨道', GEO: '地球同步轨道',
  HEO: '大椭圆轨道', GTO: '转移轨道', VHEO: '高地球轨道', DSO: '深空轨道', EEO: '地球逃逸轨道',
  CLO: '环月轨道', LLO: '月球低轨', SO: '日心轨道', HCO: '日心轨道', EMO: '地月转移'
}
const ORBIT_SUFFIX = { S: '太阳同步', P: '极轨', I: '倾斜', SS: '太阳同步', E: '赤道', O: '其他' }
// 粗分（聚合统计用，控制在 ~10 个大桶，避免 70+ 原始码撑爆图表）
const COARSE_ORBIT = {
  LLEO: '近地轨道', LEO: '近地轨道', MEO: '中地球轨道', GEO: '地球同步轨道',
  HEO: '大椭圆轨道', GTO: '转移轨道', VHEO: '高地球轨道', EEO: '地球逃逸',
  DSO: '深空', SO: '深空', HCO: '深空', CLO: '月球轨道', LLO: '月球轨道', EMO: '地月转移'
}

function orbitKeyOf(raw) {
  return (raw || '').replace(/\s*-\s*$/, '').trim().replace(/\s+/g, ' ')
}
/** 详细中文（近地轨道(太阳同步)…），用于卡片与详情 */
function detailOrbit(raw) {
  const key = orbitKeyOf(raw)
  if (!key) return ''
  if (ORBIT_MAP[key]) return ORBIT_MAP[key]
  const parts = key.split('/')
  const baseZh = ORBIT_MAP[parts[0].trim()]
  if (!baseZh) return key
  const suf = parts[1] ? ORBIT_SUFFIX[parts[1].trim()] : ''
  return suf ? baseZh + '(' + suf + ')' : baseZh
}
/** 粗分中文（近地轨道…），用于聚合统计。兼容 "MEO CSS" / "EEO H" 这类空格后缀。 */
function coarseOrbit(raw) {
  const key = orbitKeyOf(raw)
  if (!key) return '未知'
  const base = key.split('/')[0].trim()
  const head = base.split(/\s+/)[0]
  return COARSE_ORBIT[base] || COARSE_ORBIT[head] || ORBIT_MAP[base] || ORBIT_MAP[head] || base
}
// 运营方/所有者代码（GCAT 4~6 字母缩写）→ 可读名。覆盖在轨量 top 项，其余保留原码。
const OWNER_MAP = {
  SPXS: 'SpaceX', SPX: 'SpaceX', ONEWEB: 'OneWeb', ONEWEBN: 'OneWeb', IRIDS: 'Iridium',
  NASA: 'NASA', GSFC: 'NASA 戈达德', JPL: 'NASA 喷气推进实验室', NOAA: '美国海洋大气局',
  USAF: '美国空军', USSF: '美国太空军', USNA: '美国海军', NRO: '美国国家侦察局',
  AFSSD: '美国空军', AFSMC: '美国空军', AFSD: '美国空军', SAMSO: '美国空军',
  CASC: '中国航天科技集团', CNSA: '中国国家航天局', CASA: '中国国家航天局', PLAN: '中国海军', CMSEO: '中国载人航天',
  ROSC: '俄罗斯航天集团', RKKE: '俄罗斯能源航天集团', KHRR: '赫鲁尼切夫中心',
  KVR: '俄罗斯军方', RVSN: '俄罗斯军方', RVSNR: '俄罗斯军方', GUKOS: '俄罗斯军方',
  GUKOSR: '俄罗斯军方', VKS: '俄罗斯军方', VMF: '俄罗斯军方', PVO: '俄罗斯军方', UNKS: '俄罗斯军方',
  ESA: '欧空局', EUM: '欧空局(EUMETSAT)', JXA: 'JAXA', ISRO: '印度空间研究组织',
  INTL: '国际组织', COMM: '商业公司'
}

// 国家/地区代码（GCAT 自用码，注意与 ISO2 不同：F=法国、J=日本、D=德国、I=意大利、E=西班牙、N=挪威、S=瑞典）
const STATE_MAP = {
  US: '美国', SU: '苏联', RU: '俄罗斯', CN: '中国', UK: '英国',
  F: '法国', D: '德国', J: '日本', IN: '印度', I: '意大利', E: '西班牙',
  CA: '加拿大', KR: '韩国', KP: '朝鲜', TW: '中国台湾', HK: '中国香港',
  AU: '澳大利亚', BR: '巴西', NZ: '新西兰', UY: '乌拉圭', IL: '以色列',
  IR: '伊朗', TR: '土耳其', UAE: '阿联酋', SA: '沙特', ID: '印尼',
  SG: '新加坡', TH: '泰国', VN: '越南', MY: '马来西亚', PH: '菲律宾',
  PK: '巴基斯坦', BD: '孟加拉', LK: '斯里兰卡', NP: '尼泊尔', MN: '蒙古',
  NL: '荷兰', B: '比利时', L: '卢森堡', CH: '瑞士', AT: '奥地利',
  S: '瑞典', N: '挪威', DK: '丹麦', FI: '芬兰', PL: '波兰',
  CZ: '捷克', HU: '匈牙利', RO: '罗马尼亚', GR: '希腊', T: '泰国',
  BG: '保加利亚', SK: '斯洛伐克', UA: '乌克兰', BY: '白俄罗斯', LT: '立陶宛',
  LV: '拉脱维亚', EE: '爱沙尼亚', AM: '亚美尼亚', AZ: '阿塞拜疆', KZ: '哈萨克斯坦',
  CSFR: '捷克斯洛伐克', CSSR: '捷克斯洛伐克', HR: '克罗地亚', SI: '斯洛文尼亚', ME: '黑山',
  MX: '墨西哥', AR: '阿根廷', CL: '智利', CO: '哥伦比亚', PE: '秘鲁',
  VE: '委内瑞拉', EC: '厄瓜多尔', BO: '玻利维亚', PY: '巴拉圭', CR: '哥斯达黎加',
  ZA: '南非', EG: '埃及', DZ: '阿尔及利亚', MA: '摩洛哥', NG: '尼日利亚',
  KE: '肯尼亚', ET: '埃塞俄比亚', AO: '安哥拉', ZW: '津巴布韦', TN: '突尼斯',
  'I-ESA': '欧空局', 'I-EU': '欧盟', 'I-INT': '国际组织', 'I-EUM': '欧空局(EUMETSAT)',
  'I-ESRO': '欧空局(ESRO)', 'I-ARAB': '阿拉伯卫星组织', 'I-NATO': '北约',
  'I-INM': '国际海事卫星组织', 'I-RASC': '阿拉伯卫星通信组织',
  ESA: '欧空局', EU: '欧盟', INTL: '国际组织'
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

const MON = { Jan: 1, Feb: 2, Mar: 3, Apr: 4, May: 5, Jun: 6, Jul: 7, Aug: 8, Sep: 9, Oct: 10, Nov: 11, Dec: 12 }
/** "2024 Mar  5" → 20240305（排序用）；无法解析返回 0 */
function dateKey(s) {
  if (!s) return 0
  const m = String(s).trim().match(/^(\d{4})(?:\s+([A-Za-z]{3}))?(?:\s+(\d{1,2}))?/)
  if (!m) return 0
  const y = parseInt(m[1], 10)
  const mo = m[2] ? (MON[m[2]] || 0) : 0
  const d = m[3] ? parseInt(m[3], 10) : 1
  return y * 10000 + mo * 100 + d
}
/** 规范日期显示："2024 Mar  5" → "2024-03-05"；年不确定时只留年 */
function normDate(s) {
  if (!s) return ''
  const t = String(s).trim()
  const m = t.match(/^(\d{4})(?:\s+([A-Za-z]{3}))?(?:\s+(\d{1,2}))?/)
  if (!m) return t
  const y = m[1]
  const mo = m[2] ? (MON[m[2]] || 0) : 0
  if (!mo) return y
  const mm = String(mo).padStart(2, '0')
  const d = m[3] ? parseInt(m[3], 10) : 0
  return d ? y + '-' + mm + '-' + String(d).padStart(2, '0') : y + '-' + mm
}

/** 把原始状态码/轨道/国家映射成前端友好的中文 + 干净字段 */
function decorate(rec) {
  const cls = typeClass(rec)
  const statusZh = STATUS_MAP[rec.status] || (rec.status || '未知')
  const stateZh = STATE_MAP[rec.state] || rec.state || ''
  const ownerZh = OWNER_MAP[rec.owner] || ''
  const ren = rec.reentry && rec.reentry !== '-' ? normDate(rec.reentry) : ''
  return {
    id: rec.jcat,
    satcat: rec.satcat,
    intl: rec.intl,
    name: rec.name || rec.alt || '(未命名)',
    alt: rec.alt,
    launch: rec.launch,
    reentry: ren,
    rkey: dateKey(rec.reentry),
    status: rec.status,
    statusZh,
    cls,
    clsZh: CLASS_MAP[cls],
    owner: rec.owner,
    ownerZh,
    state: rec.state,
    stateZh,
    orbit: orbitKeyOf(rec.orbitRaw),
    orbitZh: detailOrbit(rec.orbitRaw),
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
  // satcat 有 32MB，源站偶尔很慢；给 5 分钟超时 + 3 次重试
  let lastErr
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const res = await fetch(SATCAT_URL, { signal: AbortSignal.timeout(300000) })
      if (!res.ok) throw new Error('GCAT HTTP ' + res.status)
      return await res.text()
    } catch (e) {
      lastErr = e
      console.log(`  · 抓取失败(第 ${attempt} 次): ${e.message}`)
    }
  }
  throw lastErr
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
  //   catalog —— 在轨载荷（卫星百科主列表，P 类，排除火箭体/碎片/部件）
  //   inOrbit —— 所有在轨对象（全球在轨资产统计，含火箭体、碎片）
  //   ended   —— 已再入/解体对象（事件流）
  const catalog = raw.filter(isCatalog).map(decorate)
  const inOrbit = raw.filter(isInOrbit).map(decorate)
  const ended = raw.filter(isEnded).map(decorate)
  console.log(`  · 卫星百科(在轨载荷): ${catalog.length} · 在轨总计: ${inOrbit.length} · 已终结: ${ended.length}`)

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

  // ---- 全球在轨资产：聚合统计（基于 inOrbit，含火箭体/碎片）----
  const byState = {}
  const byOrbit = {}
  const byClass = {}
  const byDecade = {}
  for (const r of inOrbit) {
    const s = r.stateZh || r.state || '未知'
    byState[s] = (byState[s] || 0) + 1
    const o = coarseOrbit(r.orbit)
    byOrbit[o] = (byOrbit[o] || 0) + 1
    const c = r.clsZh || '未知'
    byClass[c] = (byClass[c] || 0) + 1
    const y = yearOf(r.launch)
    if (y) {
      const d = Math.floor(y / 10) * 10
      byDecade[d] = (byDecade[d] || 0) + 1
    }
  }
  const desc = (obj, cap) => Object.entries(obj).sort((a, b) => b[1] - a[1]).slice(0, cap || 999).map(([k, v]) => ({ k, v }))
  const orbitStats = {
    v: DATA_VERSION,
    dataset: 'orbitStats',
    generatedAt: new Date().toISOString(),
    total: inOrbit.length,
    // 聚合数据集没有逐条 list，但前端 request() 守卫要求 body.list 为数组，
    // 给一个空数组既绕过守卫、也不影响 readStorage（聚合页本就每次拉 CDN，体积极小）
    list: [],
    byState: desc(byState, 20),
    byOrbit: desc(byOrbit),
    byClass: desc(byClass),
    byDecade: Object.entries(byDecade).sort((a, b) => a[0] - b[0]).map(([k, v]) => ({ k: parseInt(k, 10), v }))
  }
  fs.writeFileSync(path.join(OUT_DIR, 'orbit-stats.json'), JSON.stringify(orbitStats))
  console.log(`  → orbit-stats.json  国家 ${orbitStats.byState.length} / 轨道 ${orbitStats.byOrbit.length} / 类型 ${orbitStats.byClass.length} / 年代 ${orbitStats.byDecade.length}`)

  // ---- 在轨解体 / 再入事件流 ----
  // 全量已终结 3.5 万条（其中 R 再入 3.3 万）作事件流太肥，只保留：
  //   ① 全部「爆炸解体」(E，~78 条，最有价值)
  //   ② 最近 DEBRIS_CAP 条再入/离轨/落地（按再入日期倒序）
  const DEBRIS_CAP = 1600
  const breakup = ended.filter((r) => r.status === 'E')
  const rest = ended.filter((r) => r.status !== 'E' && r.rkey > 0).sort((a, b) => b.rkey - a.rkey)
  const events = breakup
    .concat(rest.slice(0, Math.max(0, DEBRIS_CAP - breakup.length)))
    .sort((a, b) => b.rkey - a.rkey)
    .map((r) => ({
      id: r.id,
      name: r.name,
      intl: r.intl,
      reentry: r.reentry,
      rkey: r.rkey,
      kind: EVENT_KIND[r.status] || 'reentry',
      status: r.status,
      statusZh: r.statusZh,
      state: r.state,
      stateZh: r.stateZh,
      orbitZh: r.orbitZh,
      clsZh: r.clsZh
    }))
  const debris = {
    v: DATA_VERSION,
    dataset: 'debrisEvents',
    generatedAt: new Date().toISOString(),
    count: events.length,
    breakupCount: breakup.length,
    list: events
  }
  fs.writeFileSync(path.join(OUT_DIR, 'debris-events.json'), JSON.stringify(debris))
  console.log(`  → debris-events.json  ${events.length} 条事件（含解体 ${breakup.length}）`)

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

// 导出解析能力，方便独立脚本复用（如状态码直方图）；CI 仍走 main()
module.exports = {
  computeColumns, parseSatcat, fetchSatcatText, FIELDS, STATUS_MAP,
  detailOrbit, coarseOrbit, typeClass, isInOrbit, isEnded, isCatalog, decorate
}

if (require.main === module) {
  main().catch((e) => {
    console.error('GCAT 同步失败:', e.message)
    process.exit(1)
  })
}
