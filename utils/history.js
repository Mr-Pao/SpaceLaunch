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

// 已加载过的分片缓存（会话级）：findById 逐片翻的时候不重复下载
const pageCache = {}

async function loadPageCached(page) {
	if (page && page.file && pageCache[page.file]) return pageCache[page.file]
	const list = await loadPage(page)
	if (page && page.file) pageCache[page.file] = list
	return list
}

/**
 * 在归档分片里按 id 找一条历史发射
 *
 * previous.json 快照只有最新 100 条，更早的任务都在分片里。
 * 详情页先走 data.js 的 findLaunchById（扫 upcoming/previous 快照），
 * miss 才到这里——正常路径零额外请求，只有真在归档里的老任务才逐片翻。
 * 翻片顺序与列表一致（新 → 旧），用户常看的近期老任务头几片就能命中。
 */
export async function findById(id) {
	if (id === undefined || id === null || id === '') return null
	try {
		const index = await loadIndex()
		const pages = (index && index.pages) || []
		for (const p of pages) {
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
