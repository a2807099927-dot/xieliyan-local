// 模块说明：功能准入检查（本地版）。
// 公开版没有账号体系，也就没有登录拦截和按云端扣配额这两件事。
// 这里保留 requireLogin / requireFeatureAccess 的函数签名，让原有几十处调用点不必改动，
// 一律直接放行；新增功能时不要再往这里加付费门槛逻辑。

/** 本地版没有登录概念：始终放行 */
export function requireLogin(_actionName = '使用该功能'): boolean {
	return true;
}

/**
 * 本地版没有 VIP / 云端配额：始终放行。
 * @param _feature 原云端计费的功能模块名（sweeper、novel_lab、ai_map、outline_write…），已不再使用
 */
export async function requireFeatureAccess(_feature: string): Promise<boolean> {
	return true;
}
