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
Component({
	data: {
		// 审核模式：为 true 时 wxml 里隐藏「活动」tab（原始索引不变，go() 不受影响）
		review: false,
		// 默认选中「即将发射」（索引 2），与小程序启动页一致
		selected: 2,
		list: [
			{
				pagePath: 'pages/rockets/rockets',
				text: '火箭',
				icon: '/static/image/tabbar/rocket1.png',
				iconActive: '/static/image/tabbar/rocket2.png'
			},
			{
				pagePath: 'pages/previous/previous',
				text: '已发射',
				icon: '/static/image/tabbar/fashe1.png',
				iconActive: '/static/image/tabbar/fashe2.png'
			},
			{
				pagePath: 'pages/index/index',
				text: '即将发射',
				icon: '/static/image/tabbar/huojian1.png',
				iconActive: '/static/image/tabbar/huojian2.png'
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
			// 审核模式开关：与 utils/config.js 读同一份 COS 配置、同一个 storage key。
			// 原生组件不走 uni-app 编译，这里单独用 wx.request 拉一次；
			// 正常用户本地有 5 分钟内缓存时零请求。
			const KEY = 'appReviewConfig'
			const TTL = 5 * 60 * 1000

			try {
				const cached = wx.getStorageSync(KEY)
				if (cached && cached.ts && cached.data && Date.now() - cached.ts < TTL) {
					if (cached.data.review) this.setData({ review: true })
					return
				}
			} catch (e) {
				// 没缓存就走请求
			}

			wx.request({
				url: 'https://spacelaunch-1258113633.cos.ap-chengdu.myqcloud.com/space-data/app-config.json',
				timeout: 5000,
				success: (res) => {
					if (res.statusCode !== 200 || !res.data || typeof res.data !== 'object') return
					// 成功结果与 vue 端共用一份缓存，谁先拉到都行
					try {
						wx.setStorageSync(KEY, { ts: Date.now(), data: res.data })
					} catch (e) {}
					if (res.data.review) this.setData({ review: true })
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
