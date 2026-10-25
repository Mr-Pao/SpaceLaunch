/**
 * 火箭型号名 → 型号库 id
 *
 * 为什么需要它：图库聚合（gallery.json）每条只存了发射 id 和火箭型号名 cname，
 * 没有 launcher_configuration 的 id。想从一张图跳到「这枚火箭」的详情页，
 * 只能拿名字回型号库里反查。
 *
 * 型号库（launchers.json，532 条）体积不大，且命中过一次就全程走缓存，
 * 所以放在「点开大图之后」才加载，不占首屏带宽。
 *
 * 匹配口径：name 与 full_name 都能命中（gallery 存的是 configuration.name，
 * 而型号库里同一型号的 full_name 可能带 Block / 构型后缀），大小写不敏感。
 * 匹配不上就返回空串，调用方隐藏入口 —— 跳到一个空白详情页比不跳更糟。
 */
import spaceData from './data.js'

// key(小写) → 型号 id；首次使用时构建，之后常驻内存
let index = null

function buildIndex(list) {
	const map = new Map()
	for (const x of list || []) {
		if (!x || x.id == null) continue
		for (const raw of [x.name, x.full_name]) {
			if (!raw) continue
			const k = String(raw).trim().toLowerCase()
			if (k && !map.has(k)) map.set(k, x.id)
		}
	}
	return map
}

/**
 * 按型号名查 id。查不到返回 ''。
 * 数据源加载失败也返回 ''，不抛错 —— 图库大图少一个按钮，不影响看图。
 */
export async function rocketIdOf(name) {
	const key = String(name || '').trim().toLowerCase()
	if (!key) return ''

	if (!index) {
		const d = await spaceData.load('launchers').catch(() => null)
		index = buildIndex(d && d.list)
	}
	return index.get(key) || ''
}
