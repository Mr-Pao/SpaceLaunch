// 生成「今日」页的真机预览：真实数据（COS）+ 真实样式（编译后 wxss）
// 只做视觉验证用，产出 preview-today.html 供 headless 截图
import fs from 'fs'
import path from 'path'

const CDN = 'https://spacelaunch-1258113633.cos.ap-chengdu.myqcloud.com/space-data'
const ROOT = path.resolve(import.meta.dirname, '..')

const getJson = async (k) => {
	const r = await fetch(`${CDN}/${k}`, { signal: AbortSignal.timeout(30000) })
	if (!r.ok) throw new Error(k + ' HTTP ' + r.status)
	return r.json()
}

// rpx → px：375px 视口下 1rpx = 0.5px
const rpx2px = (css) => css.replace(/(-?[\d.]+)rpx/g, (_, n) => parseFloat(n) / 2 + 'px')

function loadWxss(rel) {
	const p = path.join(ROOT, 'unpackage/dist/dev/mp-weixin', rel)
	return rpx2px(fs.readFileSync(p, 'utf8'))
}

const S = 'data-v-9c3a1a54' // today 页的作用域类
const A = 'data-v-' // 活动组件作用域，从 wxss 里读出来

function actScope(css) {
	const m = css.match(/\.acts\.(data-v-[a-z0-9]+)/)
	return m ? m[1] : ''
}

const esc = (s) => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;')

const main = async () => {
	const [gallery, astronauts, onthisday, events] = await Promise.all([
		getJson('gallery.json'),
		getJson('astronauts.json'),
		getJson('onthisday.json'),
		getJson('events.json')
	])

	// 样式与作用域类先备好：下面拼活动卡 / 骨架屏都要带作用域类
	const todayCss = loadWxss('pages/today/today.wxss')
	const actCss = loadWxss('components/activity-section/activity-section.wxss')
	const actS = actScope(actCss)

	const fmtShort = (iso) => {
		const d = new Date(iso)
		if (isNaN(d)) return ''
		return `${d.getMonth() + 1}/${d.getDate()}`
	}

	const daily = (gallery.list || [])[0] || {}
	const inSpace = (astronauts.list || []).filter((a) => a.inSpace).slice(0, 8)
	const todayYear = new Date().getFullYear()
	const otd = (onthisday.list || []).slice(0, 3).map((x) => ({
		...x,
		yearsAgo: Math.max(1, todayYear - (x.y || todayYear)),
		title: x.nameZh || x.name || '未命名任务',
		meta: [x.rocket, x.agency].filter(Boolean).join(' · ')
	}))
	const actTotal = (events.list || []).length
	const actsShown = Number(process.env.ACTS_SHOWN || 3)
	const actsLoading = process.env.ACTS_LOADING === '1'
	const acts = (events.list || []).slice(0, actsShown)

	// 活动区两种态：加载中（骨架屏）与数据到位
	const actsListHtml = actsLoading
		? Array.from({ length: actsShown || 3 })
				.map(
					() => `<view class="sk-card ${actS}">
        <view class="sk-cover ${actS}"></view>
        <view class="sk-body ${actS}">
          <view class="sk-line ${actS}" style="width:42%"></view>
          <view class="sk-line ${actS}" style="width:76%"></view>
          <view class="sk-line ${actS}" style="width:58%"></view>
        </view>
      </view>`
				)
				.join('')
		: acts
				.map(
					(it) => `<view class="card ${actS}">
        ${it.feature_image ? `<image class="cover ${actS}" style="background-image:url('${it.feature_image}');background-size:cover;background-position:center"></image>` : `<view class="cover cover-empty ${actS}"><text class="cover-icon ${actS}">🛰️</text></view>`}
        <view class="body ${actS}">
          <view class="top ${actS}">
            <text class="type ${actS}">${esc((it.type && it.type.name) || '活动')}</text>
            <text class="date ${actS}">${fmtShort(it.date)}</text>
          </view>
          <text class="title ${actS}">${esc(it.name)}</text>
          ${it.location ? `<view class="tags ${actS}"><text class="tag ${actS}">${esc(it.location)}</text></view>` : ''}
          <text class="desc ${actS}">${esc((it.descriptionZh || it.description || '').slice(0, 50))}</text>
        </view>
      </view>`
				)
				.join('')

	const html = `<!doctype html>
<html><head><meta charset="utf-8">
<style>
  * { box-sizing: border-box; }
  view, text, scroll-view { display: block; }
  body { margin: 0; width: 375px; background: #0a0e17; }
  scroll-view { overflow-x: auto; }
  scroll-view::-webkit-scrollbar { display: none; }
  .phone { width: 375px; min-height: 812px; background: #0a0e17; position: relative; }
  /* 标记：非真实元素，只是说明这里是什么 */
  .note { position: absolute; left: 0; right: 0; top: 0; background: #ffd166; color: #1a1200;
          font: 600 10px/1.4 -apple-system, sans-serif; padding: 2px 8px; z-index: 99; }
  .placeholder { margin: 16px 16px 0; border: 1px dashed rgba(255,255,255,.25); border-radius: 10px;
                 color: #55617a; font: 12px/1.6 -apple-system, sans-serif; text-align: center; padding: 26px 10px; }
  /* acts-hint 是本轮新加的样式，dist 里的 wxss 还没编译到，这里按同样的
     rpx→px（4/20/22rpx → 2/10/11px）补齐，保证预览与源码一致 */
  .acts-hint { display: flex; align-items: center; justify-content: center;
               margin: 2px 0 10px; color: #4d596b; font-size: 11px; }
${todayCss}
${actCss}
  /* sec-title 本轮源码 30rpx → 34rpx，dist 里的 wxss 还没编译到，
     这里按源码覆盖（34rpx / 2 = 17px），保证预览与 .vue 一致 */
  .sec-title.${S} { font-size: 17px; }
</style></head>
<body>
<div class="phone">
  <div class="note">预览：今日页（真实数据 + 编译样式，跳过星点层与下次发射卡）</div>

  <view class="nav-row ${S}" style="padding-top:44px">
    <text class="nav-date ${S}">10月26日 星期一</text>
  </view>

  <view class="daily ${S}">
    <image class="daily-img ${S}" style="background-image:url('${daily.img || daily.thumb || ''}');background-size:cover;background-position:center"></image>
    <view class="daily-shade ${S}"></view>
    <view class="daily-top ${S}"><text class="daily-tag ${S}">每日一图</text></view>
    <view class="daily-body ${S}">
      <text class="daily-name ${S}">${esc(daily.title || daily.name || '今日发射')}</text>
      <text class="daily-credit ${S}">@${esc(daily.credit || 'SpaceX')}</text>
      <view class="daily-acts ${S}">
        <view class="daily-link ${S}"><text class="daily-link-text ${S}">查看详情</text><text class="daily-link-arrow ${S}">›</text></view>
        <view class="daily-link ${S}"><text class="daily-link-text ${S}">更多图片</text><text class="daily-link-arrow ${S}">›</text></view>
      </view>
    </view>
  </view>

  <view class="inspace ${S}">
    <view class="sec-head ${S}">
      <text class="sec-title ${S}">此刻在天上</text>
      <text class="sec-sub ${S}">${(astronauts.list || []).filter((a) => a.inSpace).length} 人</text>
    </view>
    <view class="inspace-wrap ${S}">
      <scroll-view class="inspace-scroll ${S}">
        <view class="inspace-row ${S}">
          ${inSpace
				.map(
					(a) => `<view class="acard ${S}">
            ${a.img ? `<image class="acard-img ${S}" style="background-image:url('${a.img}');background-size:cover;background-position:center top"></image>` : `<view class="acard-img acard-ph ${S}"><text class="${S}">🧑‍🚀</text></view>`}
            <text class="acard-name ${S}">${esc(a.nameZh || a.name)}</text>
            <text class="acard-days ${S}">在轨 ${a.days || 0} 天</text>
          </view>`
				)
				.join('')}
        </view>
      </scroll-view>
      <view class="inspace-fade ${S}"><view class="inspace-nudge ${S}">›</view></view>
    </view>
  </view>

  <view class="next-wrap ${S}">
    <view class="sec-head ${S}"><text class="sec-title ${S}">下次发射</text></view>
    <view class="placeholder">next-launch 组件卡（本预览省略，不影响下方区块位置）</view>
  </view>

  <view class="otd ${S}">
    <view class="sec-head ${S}">
      <text class="sec-title ${S}">往年今日</text>
      <text class="sec-sub ${S}">${(onthisday.list || []).length} 次发射</text>
    </view>
    ${otd
			.map(
				(x) => `<view class="otd-item ${S}">
      ${x.img ? `<image class="otd-img ${S}" style="background-image:url('${x.img}');background-size:cover;background-position:center"></image>` : `<view class="otd-img otd-ph ${S}"><text class="${S}">🚀</text></view>`}
      <view class="otd-body ${S}">
        <text class="otd-year ${S}">${x.yearsAgo} 年前的今天</text>
        <text class="otd-name ${S}">${esc(x.title || '')}</text>
        <text class="otd-meta ${S}">${esc(x.meta || '')}</text>
      </view>
    </view>`
			)
			.join('')}
    <view class="more-row ${S}"><text class="more-text ${S}">更多 ${Math.max(0, (onthisday.list || []).length - 3)} 条</text><text class="more-arrow ${S}">›</text></view>
  </view>

  <view class="acts ${actS}">
    <view class="acts-head ${actS}">
      <text class="acts-title ${actS}">近期活动</text>
      <view class="acts-more ${actS}"><text class="${actS}">全部</text><text class="acts-arrow ${actS}">›</text></view>
    </view>
    <view class="acts-list ${actS}">
      ${actsListHtml}
    </view>
    ${
			actsLoading
				? ''
				: `<view class="acts-hint ${actS}">
      <text class="${actS}">${actsShown < actTotal ? `上拉加载更多 · 已显示 ${actsShown}/${actTotal}` : `已显示全部 ${actTotal} 条`}</text>
    </view>
    <view class="acts-foot ${actS}"><text class="${actS}">查看全部活动</text><text class="acts-arrow ${actS}">›</text></view>`
		}
  </view>
</div>
</body></html>`

	const out = path.join(ROOT, 'preview-today.html')
	fs.writeFileSync(out, html, 'utf8')
	console.log('已生成', out)
	console.log('作用域类：today=' + S + ' activity=' + actS)
	console.log('数据：图库首图=' + (daily.title || daily.name || '(无)') + ' / 在轨=' + inSpace.length + ' / 往年今日=' + otd.length + ' / 活动=' + acts.length)
	console.log('活动前 3：', acts.map((a) => a.name).join(' | '))
}

main().catch((e) => console.error('ERR', e.message))
