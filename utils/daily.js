/**
 * 每日一图：确定性「随机」。
 *
 * 需求看着简单 —— 每天换一张、别重样 —— 但用 `list[天序号 % list.length]`
 * 会有两个毛病：
 *
 *   1. gallery 是新→旧倒序的，取模等于「一天往前翻一张」。相邻两天看到的
 *      是同一次发射的相邻照片（往往一个火球一个尾焰），完全没有「今天抽到
 *      一张」的感觉。
 *   2. CI 每轮往列表头部插入新图，所有下标整体后移。今天上午看到的是 A，
 *      数据同步完再进来变成 B —— 「每日一图」变成了「每小时一图」。
 *
 * 换成哈希打分：把「天序号 + 图片自身 key」喂进混合函数，取分数最高的那张。
 *   · 同一天恒定（种子一样、列表一样，结果必然一样）
 *   · 相邻两天毫无关联（种子差 1 会彻底打散）
 *   · 列表增删几乎不影响（只要抽中的那张还在，它还是最高分；
 *     新增图替换掉它的概率只有 1/(n+1)）
 *
 * 这不是真随机 —— 真随机每次进页面都会换，那就没法叫「每日一图」了。
 */

/**
 * FNV-1a 32 位。选它是因为短、无依赖、对长字符串（URL）足够均匀，
 * 不需要密码学强度。
 */
function hash32(str) {
	let h = 0x811c9dc5
	for (let i = 0; i < str.length; i++) {
		h ^= str.charCodeAt(i)
		// Math.imul 保证 32 位乘法不溢出成浮点（小程序各端都支持）
		h = Math.imul(h, 0x01000193)
	}
	return h >>> 0
}

/**
 * splitmix32：把种子彻底打散。
 *
 * 这一步不能省。直接 `hash32(seed + '|' + key)` 试过，问题很隐蔽：
 * 天序号是连续整数，只差 1，而 FNV-1a 对「尾部数字只改一位」的输入
 * 雪崩不够 —— 365 天里只抽到了 200 张中的 73 张，反复集中在那几张。
 * 先过一遍 splitmix 把种子搅乱，每个 bit 都会影响结果，分布才均匀。
 */
function splitmix32(seed) {
	let a = (seed + 0x9e3779b9) | 0
	let t = a ^ (a >>> 16)
	t = Math.imul(t, 0x21f0aaad)
	t = t ^ (t >>> 15)
	t = Math.imul(t, 0x735a2d97)
	return (t ^ (t >>> 15)) >>> 0
}

/**
 * 图片的稳定标识：优先缩略图地址（CI 镜像后就是 COS 上的 hash 名，
 * 天然唯一且不会变），退回发射 id，再退回发射时间。
 */
function keyOf(x) {
	return String(x.thumb || x.id || x.net || '')
}

/**
 * @param {Array} list 图库列表（gallery.json 的 list）
 * @param {number} seed 当天种子，用北京时区的天序号
 * @returns {Object|null} 选中那张；列表为空返回 null
 */
export function pickDaily(list, seed) {
	if (!Array.isArray(list) || !list.length) return null

	const state = splitmix32(seed)
	let best = null
	let bestScore = -1
	// LL2 大量复用配图：200 条发射记录实测只有 73 张不同的图。
	// 不去重的话「不同发射撞同一张照片」会被抽中两次，用户看到的就是连着两天一样
	const seen = {}

	for (let i = 0; i < list.length; i++) {
		const x = list[i]
		if (!x) continue
		const key = keyOf(x)
		if (seen[key]) continue
		seen[key] = 1

		const score = splitmix32(state ^ hash32(key))
		if (score > bestScore) {
			bestScore = score
			best = x
		}
	}
	return best
}
