import App from './App'
import { createSSRApp } from 'vue'
import share from '@/utils/share.js'
import pageBg from '@/utils/page-bg.js'

// 注意：已移除 uview-ui。
// uview-ui 2.0.34 的 install 用的是 Vue2 API（Vue.filter / Vue.prototype），
// 在 Vue3 下 app.use() 会直接抛 "Vue.filter is not a function"，导致 app.js 崩溃。
// 本项目已注册的 6 个页面没有使用任何 u-* 组件，故整体摘除。
// 若将来确实需要 Vue3 的组件库，请用 uview-plus（uview 的 Vue3 分支），不要再装回 uview-ui。

export function createApp() {
	const app = createSSRApp(App)

	// 全局分享方法 挂载全局
	app.mixin(share)

	// 全局页面底色兜底：setBackgroundColor 只对当前页面生效，
	// 必须每页显示时重设，否则返回时 WebView 底色回白 → 转场白闪
	app.mixin(pageBg)

	// 让页面的 onLoad 在 onLaunch 之后执行
	app.config.globalProperties.$onLaunched = new Promise(resolve => {
		app.config.globalProperties.$isResolve = resolve
	})

	return {
		app
	}
}
