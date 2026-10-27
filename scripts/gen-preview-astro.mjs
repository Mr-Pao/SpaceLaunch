// 宇航员详情页「简介上移」后的预览（只渲染受影响的四个区块，用真实 wxss）
import fs from 'fs'
import path from 'path'

const ROOT = path.resolve(import.meta.dirname, '..')
const CDN = 'https://spacelaunch-1258113633.cos.ap-chengdu.myqcloud.com/space-data'
const V = (() => {
	const css = fs.readFileSync(
		path.join(ROOT, 'unpackage/dist/dev/mp-weixin/pages/astronaut/astronaut.wxss'),
		'utf8'
	)
	const m = css.match(/\.kpi\.(data-v-[a-z0-9]+)/)
	return m ? m[1] : ''
})()

const rpx2px = (css) => css.replace(/(-?[\d.]+)rpx/g, (_, n) => parseFloat(n) / 2 + 'px')
const wxss = rpx2px(
	fs.readFileSync(path.join(ROOT, 'unpackage/dist/dev/mp-weixin/pages/astronaut/astronaut.wxss'), 'utf8')
)

const esc = (s) => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;')

;(async () => {
	const r = await fetch(`${CDN}/astronauts.json`, { signal: AbortSignal.timeout(30000) })
	const j = await r.json()
	const a =
		(j.list || []).find((x) => x.inSpace && (x.bioZh || x.bio)) ||
		(j.list || []).find((x) => x.bioZh || x.bio) ||
		(j.list || [])[0]

	const bio = a.bioZh || a.bio || '（这位暂无简介）'
	const st = (a.stations || [])[0]
	const ex = (a.expeditions || [])[0]

	const html = `<!doctype html>
<html><head><meta charset="utf-8"><style>
  * { box-sizing: border-box; }
  view, text { display: block; }
  body { margin: 0; width: 375px; background: #0a0e17; padding: 12px 16px 24px; }
  .hint { color: #ffd166; font: 600 11px/1.5 -apple-system, sans-serif; margin-bottom: 10px; }
${wxss}
</style></head>
<body>
  <div class="hint">预览：块顺序（战绩 → <b>简介</b> → 所属空间站 → 参与远征队）</div>

  <view class="kpi ${V}">
    <view class="kpi-cell ${V}"><text class="kpi-num ${V}">${a.days || 0}</text><text class="kpi-label ${V}">累计在轨（天）</text></view>
    <view class="kpi-cell ${V}"><text class="kpi-num ${V}">${a.flights || 0}</text><text class="kpi-label ${V}">飞行次数</text></view>
    <view class="kpi-cell ${V}"><text class="kpi-num ${V}">${a.spacewalks || 0}</text><text class="kpi-label ${V}">出舱次数</text></view>
    <view class="kpi-cell ${V}"><text class="kpi-num ${V}">${a.evaHours || 0}h</text><text class="kpi-label ${V}">累计出舱</text></view>
  </view>

  <view class="card ${V}">
    <view class="card-title ${V}">简介</view>
    <text class="desc ${V}">${esc(bio)}</text>
  </view>

  ${
		st
			? `<view class="card ${V}">
    <view class="card-title ${V}">所属空间站</view>
    <view class="link-row ${V}">
      <view class="link-main ${V}"><text class="link-name ${V}">${esc(st.name || '')}</text><text class="link-sub ${V}">${esc(st.status || '')}</text></view>
      <text class="arrow ${V}">›</text>
    </view>
  </view>`
			: ''
	}

  ${
		ex
			? `<view class="card ${V}">
    <view class="card-title ${V}">参与远征队</view>
    <view class="link-row ${V}">
      <view class="link-main ${V}"><text class="link-name ${V}">${esc(ex.name || '')}</text><text class="link-sub ${V}">${esc(ex.start || '')} — ${esc(ex.end || '至今')}</text></view>
      <text class="arrow ${V}">›</text>
    </view>
  </view>`
			: ''
	}
</body></html>`

	fs.writeFileSync(path.join(ROOT, 'preview-astro.html'), html, 'utf8')
	console.log('已生成 preview-astro.html，作用域', V || '(未取到)')
	console.log('样例宇航员：', a.name, '| inSpace', !!a.inSpace, '| 简介长度', bio.length)
	console.log('有空间站', !!st, '| 有远征队', !!ex)
})().catch((e) => console.error('ERR', e.message))
