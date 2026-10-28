<template>
	<view class="page">
		<nav-bar :solid="true" :placeholder="true" title="太空环境" />
		<view class="tip">
			<text class="tip-text">正在打开…</text>
		</view>
	</view>
</template>

<script>
/**
 * 「太空环境」已拆回两个独立入口（3.2.22）：
 *   · 近地天体 → pages/neo（NASA NeoWs）
 *   · 解体 / 再入 → pages/debris（GCAT）
 *
 * 这个页面只作为**老路径的转发壳**保留：3.2.20 ~ 3.2.21 期间分享出去的卡片
 * 和小程序码都指向它，删掉就是一片 404。
 */
export default {
	onLoad(options) {
		const t = (options && options.tab) || ''
		uni.redirectTo({
			url: t === 'debris' ? '/pages/debris/debris' : '/pages/neo/neo',
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
