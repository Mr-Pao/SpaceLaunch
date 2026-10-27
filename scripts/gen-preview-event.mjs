// 活动详情页的真机预览：真实数据（COS events.json）+ 编译后 eventInfo.wxss
import fs from 'fs'
import path from 'path'

const ROOT = path.resolve(import.meta.dirname, '..')
const CDN = 'https://spacelaunch-1258113633.cos.ap-chengdu.myqcloud.com/space-data'
const V = 'data-v-3a45e14d'

const rpx2px = (css) => css.replace(/(-?[\d.]+)rpx/g, (_, n) => parseFloat(n) / 2 + 'px')
const wxss = rpx2px(
	fs.readFileSync(path.join(ROOT, 'unpackage/dist/dev/mp-weixin/pages/event/eventInfo.wxss'), 'utf8')
)

const esc = (s) => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;')

const fmtDateTime = (v) => {
	const d = new Date(v)
	if (isNaN(d)) return '时间待定'
	const p = (n) => String(n).padStart(2, '0')
	return `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日 ${p(d.getHours())}:${p(d.getMinutes())}`
}

const relTime = (v) => {
	const t = new Date(v).getTime()
	if (isNaN(t)) return ''
	const diff = t - Date.now()
	const abs = Math.abs(diff)
	const d = Math.floor(abs / 86400000)
	const h = Math.floor((abs % 86400000) / 3600000)
	const parts = d > 0 ? `${d} 天${h ? ' ' + h + ' 小时' : ''}` : `${h} 小时`
	return diff > 0 ? `${parts}后` : `${parts}前`
}

;(async () => {
	const r = await fetch(`${CDN}/events.json`, { signal: AbortSignal.timeout(30000) })
	const j = await r.json()
	const list = j.list || []
	// 挑一条有图、描述最长的，最接近真实阅读场景
	const ev =
		[...list].sort((a, b) => (b.descriptionZh || '').length - (a.descriptionZh || '').length)[0] || list[0]

	const typeZh =
		{
			eva: '舱外活动',
			flyby: '飞掠',
			docking: '对接',
			undocking: '分离',
			'orbital insertion': '轨道插入',
			'spacecraft landing': '航天器着陆',
			'spacecraft event': '航天器事件'
		}[(ev.type && ev.type.name || '').toLowerCase()] ||
		(ev.type && ev.type.name) ||
		'活动'

	const desc = ev.descriptionZh || ev.description || ''

	const html = `<!doctype html>
<html><head><meta charset="utf-8"><style>
  * { box-sizing: border-box; }
  view, text { display: block; }
  body { margin: 0; width: 375px; background: #0a0e17; }
  .phone { width: 375px; height: 812px; overflow: hidden; position: relative; background: #0a0e17; }
  /* 模拟状态栏 + 右上角胶囊（真机是 nav-bar 组件，这里只占位，避免误判留白） */
  .sb { position: absolute; top: 0; left: 0; right: 0; height: 44px; z-index: 9;
        display: flex; align-items: center; justify-content: space-between;
        padding: 0 14px; color: #fff; font: 600 13px/1 -apple-system, sans-serif; }
  .caps { width: 82px; height: 30px; border-radius: 15px; border: 1px solid rgba(255,255,255,.25);
          background: rgba(0,0,0,.35); }
${wxss}
</style></head>
<body>
<div class="phone">
  <div class="sb"><span>21:56</span><div class="caps"></div></div>

  <view class="hero ${V}">
    <image class="hero-img ${V}" style="background-image:url('${ev.feature_image || ''}');background-size:cover;background-position:center"></image>
    <view class="hero-mask ${V}"></view>
    <view class="hero-body ${V}">
      <view class="hero-tags ${V}">
        <text class="tag ${V}">${esc(typeZh)}</text>
        ${ev.location ? `<text class="tag tag-loc ${V}">${esc(ev.location)}</text>` : ''}
      </view>
      <text class="hero-name ${V}">${esc(ev.name)}</text>
    </view>
  </view>

  <view class="body ${V}">
    <view class="card ${V}">
      <view class="card-title ${V}">时间</view>
      <view class="row ${V}">
        <text class="label ${V}">日期</text>
        <text class="value ${V}">${fmtDateTime(ev.date)}</text>
      </view>
      <view class="row ${V}">
        <text class="label ${V}">距今</text>
        <text class="value value-hl ${V}">${relTime(ev.date)}</text>
      </view>
      ${ev.location ? `<view class="row ${V}"><text class="label ${V}">地点</text><text class="value ${V}">${esc(ev.location)}</text></view>` : ''}
      <view class="row ${V}">
        <text class="label ${V}">类型</text>
        <text class="value ${V}">${esc(typeZh)}</text>
      </view>
    </view>

    <view class="card ${V}">
      <view class="card-title ${V}">简介</view>
      <text class="desc ${V}">${esc(desc)}</text>
    </view>
  </view>
</div>
</body></html>`

	fs.writeFileSync(path.join(ROOT, 'preview-event.html'), html, 'utf8')
	console.log('已生成 preview-event.html')
	console.log('样例活动：', ev.name, '| 类型', typeZh, '| 图片', ev.feature_image ? '有' : '无')
	console.log('描述长度：', desc.length)
})().catch((e) => console.error('ERR', e.message))
