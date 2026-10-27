// 「我的」页预览：真实数据（COS 上的 upcoming）+ 编译后 mine.wxss
// 输出两态：有收藏/提醒  与  空态引导
import fs from 'fs'
import path from 'path'

const ROOT = path.resolve(import.meta.dirname, '..')
const CDN = 'https://spacelaunch-1258113633.cos.ap-chengdu.myqcloud.com/space-data'
const V = 'data-v-7c2ebfa5'

const rpx2px = (css) => css.replace(/(-?[\d.]+)rpx/g, (_, n) => parseFloat(n) / 2 + 'px')
const wxss = rpx2px(
	fs.readFileSync(path.join(ROOT, 'unpackage/dist/dev/mp-weixin/pages/mine/mine.wxss'), 'utf8')
)

const esc = (s) => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;')

const fmtShort = (v) => {
	const d = new Date(v)
	if (isNaN(d)) return ''
	return `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:${String(
		d.getMinutes()
	).padStart(2, '0')}`
}
const relTime = (v) => {
	const t = new Date(v).getTime()
	if (isNaN(t)) return ''
	const diff = t - Date.now()
	const abs = Math.abs(diff)
	const d = Math.floor(abs / 86400000)
	const h = Math.floor((abs % 86400000) / 3600000)
	const parts = d > 0 ? `${d}天${h ? h + '小时' : ''}` : `${h}小时`
	return diff > 0 ? `${parts}后` : `${parts}前`
}

const row = (x, icon) => `
  <view class="row ${V}" >
    ${
			x.imageThumb
				? `<image class="row-img ${V}" style="background-image:url('${x.imageThumb}');background-size:cover;background-position:center"></image>`
				: `<view class="row-img row-ph ${V}"><text class="row-ph-icon ${V}">${icon}</text></view>`
		}
    <view class="row-body ${V}">
      <text class="row-name ${V}">${esc(x.name)}</text>
      <text class="row-meta ${V}">${[fmtShort(x.net), relTime(x.net), (x.status && (x.status.nameZh || x.status.name)) || ''].filter(Boolean).join(' · ')}</text>
    </view>
    <text class="arrow ${V}">›</text>
  </view>`

;(async () => {
	const r = await fetch(`${CDN}/launches-upcoming.json`, { signal: AbortSignal.timeout(30000) })
	const j = await r.json()
	const list = (j.list || []).slice(0, 3)

	const favs = list.slice(0, 2)
	const rems = list.slice(2, 3)
	const ver = '3.1.18'

	const stats = (f, rm) => `
    <view class="stats ${V}">
      <view class="stat ${V}"><text class="stat-num ${V}">${f}</text><text class="stat-label ${V}">收藏</text></view>
      <view class="stat-line ${V}"></view>
      <view class="stat ${V}"><text class="stat-num ${V}">${rm}</text><text class="stat-label ${V}">提醒</text></view>
      <view class="stat-line ${V}"></view>
      <view class="stat ${V}"><text class="stat-num stat-ver ${V}">${ver}</text><text class="stat-label ${V}">当前版本</text></view>
    </view>`

	const entries = [
		{ icon: '📊', name: '数据统计', desc: '历年发射量' },
		{ icon: '🖼️', name: '图库', desc: '发射现场照片' }
	]

	const page = (withData) => `
<div class="phone">
  <div class="sb"><span>22:35</span><div class="caps"></div></div>

  <view class="hero ${V}" style="padding-top:70px">
    <view class="hero-glow ${V}"></view>
    <view class="logo ${V}" style="background:#0d1420;display:flex;align-items:center;justify-content:center;color:#38bdf8;font:600 13px sans-serif">LOGO</view>
    <view class="brand ${V}" style="display:flex;align-items:baseline"><text class="brand-a ${V}">Space</text><text class="brand-b ${V}">Launch</text></view>
    <text class="slogan ${V}">记录人类成为多星球物种的进程</text>
    ${stats(withData ? favs.length : 0, withData ? rems.length : 0)}
  </view>

  <view class="content ${V}">
  ${
		withData
			? `
  <view class="block ${V}">
    <view class="block-head ${V}"><text class="block-title ${V}">我的收藏</text><text class="block-sub ${V}">${favs.length} 条</text></view>
    <view class="rows ${V}">${favs.map((x) => row(x, '🚀')).join('')}</view>
  </view>
  <view class="block ${V}">
    <view class="block-head ${V}"><text class="block-title ${V}">我的提醒</text><text class="block-sub ${V}">${rems.length} 条</text></view>
    <view class="rows ${V}">${rems.map((x) => row(x, '🔔')).join('')}</view>
  </view>`
			: `
  <view class="tips ${V}">
    <text class="tips-icon ${V}">☆</text>
    <text class="tips-text ${V}">在发射详情页点「☆ 收藏」或「提醒」，你的清单会出现在这里</text>
  </view>`
	}

  <view class="block ${V}">
    <text class="block-title block-title-standalone ${V}">探索</text>
    <view class="grid ${V}">
      ${entries
				.map(
					(e) => `<view class="cell ${V}">
        <text class="cell-icon ${V}">${e.icon}</text>
        <text class="cell-name ${V}">${e.name}</text>
        <text class="cell-desc ${V}">${e.desc}</text>
      </view>`
				)
				.join('')}
    </view>
  </view>

  <view class="block ${V}">
    <text class="block-title block-title-standalone ${V}">关于</text>
    <view class="about ${V}">
      <view class="about-row ${V}">
        <text class="about-label ${V}">版本记录</text>
        <view class="about-right ${V}"><text class="about-value ${V}">${ver}</text><text class="arrow ${V}">›</text></view>
      </view>
      <view class="about-divider ${V}"></view>
      <view class="about-row ${V}"><text class="about-label ${V}">数据来源</text><text class="about-value ${V}">The Space Devs</text></view>
      <view class="about-divider ${V}"></view>
      <view class="about-row ${V}"><text class="about-label ${V}">同步频率</text><text class="about-value ${V}">每日自动</text></view>
      <view class="about-divider ${V}"></view>
      <button class="about-row contact-btn ${V}">
        <text class="about-label ${V}">联系作者</text>
        <view class="about-right ${V}"><text class="about-value ${V}">发消息</text><text class="arrow ${V}">›</text></view>
      </button>
    </view>
    <text class="about-note ${V}">发射与活动数据来自 Launch Library 2 API，活动信息以官方发布为准。</text>
  </view>

  <view class="footer ${V}"><text class="footer-text ${V}">SpaceLaunch · 为航天爱好者而做</text></view>
  </view>
</div>`

	const html = `<!doctype html>
<html><head><meta charset="utf-8"><style>
  * { box-sizing: border-box; }
  view, text { display: block; }
  body { margin: 0; background: #0a0e17; display: flex; gap: 24px; padding: 0; align-items: flex-start; }
  .phone { width: 375px; position: relative; background: #0a0e17; padding-bottom: 24px; }
  /* 模拟小程序 button 的重置（真实页面由 wxss 的 .contact-btn 负责） */
  button { font: inherit; border: none; background: none; color: inherit; }
  .sb { position: absolute; top: 0; left: 0; right: 0; height: 44px; z-index: 9;
        display: flex; align-items: center; justify-content: space-between;
        padding: 0 14px; color: #fff; font: 600 13px/1 -apple-system, sans-serif; }
  .caps { width: 82px; height: 30px; border-radius: 15px; border: 1px solid rgba(255,255,255,.25); background: rgba(0,0,0,.35); }
${wxss}
</style></head>
<body>
${page(true)}
${page(false)}
</body></html>`

	fs.writeFileSync(path.join(ROOT, 'preview-mine.html'), html, 'utf8')
	console.log('已生成 preview-mine.html')
	console.log('收藏样例：', favs.map((x) => x.name).join(' | '))
	console.log('提醒样例：', rems.map((x) => x.name).join(' | '))
})().catch((e) => console.error('ERR', e.message))
