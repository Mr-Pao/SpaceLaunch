<template>
	<view class="event">
		<view class="loading" v-if="showLoading && list.length === 0">
			<text class="loading-text">事件数据加载中...</text>
		</view>

		<view class="contant" v-else>
			<view class="hint" v-if="freshText">
				<text class="hint-text">{{ freshText }}</text>
			</view>

			<view class="cell-group" v-for="item in visible" :key="item.id">
				<view class="cell-picture" v-if="item.feature_image">
					<image :src="item.feature_image" mode="aspectFill"></image>
				</view>
				<view class="cell-type">
					<text>{{ item.type.name || '未知类型' }}</text>
					<!-- 自定义组件不能嵌在 <text> 里，否则微信端不渲染 -->
					<view class="cell-date">
						<uni-dateformat :date="item.date"></uni-dateformat>
					</view>
				</view>

				<view class="cell-title">{{ item.name }}</view>
				<view class="cell-tag">
					<uni-tag v-if="item.location" :circle="true" :text="item.location" type="primary" size="mini" />
					<uni-tag v-if="item.launches.length > 0" :circle="true" :text="item.launches[0].name" type="warning" size="mini" />
				</view>

				<view class="cell-desc" v-if="item.descriptionZh || item.description">
					{{ item.descriptionZh || item.description }}
				</view>
			</view>

			<view class="empty" v-if="!showLoading && visible.length === 0">
				<text class="empty-text">暂无活动数据</text>
			</view>
		</view>

		<uni-load-more v-if="visible.length > 0" :status="status"></uni-load-more>
	</view>
</template>

<script>
	import spaceData from '@/utils/data.js'

	export default {
		data() {
			return {
				list: [],
				freshText: '',
				showLoading: true,
				status: 'more',
				listNum: 5,
			};
		},
		computed: {
			visible() {
				return this.list.slice(0, this.listNum)
			}
		},
		async onLoad() {
			await this.getData()
		},
		onPullDownRefresh() {
			this.getData(true).then(() => uni.stopPullDownRefresh())
		},
		onReachBottom() {
			if (this.listNum >= this.list.length) {
				this.status = 'nomore'
				return
			}
			this.status = 'loading'
			this.listNum += 5
			if (this.listNum >= this.list.length) this.status = 'nomore'
		},
		methods: {
			async getData(force) {
				this.showLoading = true
				try {
					const d = await spaceData.load('events', {
						force: !!force,
						onUpdate: (fresh) => this.applyData(fresh)
					})
					this.applyData(d)
				} catch (e) {
					console.warn('获取事件失败', e)
				} finally {
					this.showLoading = false
				}
			},

			applyData(d) {
				this.list = d.list || []
				this.freshText = spaceData.freshnessText(d.generatedAt)
				if (this.listNum >= this.list.length) this.status = 'nomore'
			}
		}
	}
</script>

<style lang="scss" scoped>
	.event {
		min-height: 100vh;
	}

	.loading {
		padding: 200rpx 0;
		text-align: center;
	}

	.loading-text {
		color: #7e7e7e;
		font-size: 30rpx;
	}

	.contant {
		width: 100%;
		display: flex;
		flex-direction: column;
		align-items: center;
		padding-top: 20rpx;
		padding-bottom: 60rpx;

		.hint {
			width: 550rpx;
			text-align: right;
		}

		.hint-text {
			color: #7e7e7e;
			font-size: 24rpx;
		}

		.cell-group {
			display: flex;
			flex-direction: column;
			width: 550rpx;
			margin-top: 50rpx;

			.cell-type {
				display: flex;
				justify-content: space-between;
				padding-top: 24rpx;
				color: #3978bb;
				font-size: 25rpx;
			}

			.cell-date {
				color: #7e7e7e;
				font-size: 22rpx;
			}

			.cell-picture {
				image {
					box-shadow: 15rpx 20rpx 25px rgba(0, 0, 0, 0.5);
					width: 550rpx;
					height: 550rpx;
					border-radius: 30rpx;
				}
			}

			.cell-tag {
				padding-top: 20rpx;
			}

			.cell-title {
				padding-top: 30rpx;
				color: #fff;
				font-size: 45rpx;
				font-weight: 550;
			}

			.cell-desc {
				padding-top: 20rpx;
				font-size: 30rpx;
				color: #7e7e7e;
				line-height: 1.6;
			}
		}

		.empty {
			padding: 150rpx 0;
		}

		.empty-text {
			color: #7e7e7e;
			font-size: 30rpx;
		}
	}
</style>
