// let API = {
// 		"LaunchesUpcoming": "https://lldev.thespacedevs.com/2.2.0/launch/upcoming",
// 		"LaunchesPast": "https://lldev.thespacedevs.com/2.2.0/launch/previous",
// 		// "LaunchesNext": "https://api.spacexdata.com/v5/launches/next",
// 		"Rockets": "https://api.spacexdata.com/v4/rockets"
// 	},


//引入request-promise用于做网络请求
const rp = require('request-promise');
const db = uniCloud.database()
const dbCmd = db.command

// 云函数入口函数
exports.main = async (event, context) => {

	let LaunchUpcomingUrl = 'https://ll.thespacedevs.com/2.2.0/launch/upcoming/?limit=30';
	let LaunchPreviousUrl = 'https://ll.thespacedevs.com/2.2.0/launch/previous/?limit=30';
	let EventUrl = 'https://ll.thespacedevs.com/2.2.0/event/upcoming/?limit=30';
	
	let LaunchUpcoming = await rp({
		url:LaunchUpcomingUrl,
		rejectUnauthorized: false,
		})
		.then(function(res) {
			data = JSON.parse(res);
			console.log(data.results);
			db.collection("SpaceLaunch").update({
				LaunchUpcoming: data.results
			})
		})
		.catch(function(err) {
			console.log(err);
		});

	let LaunchPrevious = await rp({
		url:LaunchPreviousUrl,
		rejectUnauthorized: false,
		})
		.then(function(res) {
			data = JSON.parse(res);
			console.log(data.results);
			db.collection("SpaceLaunch").update({
				LaunchPrevious: data.results
			})
		})
		.catch(function(err) {
			console.log("失败");
		});

	let Event = await rp({
		url:EventUrl,
		rejectUnauthorized: false,
		})
		.then(function(res) {
			data = JSON.parse(res);
			console.log(data.results);
			db.collection("SpaceLaunch").update({
				Event: data.results
			})
		})
		.catch(function(err) {
			console.log("失败");
		});

}
