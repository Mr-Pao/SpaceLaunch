'use strict';
// const cloud = require('wx-server-sdk');
// cloud.init();
const db = uniCloud.database();

//引入request-promise用于做网络请求
const rp = require('request-promise');

let ACCESS_TOKEN = "";

exports.main = async (event, context) => {

	//获取ACCESS_TOKEN
	let appid = "wxb1a4cbb5fa337016";
	let secret = "ceb2987f234d13416e8bf754997859c0";
	let getAcUrl = " https://api.weixin.qq.com/cgi-bin/token?grant_type=client_credential&appid=" + appid +
		"&secret=" + secret;
	let a = await rp(getAcUrl).then(function(res) {
		ACCESS_TOKEN = JSON.parse(res).access_token;
	})
	// console.log(ACCESS_TOKEN);

	// 从云开发数据库中查询等待发送的消息列表
	let messages = await db.collection('SpaceLaunchSubscribe').where({
		isSend: false,
	}).get();
	messages = messages.data;

	//循环消息列表依次处理下发订阅操作
	for (let i = 0; i < messages.length; ++i) {
		let subUrl =
			"https://api.weixin.qq.com/cgi-bin/message/subscribe/send?access_token=" + ACCESS_TOKEN;
		let body = {
			"touser": messages[i].openID,
			"data": messages[i].data,
			"page": "pages/upcoming/upcoming",
			"template_id": 'Vc2Mo9xgsr-e9gBD4Nfz-2GxgooDIviQ_yzt7wCc05k',
		};
		let options = {
			method: 'POST',
			json: true,
			url: subUrl,
			body
		};

		if (new Date(messages[i].time).getTime() - new Date().getTime() < 3600000) {
			// 发送订阅消息
			let b = await rp(options).then(res => {
				console.log(res);
				// 发送成功后将消息的状态改为已发送
				db.collection('SpaceLaunchSubscribe').doc(messages[i]._id).remove();
			})



		}



	}

};
