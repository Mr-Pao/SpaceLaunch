/**
 * 收藏（本地 Storage）
 *
 * 只存 launch 的 id 数组，不存整个对象 —— 快照天天在变，
 * 存对象会导致收藏页里的数据过期。
 *
 * key 带版本号，将来结构变了直接换 v2，旧数据自然作废，不需要写迁移逻辑。
 */

const KEY = 'sl_favorites_v1'

function readAll() {
	try {
		const v = uni.getStorageSync(KEY)
		return Array.isArray(v) ? v : []
	} catch (e) {
		return []
	}
}

function writeAll(arr) {
	try {
		uni.setStorageSync(KEY, arr)
	} catch (e) {
		console.warn('[favorites] 写入失败', e)
	}
}

/** 全部收藏 id，最近收藏在前 */
export function list() {
	return readAll()
}

/** 一次取出成 Set，批量判断时避免 N 次读 Storage */
export function snapshot() {
	return new Set(readAll())
}

export function has(id) {
	if (!id) return false
	return readAll().indexOf(id) !== -1
}

export function count() {
	return readAll().length
}

/**
 * 切换收藏状态，返回切换后是否已收藏
 * 新收藏放数组头部，这样「我的收藏」里最近收的排最前
 */
export function toggle(id) {
	if (!id) return false

	const arr = readAll()
	const i = arr.indexOf(id)

	if (i === -1) {
		arr.unshift(id)
		writeAll(arr)
		return true
	}

	arr.splice(i, 1)
	writeAll(arr)
	return false
}

export function remove(id) {
	const arr = readAll()
	const i = arr.indexOf(id)
	if (i === -1) return
	arr.splice(i, 1)
	writeAll(arr)
}

export function clear() {
	writeAll([])
}
