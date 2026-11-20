// Static Web Apps の設定（staticwebapp.config.json）のルールを、そのまま App Service で使う。
// tools/manifests.mjs の toSwaConfig が作る形（route・allowedRoles・headers・statusCode）だけを扱う。

/** パスがルートに当てはまるか（末尾の * は「その下すべて」） */
export function matches(pattern, path) {
  if (pattern.endsWith('*')) {
    const prefix = pattern.slice(0, -1);
    if (path.startsWith(prefix)) return true;
    // "/cp/contract/*" は "/cp/contract" にも当てはめる
    return prefix.endsWith('/') && path === prefix.slice(0, -1);
  }
  return path === pattern;
}

/** 最初に当てはまったルール */
export function findRoute(config, path) {
  return (config.routes ?? []).find((r) => matches(r.route, path)) ?? null;
}

/**
 * このリクエストを通してよいか。
 * 戻り値：{ action: 'allow' | 'login' | 'forbidden' | 'status', status?, headers }
 */
export function authorize(config, path, principal) {
  const route = findRoute(config, path);
  const headers = { ...(config.globalHeaders ?? {}), ...(route?.headers ?? {}) };
  if (route?.statusCode) return { action: 'status', status: route.statusCode, headers };
  const allowed = route?.allowedRoles;
  if (!allowed || allowed.length === 0 || allowed.includes('anonymous')) return { action: 'allow', headers };
  if (!principal) return { action: 'login', headers };
  if (allowed.some((r) => principal.userRoles.includes(r))) return { action: 'allow', headers };
  return { action: 'forbidden', headers };
}
