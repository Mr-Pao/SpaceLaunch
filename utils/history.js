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

export function clearIndex() {
	indexCache = null
}
