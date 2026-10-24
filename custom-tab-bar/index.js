/**
 * 自定义 tabBar（微信小程序原生实现）
 *
 * 为什么是原生 wxss/wxml 而不是 .vue：
 * uni-app 官方文档明确写着「项目根创建 custom-tab-bar 目录，
 * 注意里边的代码是 wxml,wxss，不是 vue，uni-app 编译器会直接拷贝该目录」。
 * 写成 .vue 不会被编译，页面底部会直接空掉。
 *
 * 悬浮胶囊造型：原生 tabBar 只能整条铺满底部、不能圆角不能浮动，
 * 想要这个样式只能自己画，再到 pages.json 里开 tabBar.custom。
 */
/**
 * 审核态判定 —— **规则必须与 utils/config.js 的 applyVersionRule 完全一致**。
 *
 * 为什么要在这里重复一份：custom-tab-bar 是原生组件，uni-app 编译器直接
 * 拷贝该目录、不做模块打包，所以 import 不到 utils/config.js。
 * 两份一致性由 scripts/verify-config.js 用同一组真值表对拍（改一边必须同步另一边）。
 */
function matchVersionList(raw, version) {
	const cfg = raw || {}
	// 旧格式兼容：配置里没有 reviewVersions 字段时才看布尔 review
	if (!Array.isArray(cfg.reviewVersions)) return Boolean(cfg.review)

	const list = cfg.reviewVersions.map(String)
	if (!list.length) return false
	// 拿不到版本号的正式版只可能是审核环境，判工具态（保审核）
	return version ? list.indexOf(version) !== -1 : true
}

function resolveReview(raw, override) {
	if (override) {
		if (typeof override.review === 'boolean') return override.review
		if (typeof override.version === 'string' && override.version) {
			// 暗门模拟版本号：按正式版口径判定
			return matchVersionList(raw, override.version)
		}
	}

	let envVersion = ''
	let version = ''
	try {
		const info = wx.getAccountInfoSync()
		envVersion = (info && info.miniProgram && info.miniProgram.envVersion) || ''
		version = String((info && info.miniProgram && info.miniProgram.version) || '').trim()
	} catch (e) {}

	// 开发版/体验版永远完整态
	if (envVersion !== 'release') return false

	return matchVersionList(raw, version)
}

Component({
	data: {
		// 审核模式：为 true 时 wxml 里整条 tabBar 不渲染（wx:if="{{!review}}"），
		// 审核员看到的就是一个无 tab 的单页工具；索引不受影响
		review: false,
		// 临时隐藏（抽屉打开时）：页面里的遮罩盖不住这个独立渲染层，
		// 只能让 tabBar 自己消失
		hidden: false,
		// 默认选中「发射」（索引 1），与小程序启动页一致
		selected: 1,
		list: [
			{
				// 「待发射 / 已发射」合并成一页，放第一个：它是打开小程序就落地的页面
				pagePath: 'pages/index/index',
				text: '发射',
				icon: '/static/image/tabbar/huojian1.png',
				iconActive: '/static/image/tabbar/huojian2.png'
			},
			{
				pagePath: 'pages/rockets/rockets',
				text: '火箭',
				icon: '/static/image/tabbar/rocket1.png',
				iconActive: '/static/image/tabbar/rocket2.png'
			},
			{
				pagePath: 'pages/event/event',
				text: '活动',
				icon: '/static/image/tabbar/guanyu1.png',
				iconActive: '/static/image/tabbar/guanyu2.png'
			},
			{
				pagePath: 'pages/stats/stats',
				text: '统计',
				icon: '/static/image/tabbar/tongji1.png',
				iconActive: '/static/image/tabbar/tongji2.png'
			}
		]
	},

	lifetimes: {
		attached() {
			const KEY = 'appReviewConfig'
			const OVERRIDE_KEY = 'appReviewConfigOverride'
			const RESOLVED_KEY = 'appReviewResolved'
			const TTL = 5 * 60 * 1000

			let override = null
			try {
				const ov = wx.getStorageSync(OVERRIDE_KEY)
				if (ov && typeof ov === 'object') override = ov
			} catch (e) {}

			// 1) 页面端算好的结论优先 —— 唯一权威判定在 utils/config.js，
			//    它每次 getConfig 都会把结果写进 appReviewResolved
			try {
				const r = wx.getStorageSync(RESOLVED_KEY)
				if (r && typeof r.review === 'boolean' && r.ts && Date.now() - r.ts < TTL) {
					this.setData({ review: r.review })
					return
				}
			} catch (e) {}

			// 2) 还没有结论（冷启动首帧）：用本地缓存的配置自己算，
			//    避免先渲染完整 tabBar 再闪一下消失
			try {
				const cached = wx.getStorageSync(KEY)
				if (cached && cached.ts && cached.data && Date.now() - cached.ts < TTL) {
					this.setData({ review: resolveReview(cached.data, override) })
					return
				}
			} catch (e) {}

			// 3) 连缓存都没有：先按完整态展示，拉一次远程算出来再修正
			wx.request({
				url: 'https://spacelaunch-1258113633.cos.ap-chengdu.myqcloud.com/space-data/app-config.json',
				timeout: 5000,
				success: (res) => {
					if (res.statusCode !== 200 || !res.data || typeof res.data !== 'object') return
					try {
						wx.setStorageSync(KEY, { ts: Date.now(), data: res.data })
					} catch (e) {}
					this.setData({ review: resolveReview(res.data, override) })
				},
				fail: () => {}
			})
		}
	},

	methods: {
		go(e) {
			const index = Number(e.currentTarget.dataset.index)
			if (index === this.data.selected) return
			if (!this.data.list[index]) return

			this.setData({ selected: index })
			wx.switchTab({ url: '/' + this.data.list[index].pagePath })
		}
	}
})
