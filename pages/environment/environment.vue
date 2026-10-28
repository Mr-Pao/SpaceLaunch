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
 * 「太空环境」已彻底拆开（3.2.23）：
 *   · 近地天体 → pages/neo（NASA NeoWs，独立入口）
 *   · GCAT 三项（全球在轨 / 卫星百科 / 解体再入）→ pages/space-assets 三 tab
 *
 * 这个页面只作为**老路径的转发壳**保留：3.2.20 ~ 3.2.22 期间分享出去的
 * 「太空环境」卡片和小程序码都指向它，删掉就是一片 404。
 *   - tab=debris / catalog / orbit → 太空资产页对应 tab
 *   - 其余（默认 neo，或历史残留）→ 近地天体独立页
 */
export default {
	onLoad(options) {
		const t = (options && options.tab) || ''
		// 3.2.22~3.2.23 的「太空环境」链接中，debris 现已并入太空资产页；
		// catalog/orbit 是防御性兼容（理论上不会出现，但保险）
		const url = (t === 'debris' || t === 'catalog' || t === 'orbit')
			? '/pages/space-assets/space-assets?tab=' + t
			: '/pages/neo/neo'
		uni.redirectTo({
			url,
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
