import App from './App'
import { createSSRApp } from 'vue'
import uView from '@/uni_modules/uview-ui'
import share from '@/utils/share.js'

export function createApp() {
	const app = createSSRApp(App)

	app.use(uView)

	// 全局分享方法 挂载全局
	app.mixin(share)

	// 让页面的 onLoad 在 onLaunch 之后执行
	app.config.globalProperties.$onLaunched = new Promise(resolve => {
		app.config.globalProperties.$isResolve = resolve
	})

	return {
		app
	}
}
