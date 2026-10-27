<script>
import { getConfig } from '@/utils/config.js'
import spaceData from '@/utils/data.js'

export default {
	data() {
		return {
			// 更新回调只注册一次：onShow 每次切前台都会跑，
			// 在里面注册会一层层叠加，同一件事会弹好几个窗
			updateBound: false
		}
	},

	onLaunch() {
		console.log('App Launch')
		this.checkUpdate()
		// 预热远程展示开关：首页 / tabBar / 详情页各自会取，
		// 这里先发一次请求，各处就能共享这份内存缓存（失败静默，走兜底）
		getConfig().catch(() => {})
		// 预热各 tab 的数据集（错开时间片，不挤占启动）
		this.warmData()

		// 锁死 WebView 窗口底色为深色，消除 iOS 自定义导航栏页面
		// 转场（详情页 navigateBack）时偶尔闪一下的白底/透明底。
		// 仅微信小程序需要；其他端忽略。
		// #ifdef MP-WEIXIN
		try {
			uni.setBackgroundColor({
				backgroundColor: '#0a0e17',
				backgroundColorTop: '#0a0e17',
				backgroundColorBottom: '#0a0e17'
			})
		} catch (e) {}
		// #endif
	},

	onShow() {
		console.log('App Show')
	},

	onHide() {
		console.log('App Hide')
	},

	methods: {
		/**
		 * 预热各 tab 页的数据。
		 *
		 * 每个tab 页是独立 webview，首次切入的卡顿主要来自：
		 * 同一瞬间要「读 Storage 大 JSON + JSON.parse + 首屏渲染」三件事一起干。
		 * 启动后错开几百毫秒把数据读到内存缓存，等用户真的切过去时
		 * 数据层直接命中内存，首切只剩渲染一件事。
		 * 顺序按「用户最可能先逛的页面」排，load 全程 catch 静默。
		 */
		warmData() {
			const warm = [
				['launchers', 600],
				['previous', 1400],
				['events', 2200],
				['agencies', 3000],
				['stats', 3800]
			]
			for (const pair of warm) {
				setTimeout(() => {
					spaceData.load(pair[0]).catch(() => {})
				}, pair[1])
			}
		},

		/**
		 * 小程序版本更新。
		 *
		 * 微信**不允许**代码热更新（动态下发并执行 JS 属于违规），
		 * 能做到的只有：发版 → 用户冷启动时微信后台静默下载 → 提示重启生效。
		 *
		 * 顺序很关键：三个回调必须在拿到 updateManager 后**一次性注册好**。
		 * 原来的写法是「用户点确定之后才注册 onUpdateReady」，
		 * 那时候新版本通常已经下载完了，事件早就触发过，
		 * 于是永远收不到回调、永远重启不了，只剩一个点了没反应的弹窗。
		 */
		checkUpdate() {
			// #ifdef MP-WEIXIN
			if (this.updateBound) return
			this.updateBound = true

			const um = uni.getUpdateManager()

			um.onCheckForUpdate((res) => {
				// hasUpdate 只表示有新版本，还要等下载完才能重启
				if (res.hasUpdate) console.log('[update] 发现新版本，后台下载中')
			})

			um.onUpdateReady(() => {
				uni.showModal({
					title: '更新提示',
					content: '新版本已下载完成，重启后即可使用',
					confirmText: '立即重启',
					cancelText: '稍后',
					success: (res) => {
						if (res.confirm) um.applyUpdate()
					}
				})
			})

			um.onUpdateFailed(() => {
				uni.showModal({
					title: '更新失败',
					content: '新版本下载失败，请删除小程序后重新打开',
					showCancel: false,
					confirmText: '知道了'
				})
			})
			// #endif
		}
	}
}
</script>

<style lang="scss">
	/* 全局样式只留最必要的。
	   原先这里 @import 了 colorui 的 icon.css + main.css（约 152KB），
	   但全项目没有任何一处用到 cu-* 类名，等于每个页面都白白多加载 152KB 样式。 */

	page {
		background-color: #0a0e17;
	}

	/* 统一导航行：标题靠左，与右上角微信胶囊同排，右侧永远留白给胶囊。
	   paddingTop 由各页用 statusBarH 内联给出，这里固定 44px 与胶囊排等高。
	   左右留白由 nav-row 或各页根容器负责（统一 24rpx，与内容区对齐），
	   标题自身不再叠加横向 padding —— 之前标题比内容多缩 32rpx 就是这里来的 */
	.nav-row {
		display: flex;
		align-items: center;
		height: 44px;
		box-sizing: content-box;
	}

	.nav-title {
		color: #ffffff;
		font-size: 46rpx;
		font-weight: 600;
		letter-spacing: 2rpx;
		/* 右侧让位给微信胶囊；左侧对齐交给容器 */
		padding-right: 200rpx;
	}
</style>
