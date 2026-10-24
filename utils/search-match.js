/**
 * 全局搜索的匹配逻辑（纯函数，verify-pure 离线断言覆盖）
 *
 * 中文关键词的坑：LL2 的任务名 / 型号名 / 制造商全是英文，
 * 中文命中只能靠两样东西：
 *   1. CI 回填的 *Zh 字段（mission.nameZh / agencies.nameZh）
 *   2. format.js 的 ROCKET_ZH 本地查表（长征 / 朱雀 / 谷神星 / 快舟）
 * 两者都可能缺失，所以每个字段都要「英文、中文各自独立判断」。
 * 不能写成 `name || nameZh` 再去命中 —— name 恒存在，nameZh 永远轮不到，
 * 搜「嫦娥」「星链」会整组落空（2026-10-24 复审的 P1-1）。
 */
import { rocketName, launchTitle } from './format.js'

export function hit(haystack, kw) {
	if (!haystack) return false
	return String(haystack).toLowerCase().indexOf(kw) !== -1
}

/** 发射任务：英文名、中文名、展示标题（含中文型号 + 术语修正）都算命中面 */
export function launchMatch(x, kw) {
	if (!x || !kw) return false
	const m = x.mission || {}
	const rc = x.rocket && x.rocket.configuration
	return (
		hit(x.name, kw) ||
		hit(m.name, kw) ||
		hit(m.nameZh, kw) ||
		hit(rc && rc.name, kw) ||
		hit(rc && rc.full_name, kw) ||
		hit(rocketName(rc), kw) ||
		hit(launchTitle(x), kw) ||
		hit(x.launch_service_provider && x.launch_service_provider.name, kw) ||
		hit(x.pad && x.pad.location && x.pad.location.name, kw)
	)
}

/** 火箭型号：原始字段 + ROCKET_ZH 中文名（rockets 页能搜中文就是靠渲染时补的 zhName） */
export function rocketMatch(x, kw) {
	if (!x || !kw) return false
	return (
		hit(x.name, kw) ||
		hit(x.full_name, kw) ||
		hit(x.variant, kw) ||
		hit(x.manufacturer, kw) ||
		hit(rocketName(x), kw) ||
		(Array.isArray(x.families) && x.families.some((f) => hit(f, kw)))
	)
}
