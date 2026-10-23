/**
 * 全局分享
 *
 * 在 main.js 里通过 app.mixin() 混入，所以每个页面都自带转发能力。
 * 页面只要在 data 里放 shareTitle / shareImage，或者在页面里重写
 * onShareAppMessage 就能覆盖这里的默认值（组件选项优先于 mixin）。
 *
 * 原先的坑：path 写死空字符串、标题写死英文 "Space Launch"，
 * 结果是从详情页转发出去对方拿不到 id，打开就是「未找到该发射任务」。
 * 现在 path 由「当前页面路由 + onLoad 参数」实时拼出来，不会再丢参数。
 */

/** 取当前页面的路由与 onLoad 参数；拿不到就退回首页 */
function currentPage() {
	const pages = typeof getCurrentPages === 'function' ? getCurrentPages() : []
	const cur = pages.length ? pages[pages.length - 1] : null
	if (!cur) return { route: 'pages/index/index', options: {} }

	// 原生页面实例的参数在不同基础库上位置不同，两处都试一下
	const options = cur.options || (cur.$page && cur.$page.options) || {}
	return { route: cur.route || 'pages/index/index', options }
}

function toQuery(options) {
	return Object.keys(options || {})
		.map((k) => k + '=' + encodeURIComponent(options[k]))
		.join('&')
}

const DEFAULT_TITLE = '太空发射任务'
const DEFAULT_IMAGE = '/static/logo.png'

export default {
	data() {
		return {
			shareTitle: DEFAULT_TITLE,
			shareImage: DEFAULT_IMAGE
		}
	},

	// 转发给朋友 / 群
	onShareAppMessage() {
		const { route, options } = currentPage()
		const qs = toQuery(options)

		return {
			title: this.shareTitle || DEFAULT_TITLE,
			path: '/' + route + (qs ? '?' + qs : ''),
			imageUrl: this.shareImage || DEFAULT_IMAGE
		}
	},

	// 分享到朋友圈。朋友圈只能分享当前页，参数走 query 而不是 path
	onShareTimeline() {
		const { options } = currentPage()

		return {
			title: this.shareTitle || DEFAULT_TITLE,
			query: toQuery(options),
			imageUrl: this.shareImage || DEFAULT_IMAGE
		}
	}
}
