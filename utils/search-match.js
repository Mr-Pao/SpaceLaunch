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
import {
	rocketName,
	launchTitle,
	astroName,
	nationZh,
	agencyLabel,
	padShort,
	placeZh,
	countryOf
} from './format.js'

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

/**
 * 宇航员：中英文本名、国籍、所属机构都算命中面。
 *
 * 实测线上两套数据源**都没有中文名字段**：astronautsSearch（862 条浅字段）
 * 与全量 astronauts（719KB）里 nameZh / nationZh / agencyZh 三个键根本不存在
 * （不是空值，是没有这个字段）。所以中文命中全靠 format.js 的两张本地表：
 *   CHINA_ASTRO_ZH（astroName，「杨利伟」）与 NATION_ZH（nationZh，「中国」）
 * 机构字段两套都叫 agencyName（不是 agency）。
 *
 * nameZh / nationZh / agencyZh / agency 那几个 hit() 是给日后回填中文字段留的，
 * 字段缺失时 hit() 首行 `if (!haystack) return false` 直接吃掉，不会报错。
 */
export function astronautMatch(x, kw) {
	if (!x || !kw) return false
	return (
		hit(x.name, kw) ||
		hit(x.nameZh, kw) ||
		hit(astroName(x), kw) ||
		hit(x.nation, kw) ||
		hit(x.nationZh, kw) ||
		hit(nationZh(x.nation), kw) ||
		hit(x.agency, kw) ||
		hit(x.agencyName, kw) ||
		hit(x.agencyZh, kw) ||
		hit(agencyLabel(x.agencyName || x.agency), kw)
	)
}

/**
 * 发射工位：name / padShort / 场地（含中文化）/ 国家 / 国家码 / 运营机构。
 *
 * pads 里没有任何中文字段，中文命中只能靠 format.js 的三张本地表：
 * PLACE_ZH（placeZh →「文昌航天发射场」）、COUNTRY_ZH（countryOf →「中国」）
 * 与 AGENCY_ZH（agencyLabel →「中国航天科技」）。
 * 注意 placeZh 命中即返回（文昌工位不会再返回「中国」），所以国家要单独用
 * countryOf 判一次，否则搜「中国」只能搜到零星几个机构名带中国二字的工位。
 */
export function padMatch(x, kw) {
	if (!x || !kw) return false
	const loc = x.location && x.location.name
	const agencies = Array.isArray(x.agencies) ? x.agencies : []
	return (
		hit(x.name, kw) ||
		hit(padShort(x.name), kw) ||
		hit(x.nameZh, kw) ||
		hit(loc, kw) ||
		hit(placeZh(loc), kw) ||
		hit(countryOf({ pad: x }), kw) ||
		hit(x.country, kw) ||
		hit(x.countryZh, kw) ||
		hit(x.country_code, kw) ||
		agencies.some(
			(a) =>
				hit(a && a.name, kw) ||
				hit(a && a.agencyZh, kw) ||
				hit(a && agencyLabel(a.name), kw)
		)
	)
}
