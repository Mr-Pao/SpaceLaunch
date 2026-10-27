// 「火箭资料库」预览：直接抽 rockets.vue 的真实样式 + dist 里的真实数据
// 样式不手写，避免预览和真机长得不一样
import fs from 'fs'
import path from 'path'

const ROOT = path.resolve(import.meta.dirname, '..')

const vue = fs.readFileSync(path.join(ROOT, 'pages/rockets/rockets.vue'), 'utf8')
let css = vue.match(/<style[^>]*>([\s\S]*?)<\/style>/)[1]
css = css.replace(/@import[^;]+;/g, '')
css = css.replace(/(-?[\d.]+)rpx/g, (_, n) => parseFloat(n) / 2 + 'px')

const d = JSON.parse(fs.readFileSync(path.join(ROOT, 'dist/launchers.json'), 'utf8'))
const list = d.list || d

let maxL = 1
let maxC = 1
for (const x of list) {
	if (!x.active) continue
	maxL = Math.max(maxL, x.total_launch_count || 0)
	maxC = Math.max(maxC, x.leo_capacity || 0)
}

// 中文名与国旗复用页面同一套函数，避免预览和真机不一致
const fmt = await import('file://' + path.join(ROOT, 'utils/format.js').replace(/\\/g, '/'))

const scored = list
	.filter((x) => x.active)
	.map((x) => {
		const ok = x.successful_launches || 0
		const bad = x.failed_launches || 0
		const tr = ok + bad
		const rate = tr ? ok / tr : 0
		return {
			...x,
			rate,
			makerZh: fmt.agencyLabel(x.manufacturer) || '',
			flag: fmt.flagSrc(x.manufacturer),
			score: 0.45 * ((x.total_launch_count || 0) / maxL) + 0.35 * rate + 0.2 * ((x.leo_capacity || 0) / maxC)
		}
	})

const seen = new Map()
for (const x of scored) {
	const cur = seen.get(x.name)
	if (!cur || x.score > cur.score) seen.set(x.name, x)
}
const pool = [...seen.values()].sort((a, b) => b.score - a.score)
const top = pool

const leoText = (kg) => {
	if (!(kg > 0)) return '—'
	if (kg >= 1000) {
		const t = Math.round((kg / 1000) * 10) / 10
		return (t % 1 === 0 ? t.toFixed(0) : t) + ' 吨'
	}
	return kg + ' kg'
}

const topLeo = pool.filter((x) => x.leo_capacity > 0).sort((a, b) => b.leo_capacity - a.leo_capacity)[0]
const topLaunch = pool.filter((x) => x.total_launch_count > 0).sort((a, b) => b.total_launch_count - a.total_launch_count)[0]
const reusableCount = pool.filter((x) => x.reusable).length


const card = (r, i) => `
<view class="rank-card ${i < 3 ? 'is-top' : ''}">
  <view class="rank-media">
    ${r.image ? `<image class="rank-img" style="background-image:url('${r.image}');background-size:cover;background-position:center"></image>` : `<view class="rank-img rank-ph"><text class="rank-ph-icon">🚀</text></view>`}
    <text class="rank-no ${i < 3 ? 'lv' + (i + 1) : ''}">#${i + 1}</text>
    ${r.reusable ? '<text class="rank-flag">可复用</text>' : ''}
  </view>
  <view class="rank-body">
    <view class="rank-head">
      <text class="rank-name">${fmt.rocketFullName(r)}</text>
      <text class="rank-more">详情</text>
    </view>
    ${r.full_name && r.full_name !== fmt.rocketFullName(r) ? `<text class="rank-en">${r.full_name}</text>` : ''}
    <view class="rank-maker-row">${r.flag ? `<img class="flag" src="${r.flag}" style="object-fit:contain">` : ''}<text class="rank-maker">${r.makerZh || r.manufacturer || '未知制造商'}</text></view>
    <view class="rank-metrics">
      <view class="metric"><text class="m-v">${leoText(r.leo_capacity)}</text><text class="m-k">LEO 运力</text></view>
      <view class="metric"><text class="m-v">${r.total_launch_count || 0}</text><text class="m-k">累计发射</text></view>
      <view class="metric"><text class="m-v">${(r.rate * 100).toFixed(1)}%</text><text class="m-k">成功率</text></view>
    </view>
  </view>
</view>`

const html = `<!doctype html>
<html><head><meta charset="utf-8"><style>
* { box-sizing: border-box; }
view, text { display: block; }
body { margin: 0; background: #0a0e17; }
.phone { width: 375px; position: relative; }
/* 状态栏 + 胶囊，模拟真机顶部 */
.sb { position: absolute; top: 0; left: 0; right: 0; height: 44px; z-index: 9;
      display: flex; align-items: center; justify-content: space-between;
      padding: 0 14px; color: #fff; font: 600 13px/1 -apple-system, sans-serif; }
.caps { width: 82px; height: 30px; border-radius: 15px; border: 1px solid rgba(255,255,255,.2);
        background: rgba(0,0,0,.3); }
/* 星空：抽 40 颗，真机是 160 颗 fixed 层 */
.star-field { position: absolute; inset: 0; z-index: -1; pointer-events: none; }
.stars { position: absolute; top: 0; left: 0; width: 1px; height: 1px; border-radius: 50%;
         background: transparent; opacity: .7;
         box-shadow: ${Array.from({ length: 60 }, () => `${(Math.random() * 375).toFixed(0)}px ${(Math.random() * 900).toFixed(0)}px 0 ${Math.random() > 0.85 ? 1 : 0}px rgba(255,255,255,${(0.3 + Math.random() * 0.7).toFixed(2)})`).join(', ')}; }
button { font: inherit; border: none; background: none; color: inherit; }
${css}
</style></head>
<body>
<div class="phone">
  <view class="star-field"><view class="stars"></view></view>
  <view class="sb"><text>21:04</text><view class="caps"></view></view>

  <view class="page" style="padding-top:50px">
    <view class="nav-mask" style="height:44px"></view>

    <view class="hero">      <view class="hero-top">
        <text class="hero-kicker">SPACEDALLY / LAUNCH INDEX</text>
      </view>
      <view class="hero-title-row">
        <text class="hero-title">全球火箭实力榜</text>
        <text class="hero-state">在役</text>
      </view>
      <view class="hero-main">
        <text class="hero-sub">基于运力、可靠性、发射活跃度</text>
        <view class="hero-count">
          <text class="hero-num">${pool.length}</text>
          <text class="hero-unit">型号火箭</text>
        </view>
      </view>
      <view class="hero-cells">
        <view class="hcell">
          <text class="hcell-k">最近近地运力</text>
          <text class="hcell-v">${topLeo ? topLeo.name : '—'}</text>
          <text class="hcell-n">${topLeo ? leoText(topLeo.leo_capacity) : '暂无'}</text>
        </view>
        <view class="hcell">
          <text class="hcell-k">发射最活跃</text>
          <text class="hcell-v">${topLaunch ? topLaunch.name : '—'}</text>
          <text class="hcell-n">${topLaunch ? topLaunch.total_launch_count + ' 次发射' : '暂无'}</text>
        </view>
        <view class="hcell">
          <text class="hcell-k">可复用型号</text>
          <text class="hcell-v">${reusableCount}</text>
          <text class="hcell-n">型</text>
        </view>
      </view>
    </view>

    <view class="search">
      <text class="search-icon">🔍</text>
      <text class="search-input" style="color:#4a5568">搜索中文名、型号、制造商</text>
    </view>

    <text class="sort-label">排序方式</text>
    <view class="sort-tabs">
      <view class="sort-tab on">综合榜</view>
      <view class="sort-tab">运力榜</view>
      <view class="sort-tab">发射榜</view>
      <view class="sort-tab">可靠榜</view>
    </view>

    <view class="region-inner">
      <view class="region on">全球</view>
      <view class="region">中国</view>
      <view class="region">美国</view>
      <view class="region">俄罗斯</view>
      <view class="region">欧洲</view>
    </view>

    <view class="board-line">
      <view class="board-left">
        <text class="board-title">综合榜</text>
        <text class="board-desc">45% 活跃度 · 35% 可靠性 · 20% LEO 运力</text>
      </view>
      <text class="board-count">${pool.length} 个结果</text>
    </view>

    ${top.slice(0, 6).map(card).join('')}

    <view class="foot-hint"><text>上拉加载更多</text></view>
  </view>
</div>
</body></html>`

// 小程序里是 /static/... 绝对路径，本地 HTML 要改成相对路径才找得到图
fs.writeFileSync(
	path.join(ROOT, 'preview-rockets.html'),
	html.replace(/src="\/static\//g, 'src="static/'),
	'utf8'
)
console.log('已生成 preview-rockets.html；榜单条数', pool.length)
console.log('Top6：', top.slice(0, 6).map((x) => x.name).join(' | '))
