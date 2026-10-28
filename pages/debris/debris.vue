<template>
	<view class="page">
		<nav-bar :solid="true" :placeholder="true" title="解体 / 再入" />
		<view class="tip">
			<text class="tip-text">正在打开…</text>
		</view>
	</view>
</template>

<script>
/**
 * 「解体 / 再入」已并入「太空资产」页（与全球在轨、卫星百科同组，3.2.23）。
 * 内容本身抽成了 components/debris-section，被新页面引用。这里只保留老路径转发。
 */
export default {
	onLoad() {
		uni.redirectTo({
			url: '/pages/space-assets/space-assets?tab=debris',
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
