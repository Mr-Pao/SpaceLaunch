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

	// 视频：LL2 把 webcast 挂在 mission.vid_urls 下，列表模式里绝大多数是空的。
	// 有就展示，没有就空态，不编数据。封面借这次发射的图，不然列表全是灰块。
	const videos = []
	for (const r of sorted) {
		const list = Array.isArray(r.vid) ? r.vid : []
		for (const v of list) {
			if (!v || !v.url) continue
			videos.push({
				url: v.url,
				title: v.title || r.name || '',
				publisher: v.publisher || '',
				cover: r.image || r.imageThumb || '',
				thumb: r.imageThumb || r.image || '',
				net: r.net || ''
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
