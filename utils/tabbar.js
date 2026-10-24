/**
 * 自定义 tabBar 的选中态 + 审核态 + 显隐同步
 *
 * 用了 custom tabBar 之后，微信不再自动维护选中项 ——
 * 每个 tab 页面都要在 onShow 里告诉 tabBar「现在是第几个」。
 * 拿不到实例时静默跳过（非 tab 页、或不支持的环境），不能影响页面本身。
 *
 * 审核态也顺手灌进去：custom-tab-bar 是原生组件、不参与编译，
 * 它自己算的那份只是首帧兜底，权威判定始终在 utils/config.js。
 */
import { getConfig } from '@/utils/config.js'

/** 取 tabBar 实例。微信原生页面在 getTabBar 上，uni-app 包装过的可能在 $page 上 */
function getBar() {
	try {
		const pages = typeof getCurrentPages === 'function' ? getCurrentPages() : []
		const cur = pages.length ? pages[pages.length - 1] : null
		if (!cur) return null

		const holder = typeof cur.getTabBar === 'function' ? cur : cur.$page
		if (!holder || typeof holder.getTabBar !== 'function') return null

		const bar = holder.getTabBar()
		return bar && typeof bar.setData === 'function' ? bar : null
	} catch (e) {
		return null
	}
}

export function syncTabBar(index) {
	const bar = getBar()
	if (!bar) return

	try {
		bar.setData({ selected: index })
	} catch (e) {
		return
	}

	// 白名单是按版本号判的，tabBar 自己只认布尔值，必须由这里把结论推进去
	getConfig()
		.then((c) => {
			try {
				bar.setData({ review: Boolean(c && c.review) })
			} catch (e) {
				// tabBar 已销毁
			}
		})
		.catch(() => {})
}

/**
 * 临时隐藏 / 恢复整条 tabBar。
 *
 * 自定义 tabBar 渲染在页面之上的独立层，页面里的遮罩和浮层都盖不住它，
 * 所以抽屉一打开就会和 tabBar 叠在一起 —— 只能让它自己消失。
 *
 * @returns {Boolean} 是否成功。拿不到实例时返回 false，
 *                    调用方要把浮层抬高避开 tabBar（降级路径）。
 */
export function setTabBarHidden(hidden) {
	const bar = getBar()
	if (!bar) return false
	try {
		bar.setData({ hidden: Boolean(hidden) })
		return true
	} catch (e) {
		return false
	}
}
