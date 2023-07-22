<template>
	<view class="about">

		<view v-for="(item,index) in list">
			<view class="card" @click="goRocket(index)">
				<image class='image' mode="widthFix" :src="item.picurl" />
				<view class="title">{{item.ename}}</view>
				<view class="title2">{{item.name}}</view>
				<view class="details">详细信息</view>
			</view>
		</view>


	</view>
</template>

<script>
	export default {
		data() {
			return {
				selected: 0,
				show: false,
				list: [{
						ename: "Falcon 9",
						name: "猎鹰 9 火箭",
						picurl: "http://lsky.yizhipao.xyz/i/2022/12/02/6389fc96982f5.png",
					},
					{
						ename: "Falcon Heavy",
						name: "重型猎鹰火箭",
						picurl: "http://lsky.yizhipao.xyz/i/2022/12/02/6389fc9f2fbb2.png"
					},
					{
						ename: "Starship",
						name: "星际飞船",
						picurl: "http://lsky.yizhipao.xyz/i/2022/12/02/6389fca80cf1b.png"
					},
					{
						ename: "Dragon",
						name: "龙飞船",
						picurl: "http://lsky.yizhipao.xyz/i/2022/12/02/6389fc6103e37.png"
					}
				]
			}
		},
		methods:{
			goRocket(index){
				uni.navigateTo({
					url:"/pages/about/rocket/rocket?id="+index
				})
			}
		}
		
	}
</script>

<style lang="scss" scoped>
	.about {
		display: flex;
		flex-direction: column;
		margin-top: 20rpx;
		width: 100%;
		height: 100%;

		.card {
			height: 300rpx;
			width: 100%;
			background-color: #000000;
			margin: 20px 0px;
			position: relative;
			z-index: 1;

			.title {
				font-size: 50rpx;
				font-weight: bold;
				color: #3978BB;
				position: absolute;
				left: 55%;
				top: 40%;
			}

			.title2 {
				font-size: 35rpx;
				font-weight: bold;
				color: #3978BB;
				position: absolute;
				left: 55%;
				top: 60%;
			}

			.details {
				font-size: 21rpx;
				color: rgb(114, 112, 112);
				float: right;
				position: absolute;
				top: 75%;
				left: 55%;
			}
		}
	}
</style>
