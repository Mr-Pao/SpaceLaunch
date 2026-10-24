/**
 * 自定义 tabBar 的选中态 + 审核态同步
 *
 * 用了 custom tabBar 之后，微信不再自动维护选中项 ——
 * 每个 tab 页面都要在 onShow 里告诉 tabBar「现在是第几个」。
 * 拿不到实例时静默跳过（非 tab 页、或不支持的环境），不能影响页面本身。
 *
 * 审核态也顺手灌进去：custom-tab-bar 是原生组件、不参与编译，
 * 它自己算的那份只是首帧兜底，权威判定始终在 utils/config.js。
 */
import { getConfig } from '@/utils/config.js'

export function syncTabBar(index) {
	try {
		const pages = typeof getCurrentPages === 'function' ? getCurrentPages() : []
		const cur = pages.length ? pages[pages.length - 1] : null
		if (!cur) return

		// 微信原生页面实例上有 getTabBar；uni-app 包装过的页面可能在 $page 上
		const holder = typeof cur.getTabBar === 'function' ? cur : cur.$page
		if (!holder || typeof holder.getTabBar !== 'function') return

		const bar = holder.getTabBar()
		if (!bar || typeof bar.setData !== 'function') return

		bar.setData({ selected: index })

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
	} catch (e) {
		// 忽略：tabBar 同步失败不该影响页面
	}
}
