<script>
	export default {
		onLaunch: function() {
			console.log('App Launch')
		},
		onShow: function() {
			console.log('App Show');

			const updateManager = uni.getUpdateManager() // 小程序版本更新管理器
			updateManager.onCheckForUpdate(res => { // 检测新版本后的回调
				if (res.hasUpdate) { // 如果有新版本提醒并进行强制升级
					uni.showModal({
						content: '新版本已经准备好，是否重启应用？',
						showCancel: false,
						confirmText: '确定',
						success: res => {
							if (res.confirm) {
								updateManager.onUpdateReady(res => { // 新版本下载完成的回调
									updateManager.applyUpdate() // 强制当前小程序应用上新版本并重启
								})

								updateManager.onUpdateFailed(res => { // 新版本下载失败的回调
					    // 新版本下载失败，提示用户删除后通过冷启动重新打开
					    uni.showModal({
										content: '下载失败，请删除当前小程序后重新打开',
										showCancel: false,
										confirmText: '知道了'
									})
								})
							}
						}
					})
				}
			})
		},
		onHide: function() {
			console.log('App Hide')
		},


	}
</script>

<style lang="scss">
	@import "@/uni_modules/uview-ui/index.scss";
	@import "@/components/colorui/icon.css";
	@import "@/components/colorui/main.css";

	/*每个页面公共css */
	page {
		background-color: #000000;
	}


</style>
