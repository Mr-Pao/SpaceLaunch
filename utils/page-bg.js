/**
 * 全局页面底色兜底
 *
 * 现象：真机上从任意详情页 navigateBack，转场那一帧整屏白一下。
 *
 * 根因：iOS 的转场是原生容器动画，露出的是 **WebView 底色**。
 *   - pages.json / globalStyle 的 backgroundColor 只是页面配置，管不到 WebView 底层；
 *   - `page { background-color }` 是页面内容的根节点，WebView 还没画内容时它也不存在；
 *   - 真正设 WebView 底色的是 uni.setBackgroundColor —— 但它**只对调用时那一个页面生效**。
 * 原先只写在 App.vue 的 onLaunch 里，等于只给启动页上了色，之后每换一个页面
 * 底色就回到默认白，返回时自然白闪。
 *
 * 治法：混入全局，每个页面每次显示都重设一次。onShow 在页面显示时同步触发，
 * 早于转场动画开始，来得及。
 *
 * 注意：只在 MP-WEIXIN 有意义，其它端（H5/App）该 API 不存在或语义不同，直接跳过。
 */
const BG = '#0a0e17'

function paint() {
	try {
		uni.setBackgroundColor({
			backgroundColor: BG,
			backgroundColorTop: BG,
			backgroundColorBottom: BG,
			fail() {}
		})
	} catch (e) {
		// 基础库过老没有这个 API，忽略：页面自身背景色仍在，只是没有这层兜底
	}
}

export default {
	// 只挂 onShow：它在 onLoad 之后、页面首次显示时就会触发，足够覆盖首次进入；
	// 不挂 onLoad 是刻意的 —— 页面自己的 onLoad 承担数据加载，mixin 再去掺一脚
	// 有覆盖风险，收益却只有一帧，不值当
	onShow() {
		paint()
	}
}
