// 「下次发射」卡预览：抽 next-launch.vue 的真实样式，只验证国旗与机构名是否同一行
import fs from 'fs'
import path from 'path'

const ROOT = path.resolve(import.meta.dirname, '..')
const vue = fs.readFileSync(path.join(ROOT, 'components/next-launch/next-launch.vue'), 'utf8')
let css = vue.match(/<style[^>]*>([\s\S]*?)<\/style>/)[1]
css = css.replace(/@import[^;]+;/g, '')
css = css.replace(/(-?[\d.]+)rpx/g, (_, n) => parseFloat(n) / 2 + 'px')

const d = JSON.parse(fs.readFileSync(path.join(ROOT, 'dist/launches-upcoming.json'), 'utf8'))
const item = (d.list || d)[0]

const flagSrc = (name) => {
	const s = String(name || '')
	if (/spacex|nasa|air force|united launch/i.test(s)) return 'static/flags/us.png'
	if (/china/i.test(s)) return 'static/flags/cn.png'
	if (/russian|roskosmos/i.test(s)) return 'static/flags/ru.png'
	return ''
}

const prov = (item.launch_service_provider && item.launch_service_provider.name) || '未知机构'

const html = `<!doctype html>
<html><head><meta charset="utf-8"><style>
body{margin:0;background:#0a0e17;font-family:-apple-system,'PingFang SC',sans-serif}
.wrap{padding:24px}
.card{background:linear-gradient(150deg,#1b2231,#131a26);border:1rpx solid rgba(255,255,255,.07);border-radius:14px;padding:18px}
${css}
</style></head><body>
<div class="wrap"><div class="card">
  <view class="nl-title">猎鹰 9 号 Block 5 | 星链 15-18</view>
  <view class="nl-meta">
    <img class="nl-flag" src="${flagSrc(item.launch_service_provider && item.launch_service_provider.name)}" style="object-fit:contain">
    <text class="nl-meta-text">${prov} · 范登堡</text>
  </view>
  <view class="nl-cd" style="color:#fff;font-size:34px;font-weight:700">T- 02 天 12 时 59 分</view>
</div></div>
</body></html>`

fs.writeFileSync(path.join(ROOT, 'preview-next.html'), html, 'utf8')
console.log('已生成 preview-next.html')
