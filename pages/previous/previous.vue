<template>
	<view class="index">
		<view class="contant" >
			<view class="card" v-for="(item,index) in LaunchPrevious.slice(0,listNum)" @click="goLaunchInfo(index)">
				<view class="left">
					<image :src="item.image" mode="scaleToFill" />
				</view>
				<view class="right">
					<view class="name">
						<text>{{ item.name }}</text>
					</view>
					<view class="date">
						<uni-dateformat :date="item.net"></uni-dateformat>
					</view>
					<view class="tag">
						<uni-tag :mark="true" :text="'#'+item.orbital_launch_attempt_count_year" type="primary"
							size="small" />
					</view>
					<view class="state">
						<u-tag v-if="item.status?.id == 3" text="成功" type="success" shape="circle"></u-tag>
					</view>
				</view>
			</view>
		</view>
		<view class="wrap">
			<u-back-top :scroll-top="scrollTop"></u-back-top>
		</view>
		<uni-load-more :status="status"></uni-load-more>
	</view>
</template>

<script>
	export default {
		data() {
			return {
				LaunchPrevious: [],
				scrollTop: 0,
				status: 'more',
				listNum: 6
			}
		}, 
		onLoad() {
			this.getData();
		},
		onReachBottom() {
			this.status = 'loading';
			this.listNum = this.listNum+6;
			console.log(this.listNum);
			if (this.listNum >= this.LaunchPrevious.length) this.status = 'nomore';
			else this.status = 'loading';
		},
		methods: {
			async getData() {
				try {
					const result = await uniCloud.callFunction({
						name: 'unionOp',
						data: {
							unionAction: 'queryLaunches',
							page: 1,
							size: 100
						}
					});

					if (result.result && result.result.success) {
						let data = result.result.data.list;
						this.LaunchPrevious = data.filter(item => {
							return new Date(item.net).getTime() < new Date().getTime();
						}).sort((a, b) => new Date(b.net) - new Date(a.net));
						getApp().globalData.LaunchPrevious = this.LaunchPrevious;
						console.log('获取到历史发射数据:', this.LaunchPrevious);
					} else {
						console.error('获取历史发射数据失败:', result.result?.message || '未知错误');
					}
				} catch (error) {
					console.error('调用云函数失败:', error);
				}
			},
			goLaunchInfo(e) {
				uni.navigateTo({
					url: '/pages/previous/previousInfo?id=' + e
				})
			},
			onPageScroll(e) {
				this.scrollTop = e.scrollTop;
			},
		}
	}
</script>

<style lang="scss" scoped>
	.index {
		padding-top: 150rpx;
		padding-bottom: 100rpx;

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
				}
				
				.state {
					position: absolute;
					right: 20rpx;
					bottom: 20rpx;
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

					.time {
						padding-top: 20rpx;
						height: 100rpx;
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

						.detail {
							color: #7e7e7e;
						}
					}
				}
			}
			
			.previous{
				padding-top: 50rpx;
				color: #7e7e7e;
				font-size: 30rpx;
				text-align: right;
			}
		}
	}
</style>