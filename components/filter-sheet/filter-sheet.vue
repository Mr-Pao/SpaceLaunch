<template>
	<!--
		筛选抽屉：从底部升起的分组 chips 面板（重置 / 确定 双按钮）

		为什么用「始终渲染 + 类切换」而不是 v-if：
		v-if 刚插入时元素还没拿到初始 transform，transition 不会触发，
		抽屉会直接闪现在终点位置。常驻 DOM 只切类才能有滑入动画。
		隐藏时 pointer-events: none，不挡下面的点击。

		底部要留出悬浮 tabBar 的高度：自定义 tabBar 是原生组件层，
		普通 view 的 z-index 再高也盖不住它，只能让面板停在它上面。
	-->
	<view class="fs-mask" :class="{ open: visible }" @click="onClose"></view>

	<view class="fs-panel" :class="{ open: visible }">
		<view class="fs-head">
			<text class="fs-title">筛选</text>
			<view class="fs-close" hover-class="fs-close-hover" @click="onClose">
				<view class="fs-x"></view>
			</view>
		</view>

		<scroll-view class="fs-body" scroll-y :show-scrollbar="false">
			<view class="fs-group" v-for="g in groups" :key="g.key">
				<view class="fs-label">{{ g.label }}</view>
				<view class="fs-chips">
					<view
						class="fs-chip"
						:class="{ on: !draft[g.key] }"
						@click="pick(g.key, '')"
					>
						全部
					</view>
					<view
						class="fs-chip"
						v-for="o in g.options"
						:key="o.value"
						:class="{ on: draft[g.key] === o.value }"
						@click="pick(g.key, o.value)"
					>
						{{ o.label }}
					</view>
				</view>
			</view>

			<view class="fs-empty" v-if="!groups.length">
				<text class="fs-empty-text">暂无可筛选的数据</text>
			</view>
		</scroll-view>

		<view class="fs-foot">
			<view class="fs-btn fs-btn-plain" hover-class="fs-btn-plain-hover" @click="onReset">重置</view>
			<view class="fs-btn fs-btn-main" hover-class="fs-btn-main-hover" @click="onApply">确定</view>
		</view>
	</view>
</template>

<script>
/**
 * @property {Boolean} visible  是否展开
 * @property {Array}   groups   [{ key, label, options: [{ value, label }] }]
 * @property {Object}  value    已生效的筛选（key → 值，空串表示不限）
 * @event close / apply(filters) / reset
 */
export default {
	name: 'filter-sheet',

	props: {
		visible: { type: Boolean, default: false },
		groups: { type: Array, default: () => [] },
		value: { type: Object, default: () => ({}) }
	},

	data() {
		return {
			// 面板内草稿：点「确定」才写回页面，中途关掉不影响已生效的筛选
			draft: {}
		}
	},

	watch: {
		visible(v) {
			if (v) this.draft = Object.assign({}, this.value)
		}
	},

	methods: {
		pick(key, val) {
			this.draft = Object.assign({}, this.draft, { [key]: val })
		},

		onClose() {
			this.$emit('close')
		},

		onReset() {
			const empty = {}
			for (const g of this.groups) empty[g.key] = ''
			this.draft = empty
			this.$emit('reset')
		},

		onApply() {
			this.$emit('apply', Object.assign({}, this.draft))
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
	background: rgba(0, 0, 0, 0.55);
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

.fs-panel {
	position: fixed;
	left: 0;
	right: 0;
	/* 悬浮 tabBar（112rpx + 内外边距）压在上面，面板停在它上面露出一点背景 */
	bottom: calc(150rpx + env(safe-area-inset-bottom));
	z-index: 201;
	display: flex;
	flex-direction: column;
	max-height: 68vh;
	background: #141a26;
	border-radius: 28rpx 28rpx 0 0;
	border-top: 1rpx solid rgba(255, 255, 255, 0.07);
	box-shadow: 0 -12rpx 40rpx rgba(0, 0, 0, 0.45);
	transform: translateY(110%);
	visibility: hidden;
	pointer-events: none;
	transition: transform 0.26s cubic-bezier(0.32, 0.72, 0, 1), visibility 0.26s;
}

.fs-panel.open {
	transform: translateY(0);
	visibility: visible;
	pointer-events: auto;
}

.fs-head {
	display: flex;
	align-items: center;
	justify-content: space-between;
	flex-shrink: 0;
	padding: 26rpx 30rpx 18rpx;
}

.fs-title {
	color: #ffffff;
	font-size: 32rpx;
	font-weight: 600;
}

.fs-close {
	display: flex;
	align-items: center;
	justify-content: center;
	width: 56rpx;
	height: 56rpx;
	border-radius: 50%;
	background: rgba(255, 255, 255, 0.05);
}

.fs-close-hover {
	background: rgba(255, 255, 255, 0.12);
}

/* 用两道边框画 ×，避免图标字体缺失 */
.fs-x {
	position: relative;
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
	background: #8a97a8;
}

.fs-x::before {
	transform: rotate(45deg);
}

.fs-x::after {
	transform: rotate(-45deg);
}

.fs-body {
	flex: 1;
	min-height: 0;
	padding: 0 30rpx;
}

.fs-group {
	margin-bottom: 26rpx;
}

.fs-label {
	margin-bottom: 14rpx;
	color: #6b7891;
	font-size: 25rpx;
}

.fs-chips {
	display: flex;
	flex-wrap: wrap;
	/* 小程序基础库低的机型不支持 gap，用 margin 兜底 */
	margin: -8rpx;
}

.fs-chip {
	margin: 8rpx;
	padding: 10rpx 24rpx;
	max-width: 100%;
	background: #0f1622;
	border: 1rpx solid rgba(255, 255, 255, 0.06);
	border-radius: 30rpx;
	color: #8a97a8;
	font-size: 24rpx;
	white-space: nowrap;
	overflow: hidden;
	text-overflow: ellipsis;
	box-sizing: border-box;
}

.fs-chip.on {
	background: rgba(56, 189, 248, 0.14);
	border-color: rgba(56, 189, 248, 0.45);
	color: #38bdf8;
}

.fs-empty {
	padding: 40rpx 0 60rpx;
	text-align: center;
}

.fs-empty-text {
	color: #3d4a5c;
	font-size: 25rpx;
}

.fs-foot {
	display: flex;
	flex-shrink: 0;
	padding: 20rpx 30rpx calc(24rpx + env(safe-area-inset-bottom));
	border-top: 1rpx solid rgba(255, 255, 255, 0.05);
}

.fs-btn {
	flex: 1;
	height: 84rpx;
	line-height: 84rpx;
	text-align: center;
	border-radius: 42rpx;
	font-size: 28rpx;
}

.fs-btn-plain {
	flex: 0 0 200rpx;
	margin-right: 20rpx;
	background: rgba(255, 255, 255, 0.05);
	color: #8a97a8;
}

.fs-btn-plain-hover {
	background: rgba(255, 255, 255, 0.1);
}

.fs-btn-main {
	background: #2f7ff5;
	color: #ffffff;
	font-weight: 600;
}

.fs-btn-main-hover {
	background: #2a6fd6;
}
</style>
