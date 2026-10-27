// 发射详情页首图右下角工具条的预览（验证 1/N 不再压住状态徽章）
import fs from 'fs'
import path from 'path'

const ROOT = path.resolve(import.meta.dirname, '..')
const CDN = 'https://spacelaunch-1258113633.cos.ap-chengdu.myqcloud.com/space-data'
const V = 'data-v-c197e325'

const rpx2px = (css) => css.replace(/(-?[\d.]+)rpx/g, (_, n) => parseFloat(n) / 2 + 'px')
const wxss = rpx2px(
	fs.readFileSync(
		path.join(ROOT, 'unpackage/dist/dev/mp-weixin/components/launch-detail/launch-detail.wxss'),
		'utf8'
	)
)

const esc = (s) => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;')

;(async () => {
	const r = await fetch(`${CDN}/launches-upcoming.json`, { signal: AbortSignal.timeout(30000) })
	const j = await r.json()
	const item = (j.list || []).find((x) => x.image) || (j.list || [])[0]

	const stage = (idx, total, media) => `
<view class="hero ${V}">
  <image class="hero-img ${V}" style="background-image:url('${item.image}');background-size:cover;background-position:center"></image>
  <view class="hero-mask ${V}"></view>
  ${
		total > 1
			? `<view class="hero-dots ${V}" style="top:100px">
    ${Array.from({ length: total })
			.map((_, i) => `<view class="hero-dot ${V}${i === idx ? ' on' : ''}"></view>`)
			.join('')}
  </view>`
			: ''
	}
  <view class="hero-tools ${V}">
    <view class="hero-media ${V}">
      <view class="hm-icon ${V}"><view class="hm-dot ${V}"></view><view class="hm-dot ${V}"></view><view class="hm-dot ${V}"></view><view class="hm-dot ${V}"></view></view>
      <text class="hm-text ${V}">图片库</text>
      <text class="hm-count ${V}">${media}</text>
    </view>
  </view>
</view>
<view class="body ${V}">
  <view class="head ${V}">
    <text class="name ${V}">${esc(item.name)}</text>
    <view class="badge ${V}" style="background:rgba(56,189,248,.16);color:#38bdf8">${esc((item.status && item.status.nameZh) || '就绪')}</view>
  </view>
</view>`

	const html = `<!doctype html>
<html><head><meta charset="utf-8"><style>
  * { box-sizing: border-box; }
  view, text { display: block; }
  body { margin: 0; background: #0a0e17; display: flex; gap: 16px; padding: 0; align-items: flex-start; }
  .phone { width: 375px; position: relative; background: #0a0e17; }
  .tip { color: #ffd166; font: 600 11px/1.4 -apple-system, sans-serif; padding: 6px 10px; }
${wxss}
</style></head>
<body>
  <div class="phone"><div class="tip">第 1 张：第 1 个圆点高亮</div>${stage(1, 8, 17)}</div>
  <div class="phone"><div class="tip">第 5 张：高亮跟着走</div>${stage(5, 8, 17)}</div>
</body></html>`

	fs.writeFileSync(path.join(ROOT, 'preview-hero.html'), html, 'utf8')
	console.log('已生成 preview-hero.html')
	console.log('样例发射：', item.name)
	console.log('图片：', item.image)
})().catch((e) => console.error('ERR', e.message))
