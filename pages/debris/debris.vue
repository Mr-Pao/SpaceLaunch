<template>
	<view class="page">
		<nav-bar :solid="true" :placeholder="true" title="太空环境" />
		<view class="tip">
			<text class="tip-text">正在打开太空环境…</text>
		</view>
	</view>
</template>

<script>
/**
 * 「解体 / 再入」已并入「太空环境」页面（pages/environment），
 * 见那里的两个 tab。这个页面只作为**老路径的转发壳**保留：
 *
 *   · 3.2.4 上线后分享出去的卡片，path 都写的是 /pages/debris/debris；
 *   · 小程序码、聊天记录里的旧卡片不会跟着改，删掉这个文件就是一片 404。
 *
 * 转发到 tab=debris 而不是默认的近地天体，是因为走这条路径进来的人
 * 想看的一定是解体 / 再入。
 */
export default {
	onLoad() {
		uni.redirectTo({
			url: '/pages/environment/environment?tab=debris',
			// 转发失败（极少见）就留在这个提示页，别白屏
			fail: () => {
				uni.showToast({ title: '打开失败，请返回重试', icon: 'none' })
			}
		})
	}
}
</script>

<style scoped>
.page {
	min-height: 100vh;
	background: #0a0e17;
}
.tip {
	display: flex;
	align-items: center;
	justify-content: center;
	padding: 200rpx 40rpx;
}
.tip-text {
	color: #6b7891;
	font-size: 26rpx;
}
</style>
