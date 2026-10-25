/**
 * 看图的「相册上下文」
 *
 * 图库一屏几十张、全量图库上千张，横滑要能换到相邻那张，就得让详情页知道
 * 「我是从哪一组图的第几张点进来的」。走 URL 传一串 id 不现实（长度有限），
 * 放内存里最省：调用方点图时 setAlbum 一下，详情页 created 里读。
 *
 * 为什么不落 Storage：页面刷新 / 冷启动后这份上下文就该失效，
 * 留着反而会让详情页横滑到一张几天前的图。
 */

const EMPTY = { list: [], at: 0, from: '' }

let album = EMPTY

/**
 * 记下这次看图属于哪一组
 * @param {Array} list 图库记录（{ id, net, thumb, credit, name, cname }）
 * @param {number} at 从第几张开始
 * @param {string} from 来源标记，调试与埋点用：gallery / gallery-all / today
 */
export function setAlbum(list, at, from) {
	const arr = Array.isArray(list) ? list : []
	const n = arr.length
	const i = Math.max(0, Math.min(Number(at) || 0, n ? n - 1 : 0))
	album = { list: arr, at: i, from: from || '' }
}

/** 取当前上下文。没有就返回空相册，调用方自然退化成「只显示这一张」 */
export function getAlbum() {
	return album
}

/** 退出看图后可以清掉，避免下次分享打开时误用旧上下文 */
export function clearAlbum() {
	album = EMPTY
}
