<template>
	<!--
		「搜索 + 筛选」抽屉：一个入口解决两件事。
		顶部搜索框实时过滤当前列表，下面四组 chips 收窄范围，
		结果条数实时回显 —— 筛得对不对，不用关掉抽屉才知道。

		无内部状态：所有操作立即回传页面，页面算完把结果数传回来。
		原来是「草稿 + 确定」两段式，多点一次，也看不出筛完剩几条。

		常驻 DOM + 类切换而不是 v-if：v-if 刚插入时元素还没拿到初始
		transform，transition 不会触发，抽屉会直接闪现在终点位置。
	-->
	<view class="fs-mask" :class="{ open: visible }" @click="onClose"></view>

	<view class="fs-panel" :class="{ open: visible, lift: lift }">
		<!-- 抓手 -->
		<view class="fs-grab"></view>

		<!-- 搜索 -->
		<view class="fs-search-row">
			<view class="fs-search">
				<view class="fs-mag"><view class="fs-mag-ring"></view></view>
				<input
					class="fs-input"
					:value="keyword"
					type="text"
					placeholder="搜索任务、火箭、机构"
					placeholder-class="fs-ph"
					confirm-type="search"
					@input="onInput"
				/>
				<view class="fs-clear" v-if="keyword" hover-class="fs-clear-hover" @click="onInput({ detail: { value: '' } })">
					<view class="fs-x"></view>
				</view>
			</view>
			<view class="fs-close" hover-class="fs-close-hover" @click="onClose">
				<view class="fs-x fs-x-lg"></view>
			</view>
		</view>

		<!-- 结果条数 + 重置 -->
		<view class="fs-meta">
			<text class="fs-count">{{ count > 0 ? count + ' 条结果' : '没有匹配的任务' }}</text>
			<text class="fs-reset" hover-class="fs-reset-hover" @click="onReset">重置</text>
		</view>

		<scroll-view class="fs-body" scroll-y :show-scrollbar="false">
			<view class="fs-group" v-for="g in groups" :key="g.key">
				<view class="fs-label">{{ g.label }}</view>
				<!-- 每组只占一行，横向滑动：竖着铺开会把面板撑满整屏 -->
				<scroll-view class="fs-chips" scroll-x enable-flex :show-scrollbar="false">
					<view class="fs-chip" :class="{ on: !value[g.key] }" @click="pick(g.key, '')">全部</view>
					<view
						class="fs-chip"
						v-for="o in g.options"
						:key="o.value"
						:class="{ on: value[g.key] === o.value }"
						@click="pick(g.key, o.value)"
					>
						{{ o.label }}<text class="fs-chip-n">{{ o.count }}</text>
					</view>
				</scroll-view>
			</view>

			<view class="fs-empty" v-if="!groups.length">
				<text class="fs-empty-text">{{ keyword ? '换个词试试' : '暂无可筛选的数据' }}</text>
			</view>
		</scroll-view>
	</view>
</template>

<script>
/**
 * @property {Boolean} visible  是否展开
 * @property {Array}   groups   [{ key, label, options: [{ value, label }] }]
 * @property {Object}  value    已生效的筛选（key → 值，空串表示不限）
 * @property {String}  keyword  搜索词
 * @property {Number}  count    当前条件下命中多少条
 * @property {Boolean} lift     tabBar 隐藏失败时抬高面板避开它（降级路径）
 * @event close / pick({key,value}) / search(keyword) / reset
 */
export default {
	name: 'filter-sheet',

	props: {
		visible: { type: Boolean, default: false },
		groups: { type: Array, default: () => [] },
		value: { type: Object, default: () => ({}) },
		keyword: { type: String, default: '' },
		count: { type: Number, default: 0 },
		lift: { type: Boolean, default: false }
	},

	methods: {
		pick(key, val) {
			this.$emit('pick', { key, value: val })
		},

		onInput(e) {
			this.$emit('search', (e && e.detail && e.detail.value) || '')
		},

		onClose() {
			this.$emit('close')
		},

		onReset() {
			// 搜索词也一起清掉：对用户来说「重置」= 回到最初的样子
			this.$emit('search', '')
			this.$emit('reset')
		}
	}
}
</script>

<style lang="scss" scoped>
.fs-mask {
	position: fixed;
	left: 0;
	right: 0;
	top: 0;
	bottom: 0;
	z-index: 200;
	background: rgba(0, 0, 0, 0.6);
	opacity: 0;
	visibility: hidden;
	pointer-events: none;
	transition: opacity 0.22s ease, visibility 0.22s ease;
}

.fs-mask.open {
	opacity: 1;
	visibility: visible;
	pointer-events: auto;
}

/*
 * 面板贴屏幕底：打开时会先把 tabBar 隐藏掉（见 utils/tabbar.js），
 * 所以这里可以放心用 bottom: 0，视觉上是一张接到屏幕底部的卡片。
 * lift 是降级：拿不到 tabBar 实例时抬高 150rpx 避开它。
 */
.fs-panel {
	position: fixed;
	left: 0;
	right: 0;
	bottom: 0;
	z-index: 201;
	display: flex;
	flex-direction: column;
	max-height: 76vh;
	background: #141a26;
	border-radius: 30rpx 30rpx 0 0;
	border-top: 1rpx solid rgba(255, 255, 255, 0.07);
	box-shadow: 0 -12rpx 40rpx rgba(0, 0, 0, 0.45);
	padding-bottom: 20rpx;
	padding-bottom: calc(20rpx + constant(safe-area-inset-bottom));
	padding-bottom: calc(20rpx + env(safe-area-inset-bottom));
	transform: translateY(110%);
	visibility: hidden;
	pointer-events: none;
	transition: transform 0.26s cubic-bezier(0.32, 0.72, 0, 1), visibility 0.26s;
}

.fs-panel.lift {
	bottom: 150rpx;
	border-radius: 28rpx;
	margin: 0 16rpx;
}

.fs-panel.open {
	transform: translateY(0);
	visibility: visible;
	pointer-events: auto;
}

/* 顶部抓手 */
.fs-grab {
	flex-shrink: 0;
	width: 72rpx;
	height: 6rpx;
	margin: 16rpx auto 0;
	border-radius: 4rpx;
	background: rgba(255, 255, 255, 0.14);
}

/* ---- 搜索行 ---- */
.fs-search-row {
	display: flex;
	align-items: center;
	flex-shrink: 0;
	margin: 22rpx 24rpx 0;
}

.fs-search {
	flex: 1;
	display: flex;
	align-items: center;
	min-width: 0;
	height: 78rpx;
	padding: 0 8rpx 0 26rpx;
	background: #0f1622;
	border: 1rpx solid rgba(255, 255, 255, 0.07);
	border-radius: 39rpx;
}

/* 放大镜：圆 + 手柄，纯 CSS（字符图标在部分安卓机缺字） */
.fs-mag {
	position: relative;
	width: 30rpx;
	height: 30rpx;
	margin-right: 16rpx;
	flex-shrink: 0;
}

.fs-mag-ring {
	position: absolute;
	left: 0;
	top: 0;
	width: 22rpx;
	height: 22rpx;
	border: 3rpx solid #5b6b83;
	border-radius: 50%;
	box-sizing: border-box;
}

.fs-mag-ring::after {
	content: '';
	position: absolute;
	right: -9rpx;
	bottom: -8rpx;
	width: 11rpx;
	height: 3rpx;
	background: #5b6b83;
	border-radius: 2rpx;
	transform: rotate(45deg);
}

.fs-input {
	flex: 1;
	min-width: 0;
	height: 78rpx;
	color: #e2e8f0;
	font-size: 27rpx;
}

.fs-ph {
	color: #4a5568;
}

.fs-clear {
	display: flex;
	align-items: center;
	justify-content: center;
	width: 56rpx;
	height: 56rpx;
	flex-shrink: 0;
	border-radius: 50%;
}

.fs-clear-hover {
	background: rgba(255, 255, 255, 0.06);
}

.fs-close {
	display: flex;
	align-items: center;
	justify-content: center;
	width: 64rpx;
	height: 64rpx;
	margin-left: 12rpx;
	flex-shrink: 0;
	border-radius: 50%;
	background: rgba(255, 255, 255, 0.05);
}

.fs-close-hover {
	background: rgba(255, 255, 255, 0.12);
}

/* 两道边框画 × */
.fs-x {
	position: relative;
	width: 20rpx;
	height: 20rpx;
}

.fs-x-lg {
	width: 24rpx;
	height: 24rpx;
}

.fs-x::before,
.fs-x::after {
	content: '';
	position: absolute;
	left: 0;
	top: 50%;
	width: 100%;
	height: 2rpx;
	background: #7c8aa5;
}

.fs-x::before {
	transform: rotate(45deg);
}

.fs-x::after {
	transform: rotate(-45deg);
}

/* ---- 结果数 + 重置 ---- */
.fs-meta {
	display: flex;
	align-items: center;
	justify-content: space-between;
	flex-shrink: 0;
	padding: 18rpx 30rpx 4rpx;
}

.fs-count {
	color: #5b6b83;
	font-size: 23rpx;
}

.fs-reset {
	color: #38bdf8;
	font-size: 24rpx;
	padding: 6rpx 4rpx 6rpx 24rpx;
}

.fs-reset-hover {
	opacity: 0.6;
}

/* ---- 分组 ---- */
.fs-body {
	flex: 1;
	min-height: 0;
	padding: 6rpx 0 0;
}

.fs-group {
	margin-bottom: 18rpx;
}

.fs-label {
	padding: 0 30rpx;
	margin-bottom: 12rpx;
	color: #5b6b83;
	font-size: 23rpx;
	letter-spacing: 1rpx;
}

/* 横向滚动容器必须有确定高度，否则 scroll-view 会塌成 0 */
.fs-chips {
	display: flex;
	flex-direction: row;
	white-space: nowrap;
	height: 68rpx;
	padding: 0 30rpx;
	box-sizing: border-box;
}

.fs-chip {
	display: inline-flex;
	align-items: center;
	flex-shrink: 0;
	height: 60rpx;
	margin-right: 12rpx;
	padding: 0 24rpx;
	background: #0f1622;
	border: 1rpx solid rgba(255, 255, 255, 0.06);
	border-radius: 30rpx;
	color: #8a97a8;
	font-size: 24rpx;
}

.fs-chip.on {
	background: rgba(56, 189, 248, 0.14);
	border-color: rgba(56, 189, 248, 0.45);
	color: #38bdf8;
}

/* 条数：弱一档，别和选项名抢 */
.fs-chip-n {
	margin-left: 8rpx;
	color: #46536b;
	font-size: 20rpx;
}

.fs-chip.on .fs-chip-n {
	color: rgba(56, 189, 248, 0.7);
}

.fs-empty {
	padding: 30rpx 0 40rpx;
	text-align: center;
}

.fs-empty-text {
	color: #3d4a5c;
	font-size: 25rpx;
}
</style>
