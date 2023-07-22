'use strict';

const db = uniCloud.database();

//引入request-promise用于做网络请求
const rp = require('request-promise');

let openID = "";

exports.main = async (event, context) => {
	if (new Date(event.launchInfo.net).getTime() - new Date().getTime() > 3600000)
	{
		let appid = "wxb1a4cbb5fa337016";
		let secret = "ceb2987f234d13416e8bf754997859c0";
		let url = "https://api.weixin.qq.com/sns/jscode2session?appid=" +
			appid + "&secret=" + secret + "&js_code=" + event.code +
			"&grant_type=authorization_code";
		
		let a = await rp(url).then(function(res) {
			openID = JSON.parse(res).openid;
		})
		
		// 向集合库中写入数据
		let b = await db.collection('SpaceLaunchSubscribe').add({
			"openID": openID, // 订阅者的openid
			"time": event.launchInfo.net,
			"data": {
				"thing1": {
					"value": event.launchInfo.name.substring(0, 20)
				},
				"time2": {
					"value": new Date(event.launchInfo.net).toLocaleDateString()
				},
				"thing5": {
					"value": new Date(event.launchInfo.net).toLocaleTimeString('zh-cn', { timeZone: 'Asia/Shanghai' })
				}
			},
			"isSend": false, // 消息发送状态设置为 false 
		}).then(res => {
			console.log(res);
		});
		
	}
	


};
