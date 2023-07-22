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
						<!-- <text class="detail">任务详情</text> -->
					</view>
					<view class="tag">
						<uni-tag :mark="true" :text="'#'+item.orbital_launch_attempt_count_year" type="primary"
							size="small" />
					</view>
					<view class="state">
						<u-tag v-if="item.status.id == 3" text="成功" type="success" shape="circle"></u-tag>
					</view>
				</view>
			</view>
		</view>
		<!-- 返回顶部 -->
		<view class="wrap">
			<u-back-top :scroll-top="scrollTop"></u-back-top>
		</view>
		<!-- 加载更多 -->
		<uni-load-more :status="status"></uni-load-more>
	</view>
</template>

<script>
	const db = uniCloud.database();
	export default {
		data() {
			return {
				LaunchPrevious: '',
				scrollTop: 0,
				status: 'more',
				listNum: 6
			}
		}, 
		onLoad() {
			this.LaunchPrevious = getApp().globalData.LaunchPrevious;
			console.log(this.LaunchPrevious);
		},
		onReachBottom() {
			this.status = 'loading';
			this.listNum = this.listNum+6;
			console.log(this.listNum);
			if (this.listNum >= this.LaunchPrevious.length) this.status = 'nomore';
			else this.status = 'loading';
		},
		methods: {
			//跳转
			goLaunchInfo(e) {
				uni.navigateTo({
					url: '/pages/previous/previousInfo?id=' + e
				})
			},
			//返回顶部
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
			// justify-content: center;
			align-items: center;

			.card {
				width: 85%;
				height: 280rpx;
				display: flex;
				// align-items: center;
				// flex-direction: row;
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
						// white-space: nowrap;
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
