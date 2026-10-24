import { CDN_BASE } from '@/utils/data.js'

/**
 * 历史归档分片读取
 *
 * 全部历史 7654 条不能塞进一个文件：下载 6MB 再 parse，
 * 低端机会卡好几秒。所以按 100 条一片存在 COS，
 * 前端先给首屏 100 条，往下拉再逐片加载。
 *
 * 索引文件只有一个（history/index.json），列出所有分片及时间范围，
 * 前端靠它判断还有没有下一页。
 */

const TIMEOUT = 20000

// 内存里最多压多少片。全库 68 片约 12MB，低端机全下完会明显卡顿；
// LRU 淘汰后列表触底翻页最多重新下载一次，可接受（2026-10-24 复审 P1-3）
const MAX_CACHED_PAGES = 12

// findById 单次查找最多新下载多少片。冷启动直达分享详情、而 id 根本不在
// 归档（太新在快照里 / 太老还没归档到）时，没有上限会把全库 12MB 拉一遍
const MAX_LOOKUP_PAGES = 12

function getJson(url) {
	return new Promise((resolve, reject) => {
		uni.request({
			url,
			method: 'GET',
			timeout: TIMEOUT,
			success: (res) => {
				if (res.statusCode !== 200) return reject(new Error('HTTP ' + res.statusCode))
				resolve(res.data)
			},
			fail: (err) => reject(new Error((err && err.errMsg) || '请求失败'))
		})
	})
}

// 索引很小，一次会话内缓存住
let indexCache = null

export async function loadIndex() {
	if (indexCache) return indexCache

	const j = await getJson(CDN_BASE + '/history/index.json')
	indexCache = j
	return j
}

export async function loadPage(page) {
	if (!page || !page.file) return []
	const j = await getJson(CDN_BASE + '/history/' + page.file)
	return (j && j.list) || []
}

// 已加载过的分片缓存（会话级）：findById 逐片翻、列表触底接片时都不重复下载。
// Map 保持插入序，重复命中挪到末尾，超限淘汰最旧的一片（LRU）
const pageCache = new Map()

async function loadPageCached(page) {
	if (!page || !page.file) return []
	if (pageCache.has(page.file)) {
		const list = pageCache.get(page.file)
		// 重新插入把它挪到「最近使用」末尾
		pageCache.delete(page.file)
		pageCache.set(page.file, list)
		return list
	}
	const list = await loadPage(page)
	if (page.file) {
		pageCache.set(page.file, list)
		while (pageCache.size > MAX_CACHED_PAGES) {
			const oldest = pageCache.keys().next().value
			pageCache.delete(oldest)
		}
	}
	return list
}

/**
 * 在归档分片里按 id 找一条历史发射
 *
 * previous.json 快照只有最新 100 条，更早的任务都在分片里。
 * 详情页先走 data.js 的 findLaunchById（扫 upcoming/previous 快照），
 * miss 才到这里——正常路径零额外请求，只有真在归档里的老任务才逐片翻。
 * 翻片顺序与列表一致（新 → 旧），用户常看的近期老任务头几片就能命中。
 *
 * @param {number|string} id 发射 id
 * @param {string} [netHint] 调用方已知的大致时间（如统计页失败复盘带的 net）。
 *   索引里每片记了 from/to，能用它直接跳到目标片，省掉逐片翻找；
 *   ISO 串同格式可直接字符串比较。没有就按新 → 旧顺序翻。
 */
export async function findById(id, netHint) {
	if (id === undefined || id === null || id === '') return null
	try {
		const index = await loadIndex()
		const pages = (index && index.pages) || []
		if (!pages.length) return null

		const order = pages.slice()
		if (netHint) {
			const hint = String(netHint)
			const idx = pages.findIndex(
				(p) => p && p.from && p.to && p.from <= hint && hint <= p.to
			)
			// 命中就把它提到最前，剩下的仍按新 → 旧兜底
			if (idx > 0) {
				order.splice(idx, 1)
				order.unshift(pages[idx])
			}
		}

		let downloaded = 0
		for (const p of order) {
			// 上限只限「新下载」：已在缓存里的片扫描是零成本，不占额度
			if (!(p && p.file && pageCache.has(p.file))) {
				if (downloaded >= MAX_LOOKUP_PAGES) return null
				downloaded++
			}
			const list = await loadPageCached(p)
			const hit = list.find((x) => String(x.id) === String(id))
			if (hit) return hit
		}
	} catch (e) {
		// 归档还没跑过 / 索引拉取失败：按没找到处理，详情页有自己的空态
	}
	return null
}

export function clearIndex() {
	indexCache = null
}
