<template>
	<!-- 全屏星空：fixed 铺满、不接事件、压在页面背景之上内容之下（z-index: -1）。
	     星点全部由 box-shadow 画出（约 160 颗，onLoad 一次生成），
	     整层只跑一条 twinkle 动画 —— 多页共用，合成开销恒为一条 -->
	<view class="star-field" aria-hidden="true">
		<view class="stars" :style="{ boxShadow: shadow }"></view>
	</view>
</template>

<script>
/**
 * 星空背景组件（5 个 tab 页共用）。
 *
 * - 位置用 px：box-shadow 里的 rpx 要靠编译期，运行时生成只能用 px；
 * - z-index: -1：画在 page 背景色之上、所有内容之下，页面不用各自处理层级；
 * - 15% 的星是 1px 光晕大星（spread 1px），其余 0.3~1 透明度小星。
 */
export default {
	name: 'star-field',

	data() {
		return {
			shadow: ''
		}
	},

	created() {
		try {
			const info = uni.getSystemInfoSync()
			const dots = []
			for (let i = 0; i < 160; i++) {
				const x = (Math.random() * info.windowWidth).toFixed(1)
				const y = (Math.random() * info.windowHeight).toFixed(1)
				const size = Math.random() > 0.85 ? 1 : 0
				const alpha = (0.3 + Math.random() * 0.7).toFixed(2)
				dots.push(x + 'px ' + y + 'px 0 ' + size + 'px rgba(255,255,255,' + alpha + ')')
			}
			this.shadow = dots.join(', ')
		} catch (e) {
			// 拿不到屏幕尺寸就退化为纯色背景，页面照常可用
		}
	}
}
</script>

<style lang="scss" scoped>
.star-field {
	position: fixed;
	top: 0;
	left: 0;
	width: 100%;
	height: 100%;
	z-index: -1;
	pointer-events: none;
}

/* 星星本体缩成 1px 透明点藏在原点，全部星点由 box-shadow 画出 */
.stars {
	position: absolute;
	top: 0;
	left: 0;
	width: 2rpx;
	height: 2rpx;
	background: transparent;
	border-radius: 50%;
	animation: sf-twinkle 3.2s infinite ease-in-out;
}

@keyframes sf-twinkle {
	0%, 100% { opacity: 0.35; }
	50% { opacity: 1; }
}
</style>
