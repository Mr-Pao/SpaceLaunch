<template>
	<view class="index">
		<view class="hint" v-if="freshText">
			<text class="hint-text">已发射 {{ total }} 次 · {{ freshText }}</text>
		</view>

		<view class="contant">
			<view class="card" v-for="item in visible" :key="item.id" @click="goLaunchInfo(item.id)">
				<view class="left">
					<image :src="item.image" mode="aspectFill" />
				</view>
				<view class="right">
					<view class="name">
						<text>{{ item.name }}</text>
					</view>
					<view class="date">
						<uni-dateformat :date="item.net"></uni-dateformat>
					</view>
					<view class="tag" v-if="item.orbital_launch_attempt_count_year">
						<text class="tag-text">#{{ item.orbital_launch_attempt_count_year }}</text>
					</view>
					<view class="state">
						<!-- 用 abbrev 判断，比 status.id 稳：id 是内部编号，可能变 -->
						<text class="state-text" v-if="item.status.abbrev === 'Success'">成功</text>
						<text class="state-text failure" v-else-if="item.status.abbrev === 'Failure'">失败</text>
					</view>
				</view>
			</view>
		</view>

		<view class="loading" v-if="loading && visible.length === 0">
			<text class="loading-text">加载中...</text>
		</view>

		<view class="empty" v-else-if="!loading && visible.length === 0">
			<text class="empty-text">暂无历史发射数据</text>
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
				total: 0,
				freshText: '',
				loading: true,
				status: 'more',
				listNum: 12
			}
		},
		computed: {
			// 分页完全在本地切，不发请求 —— 快照就 50 条，没必要走网络分页
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
			this.listNum += 12
			if (this.listNum >= this.list.length) this.status = 'nomore'
		},
		methods: {
			async getData(force) {
				this.loading = true
				try {
					const d = await spaceData.load('previous', {
						force: !!force,
						onUpdate: (fresh) => this.applyData(fresh)
					})
					this.applyData(d)
				} catch (e) {
					console.warn('获取历史发射失败', e)
				} finally {
					this.loading = false
				}
			},

			applyData(d) {
				// 快照来自 /launches/previous/，本身已按 net 倒序，不需要再排序
				this.list = d.list || []
				this.total = d.count || this.list.length
				this.freshText = spaceData.freshnessText(d.generatedAt)
				if (this.listNum >= this.list.length) this.status = 'nomore'
			},

			goLaunchInfo(id) {
				if (!id) return
				uni.navigateTo({
					// 传 id 不传下标：列表刷新后下标会错位
					url: '/pages/previous/previousInfo?id=' + id
				})
			}
		}
	}
</script>

<style lang="scss" scoped>
	.index {
		padding-bottom: 60rpx;
		min-height: 100vh;

		.hint {
			padding: 20rpx 40rpx 0;
			text-align: right;
		}

		.hint-text {
			color: #7e7e7e;
			font-size: 24rpx;
		}

		.contant {
			width: 100%;
			display: flex;
			flex-direction: column;
			align-items: center;

			.card {
				width: 85%;
				height: 280rpx;
				display: flex;
				background-color: #171719;
				border-radius: 20rpx;
				margin-top: 35rpx;
				position: relative;

				.tag {
					position: absolute;
					left: 0rpx;
					top: -5rpx;
					background: #3978bb;
					border-radius: 10rpx 0 10rpx 0;
					padding: 4rpx 14rpx;

					.tag-text {
						color: #fff;
						font-size: 22rpx;
					}
				}

				.state {
					position: absolute;
					right: 20rpx;
					bottom: 20rpx;

					.state-text {
						color: #34c759;
						font-size: 24rpx;
					}

					.state-text.failure {
						color: #ff3b30;
					}
				}

				.left {
					image {
						border-radius: 20rpx 0rpx 0rpx 20rpx;
						width: 240rpx;
						height: 280rpx;
					}
				}

				.right {
					display: flex;
					margin-left: 30rpx;
					flex-direction: column;
					align-items: center;
					width: 55%;

					.name {
						margin-top: 20rpx;
						overflow: hidden;
						text-overflow: ellipsis;
						color: #ffffff;
						font-size: 18px;
						height: 80rpx;
					}

					.date {
						display: flex;
						justify-content: space-between;
						margin-top: 30rpx;
						overflow: hidden;
						text-overflow: ellipsis;
						white-space: nowrap;
						color: #7e7e7e;
						font-size: 18px;
					}
				}
			}
		}

		.loading,
		.empty {
			padding: 150rpx 0;
			text-align: center;
		}

		.loading-text,
		.empty-text {
			color: #7e7e7e;
			font-size: 30rpx;
		}
	}
</style>
