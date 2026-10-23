<script>
import { getConfig } from '@/utils/config.js'

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
	},

	onShow() {
		console.log('App Show')
	},

	onHide() {
		console.log('App Hide')
	},

	methods: {
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
</style>
