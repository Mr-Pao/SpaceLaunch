/**
 * 收藏（本地 Storage）
 *
 * 只存目标 id 数组，不存整个对象 —— 快照天天在变，
 * 存对象会导致收藏页里的数据过期。
 *
 * 分两套命名空间：
 *   sl_favorites_v1     发射任务（历史遗留的 key，不能改名，否则老用户收藏全丢）
 *   sl_fav_rockets_v1   运载火箭型号
 * 两边的 id 长得一样（都是 24 位 hex），混在一个数组里就没法区分类型，
 * 所以必须是两个 key，而不是给数组元素加对象结构。
 *
 * key 带版本号，将来结构变了直接换 v2，旧数据自然作废，不需要写迁移逻辑。
 */

/**
 * 造一个收藏仓库。两套命名空间只有 storage key 不同，
 * 读写逻辑完全一样，抽出来避免两份几乎相同的代码各自漂移。
 */
function createStore(key) {
	function readAll() {
		try {
			const v = uni.getStorageSync(key)
			return Array.isArray(v) ? v : []
		} catch (e) {
			return []
		}
	}

	function writeAll(arr) {
		try {
			uni.setStorageSync(key, arr)
		} catch (e) {
			console.warn('[favorites] 写入失败', e)
		}
	}

	/** 一次取出成 Set，批量判断时避免 N 次读 Storage */
	function snapshot() {
		return new Set(readAll())
	}

	function has(id) {
		if (!id) return false
		return readAll().indexOf(String(id)) !== -1
	}

	/**
	 * 切换收藏状态，返回切换后是否已收藏
	 * 新收藏放数组头部，这样「我的收藏」里最近收的排最前
	 */
	function toggle(id) {
		if (!id) return false
		const key2 = String(id)

		const arr = readAll()
		const i = arr.indexOf(key2)

		if (i === -1) {
			arr.unshift(key2)
			writeAll(arr)
			return true
		}

		arr.splice(i, 1)
		writeAll(arr)
		return false
	}

	return { snapshot, has, toggle }
}

/* ---- 发射任务（沿用原 key，保持向后兼容）---- */
const launchStore = createStore('sl_favorites_v1')

export const snapshot = launchStore.snapshot
export const has = launchStore.has
export const toggle = launchStore.toggle

/* ---- 运载火箭型号 ---- */
const rocketStore = createStore('sl_fav_rockets_v1')

export const rocketSnapshot = rocketStore.snapshot
export const hasRocket = rocketStore.has
export const toggleRocket = rocketStore.toggle
