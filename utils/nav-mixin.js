/**
 * 沉浸式导航的公共小件：状态栏高度。
 *
 * globalStyle.navigationStyle: custom 之后没有原生导航栏，
 * 页面内容会顶进状态栏区域，头部必须自己让出 statusBar 的高度。
 * 各机型 statusBarHeight 不同（刘海屏 44+ / 普通 20-30），必须动态取。
 *
 * 用法：mixins: [navMixin]，模板里 :style="{ paddingTop: statusBarH + 'px' }"
 */
export default {
	data() {
		return {
			statusBarH: 20
		}
	},

	created() {
		try {
			this.statusBarH = uni.getSystemInfoSync().statusBarHeight || 20
		} catch (e) {
			// 取不到就按 20 处理，绝大多数机型在这个值附近
		}
	}
}
