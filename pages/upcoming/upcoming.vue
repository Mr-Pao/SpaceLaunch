<template>
	<view class="index">
		<image src="https://s1.ax1x.com/2022/12/11/zfhOLd.jpg" mode="widthFix"></image>

		<view v-if="showLoading">
			<u-loading-icon text="发射数据加载中" mode="semicircle" textSize="20"></u-loading-icon>
		</view>

		<view class="contant" v-else>
			<view class="countdown">
				<view class="title">
					距离下次发射还有
				</view>
				<view class="time">
					<uni-countdown :font-size="33" background-color="#3978bb" color="#FFFFFF" :day="day[0]"
						:hour="hour[0]" :minute="minute[0]" :second="second[0]" />
				</view> 
				<view class="buttom">
					<button class="btn" open-type="contact" type="default" plain="true" size="mini">观看直播</button>
				</view>
			</view>
			
			
			<view class="card" v-for="(item,index) in LaunchUpcoming.slice(0,listNum)">
				<view class="left">
					<image :src="item.image" mode="scaleToFill" />
				</view>
				<view class="right" @click="goLaunchInfo(index)">
					<view class="name">
						<text>{{ item.name }}</text>
					</view>
					<view class="time">
						<uni-countdown :font-size="20" background-color="#3978bb" color="#FFFFFF" :day="day[index]"
							:hour="hour[index]" :minute="minute[index]" :second="second[index]" />
					</view>
					<view class="date">
						<uni-dateformat :date="item.net"></uni-dateformat>
					</view>
				</view>
				<view class="remind" @click="launchSubscribe(index)">
					订阅提醒
				</view>
			</view>

			<uni-load-more :status="status"></uni-load-more>

		</view>

		<view class="wrap">
			<u-back-top :scroll-top="scrollTop"></u-back-top>
		</view>

	</view>
</template>

<script>
import colorGradient from '../../uni_modules/uview-ui/libs/function/colorGradient';

	export default {
		data() {
			return {
				LaunchUpcoming: [],
				showLoading: true,
				mistime: [],
				timeData: '',
				day: [],
				hour: [],
				minute: [],
				second: [],
				scrollTop: 0,
				status: 'more',
				listNum: 3,
				code: '',
				liveUrl: ''
			}
		},
		onLoad() {
			this.getData();
		},
		onReachBottom() {
			this.status = 'loading';
			this.listNum = this.listNum + 3;
			console.log(this.listNum);
			if (this.listNum >= this.LaunchUpcoming.length) this.status = 'nomore';
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
							size: 50
						}
					});

					if (result.result && result.result.success) {
						let data = result.result.data.list;
						console.log('获取到发射数据:', data);
						
						this.LaunchUpcoming = data.filter(item => item._id !== 'launch_sync_state' && item._id !== 'launch_statistics');
						this.LaunchUpcoming.sort((a, b) => new Date(a.net) - new Date(b.net));
						
						for (var i = 0; i < this.LaunchUpcoming.length; i++) {
							let x = new Date(this.LaunchUpcoming[i].net).getTime() - new Date().getTime();
							if (x > 0) {
								this.LaunchUpcoming = this.LaunchUpcoming.slice(i);
								break;
							}
						}
						
						this.getCountdown();
						this.showLoading = false;	
						
						getApp().globalData.LaunchUpcoming = this.LaunchUpcoming;
						console.log('过滤后的即将发射数据:', this.LaunchUpcoming);
					} else {
						console.error('获取数据失败:', result.result?.message || '未知错误');
						this.showLoading = false;
					}
				} catch (error) {
					console.error('调用云函数失败:', error);
					this.showLoading = false;
				}
			},

			getCountdown() {
				this.day = [];
				this.hour = [];
				this.minute = [];
				this.second = [];
				
				this.LaunchUpcoming.forEach(item => {
					let a = new Date(item.net).getTime() - new Date().getTime();
					let day = parseInt((a / 1000 / 60 / 60 / 24));
					let hour = parseInt((a / 1000 / 60 / 60 % 24));
					let minute = parseInt((a / 1000 / 60 % 60));
					let second = parseInt((a / 1000 % 60));
					this.day.push(day);
					this.hour.push(hour);
					this.minute.push(minute);
					this.second.push(second);
				});
			},

			goLaunchInfo(e) {
				uni.navigateTo({
					url: '/pages/upcoming/upcomingInfo?id=' + e
				})
			},

			onPageScroll(e) {
				this.scrollTop = e.scrollTop;
			},

			launchSubscribe(e) {
				console.log(e);
				const SUBSCRIBE_ID = 'Vc2Mo9xgsr-e9gBD4Nfz-2GxgooDIviQ_yzt7wCc05k';
				uni.requestSubscribeMessage({
					tmplIds: [SUBSCRIBE_ID],
					success(res) {
						if (res[SUBSCRIBE_ID] === 'accept') {
							uni.showToast({
								title: '订阅功能暂未开启',
								icon: 'none'
							});
						}
					}
				});
			}
		}
	}
</script>

<style lang="scss" scoped>
	.index {
		image {
			width: 100%;
		}

		padding-bottom: 100rpx;

		.contant {
			width: 100%;
			display: flex;
			flex-direction: column;
			align-items: center;
			padding-top: 0rpx;

			.countdown {
				position: absolute;
				top: 750rpx;
				display: flex;
				flex-direction: column;
				align-items: center;
				width: 85%;
				height: 350rpx;
				background-color: #171719;
				border-radius: 50rpx;

				.title {
					padding: 40rpx;
					color: #fff;
					font-size: 55rpx;
				}

				.buttom {
					padding-top: 25rpx;
					.btn {
						font-size: 28rpx;
					  color: #7e7e7e;
					}
				} 
			}

			.card {
				width: 85%;
				height: 280rpx;
				display: flex;
				background-color: #171719;
				border-radius: 20rpx;
				margin-top: 35rpx;
				position: relative;

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
						padding-top: 10rpx;
						height: 80rpx;
					}

					.date {
						display: flex;
						justify-content: space-between;
						margin-top: 10rpx;
						overflow: hidden;
						text-overflow: ellipsis;
						white-space: nowrap;
						color: #7e7e7e;
						font-size: 14px;

						.detail {
							color: #7e7e7e;
						}
					}
				}

				.remind {
					position: absolute;
					bottom: 0rpx;
					right: 0rpx;
					background-color: #3978bb;
					color: #fff;
					width: 140rpx;
					height: 40rpx;
					border-radius: 20rpx 0 20rpx 0;
					font-size: 24rpx;
					text-align: center;
					padding-top: 6rpx;
				}
			}
		}
	}
</style>