/**
 * 火箭媒体库：把一个系列（全部构型）的照片与视频摊平成瀑布流能直接用的列表。
 *
 * 照片来源有四种，LL2 那边都带 credit 署名，正好当水印：
 *   1. 构型官方图（launcher_configurations 的 image）—— 一个系列几个构型就几张
 *   2. 历次发射的实拍图（launches 的 image）  —— 图最多的来源
 *   3. 发射工位照片（pad.image）              —— 常是 CCTV / 新华社这类现场实拍
 *   4. 任务信息图（infographic，竖版长图）    —— 只有部分任务有
 *
 * 之所以要在这里去重：LL2 大量复用同一张图（同一个工位、同一发火箭的图
 * 会被十几次发射共用），不去重的话瀑布流会变成同一张图刷屏。
 */

/** 图片库最多展示多少张；再多前端渲染就吃力了，而且没人往下翻那么远 */
const MAX_IMAGES = 60
const MAX_VIDEOS = 40

/**
 * 由 COS 缩略图地址推导原图（full 预设）地址。
 *
 * COS key 规则（scripts/lib/image.js 的 keyOf）：
 *   thumb = space-img/{hash}.{ext}          —— hash 是原始 URL 的 md5 前 16 位
 *   full  = space-img/{hash}_2000.{ext}     —— 同一原始 URL 在 full 预设下的产物
 * 两者共享同一个 hash，所以纯字符串互推，不需要任何 JSON 里多带一个字段。
 *
 * 只匹配「无宽度后缀」的缩略图：信息图（_1080）、工位地图（_750）没有
 * full 预设，不匹配时返回空串，调用方回退用缩略图自己。
 * 还没被 CI 全量补齐扫到的图，COS 上 404 —— previewImage 里会显示失败，
 * 补齐完成后（约一周）自然消失，不值得为此加探测请求。
 */
export function fullImageOf(url) {
	if (!url || typeof url !== 'string') return ''
	const m = url.match(/space-img\/([0-9a-f]{16})\.(\w{3,4})(?:\?.*)?$/)
	if (!m) return ''
	return url.replace(/space-img\/([0-9a-f]{16})\.(\w{3,4})(\?.*)?$/, 'space-img/$1_2000.$2')
}

/**
 * fullImageOf 的反向：把镜像的原图地址换回 480px 缩略版。
 *
 * 用途：首图区一屏要塞好几张，直接拿 2000px 原图当缩略图，
 * 每张几百 KB，弱网下要等很久才出图（首屏就是一片黑）。
 * 缩略版在手机上完全够看，点开再看原图。
 * 非镜像地址原样返回，不去猜 CDN 的缩略图规则。
 */
export function thumbOf(url) {
	if (!url || typeof url !== 'string') return url || ''
	return url.replace(/(space-img\/[0-9a-f]{16})_2000\.(\w{3,4})/, '$1.$2')
}

function uniqByUrl(list) {
	const seen = {}
	const out = []
	for (const x of list) {
		if (!x || !x.url || seen[x.url]) continue
		seen[x.url] = 1
		out.push(x)
	}
	return out
}

function timeOf(rec) {
	const t = rec && rec.net ? new Date(rec.net).getTime() : 0
	return isNaN(t) ? 0 : t
}

/**
 * @param {Array} configs 该系列的所有构型（含 image / imageThumb / imageCredit / name）
 * @param {Array} records 该系列的所有发射记录
 * @returns {{images: Array, videos: Array, truncated: boolean}}
 */
export function collectMedia(configs, records) {
	const cs = Array.isArray(configs) ? configs : []
	const rs = Array.isArray(records) ? records : []

	// 构型图放最前：它是这个型号本身，比某一次发射的现场图更有「封面」意味
	const configImages = cs.map((c) => ({
		url: c.image || c.imageThumb || '',
		thumb: c.imageThumb || c.image || '',
		full: fullImageOf(c.imageThumb || c.image || ''),
		credit: c.imageCredit || '',
		caption: c.name || '',
		kind: 'config',
		net: ''
	}))

	// 发射实拍按时间倒序：最近一次发射的照片最有新鲜感
	const sorted = [...rs].sort((a, b) => timeOf(b) - timeOf(a))

	const launchImages = sorted.map((r) => ({
		url: r.image || r.imageThumb || '',
		thumb: r.imageThumb || r.image || '',
		full: fullImageOf(r.imageThumb || r.image || ''),
		credit: r.imageCredit || '',
		caption: r.imageName || r.name || '',
		kind: 'launch',
		net: r.net || ''
	}))

	// 工位图单独一路：同一工位在几十次发射里重复，去重后通常只剩一两张
	const padImages = sorted.map((r) => {
		const p = r.pad || {}
		return {
			url: p.image || p.imageThumb || '',
			thumb: p.imageThumb || p.image || '',
			full: fullImageOf(p.imageThumb || p.image || ''),
			credit: p.imageCredit || '',
			caption: p.imageName || p.name || '',
			kind: 'pad',
			net: r.net || ''
		}
	})

	// 信息图混在照片里会显得突兀（长图、字多），排在最后
	const infographics = sorted
		.filter((r) => r.infographic)
		.map((r) => ({
			url: r.infographic,
			thumb: r.infographic,
			credit: '',
			caption: r.name || '',
			kind: 'infographic',
			net: r.net || ''
		}))

	const all = uniqByUrl([...configImages, ...launchImages, ...padImages, ...infographics])
	const images = all.slice(0, MAX_IMAGES)

	// 视频：vid 有两个来源。列表端点**不返回** vid_urls（normal 模式连这个键都没有），
	// 所以绝大多数记录这里是空的；真正的视频由 CI 用 detailed 抓进 videos.json，
	// 由媒体页合并到记录上再传进来。有就展示，没有就空态，不编数据。
	const videos = []
	for (const r of sorted) {
		const list = Array.isArray(r.vid) ? r.vid : []
		for (const v of list) {
			if (!v || !v.url) continue
			// 封面优先用视频自己的缩略图（就是这场发射的画面）；
			// 早期版本借发射照片，结果整列全是同款火箭照
			const cover = v.cover || r.imageThumb || r.image || ''
			// 能存到 COS 的视频（直链/YouTube 已下载）直接内联播放；
			// 否则退回「复制链接」。cosUrl/playable 由 videos.js 在 CI 侧填好
			const playable = Boolean(v.cosUrl)
			videos.push({
				url: v.url,
				title: v.title || r.name || '',
				publisher: v.publisher || '',
				kind: v.kind || '',
				// 官方直播（type.id=1）给个角标，否则满屏分不清哪个是火箭公司的
				// 官方源、哪个是网友转播
				official: v.tid === 1 || v.kind === 'Official Webcast',
				cover,
				thumb: cover,
				net: r.net || '',
				mins: v.mins || 0,
				cosUrl: v.cosUrl || '',
				playable,
				sourceType: v.sourceType || ''
			})
		}
	}

	const videosUniq = uniqByUrl(videos)

	return {
		images,
		videos: videosUniq.slice(0, MAX_VIDEOS),
		truncated: all.length > MAX_IMAGES
	}
}
