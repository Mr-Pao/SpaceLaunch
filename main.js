import App from './App'

import uView from '@/uni_modules/uview-ui'
Vue.use(uView)

import share from '@/utils/share.js'   // 全局分享方法 挂载全局
Vue.mixin(share)                       // 全局注册一个混入，影响注册之后所有创建的每个 Vue 实例


// #ifndef VUE3
import Vue from 'vue'
Vue.config.productionTip = false
App.mpType = 'app'
const app = new Vue({
    ...App
})
app.$mount()
// #endif

// #ifdef VUE3
import { createSSRApp } from 'vue'
export function createApp() {
  const app = createSSRApp(App)
  return {
    app
  }
}
// #endif


// 让页面的 onLoad 在 onLaunch 之后执行
Vue.prototype.$onLaunched = new Promise(resolve => {
    Vue.prototype.$isResolve = resolve
})
