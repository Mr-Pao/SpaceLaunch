<template>
	<!-- 骨架卡：形状对齐 launch-card（图左文右），加载期占位用。
	     呼吸动画整卡一条 opacity，不再逐块各跑一条，合成开销最低 -->
	<view class="sk-card">
		<view class="sk-thumb"></view>
		<view class="sk-body">
			<view class="sk-line" style="width: 82%"></view>
			<view class="sk-line" style="width: 60%"></view>
			<view class="sk-line" style="width: 44%"></view>
		</view>
	</view>
</template>

<script>
export default {
	name: 'skeleton-card'
}
</script>

<style lang="scss" scoped>
.sk-card {
	display: flex;
	margin-bottom: 20rpx;
	padding: 20rpx;
	background: #141a26;
	border-radius: 20rpx;
	animation: sk-breathe 1.4s ease-in-out infinite;
}

@keyframes sk-breathe {
	0%, 100% { opacity: 0.45; }
	50% { opacity: 1; }
}

.sk-thumb {
	width: 200rpx;
	height: 200rpx;
	flex-shrink: 0;
	border-radius: 14rpx;
	background: #1a2231;
	margin-right: 20rpx;
}

.sk-body {
	flex: 1;
	min-width: 0;
	display: flex;
	flex-direction: column;
	justify-content: space-around;
	padding: 8rpx 0;
}

.sk-line {
	height: 26rpx;
	border-radius: 8rpx;
	background: #1a2231;
}
</style>
