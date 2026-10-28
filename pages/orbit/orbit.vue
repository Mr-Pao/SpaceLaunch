<template>
	<view class="page">
		<nav-bar :solid="true" :placeholder="true" title="全球在轨资产" />
		<view class="tip">
			<text class="tip-text">正在打开…</text>
		</view>
	</view>
</template>

<script>
/**
 * 「全球在轨」已并入「太空资产」页（与卫星百科、解体/再入同组，3.2.23）。
 * 这里只保留老路径转发，3.2.4 以来分享出去的卡片和小程序码指向它，删了就是 404。
 */
export default {
	onLoad() {
		uni.redirectTo({
			url: '/pages/space-assets/space-assets?tab=orbit',
			fail: () => uni.showToast({ title: '打开失败，请返回重试', icon: 'none' })
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
