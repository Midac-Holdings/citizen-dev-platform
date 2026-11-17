// アプリの申告ファイル（apps/<部署コード>/<アプリ名>/app.manifest.json）の読み込み・検証と、
// ポータル台帳・Azure Static Web Apps 設定の生成。
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

export const CATEGORIES = ['申請・手続き', '施設・設備', 'お知らせ・情報', 'サポート', '管理'];
export const STATUSES = ['available', 'preparing'];
const SLUG = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const RESERVED_DEPTS = new Set(['portal', 'assets', 'api', 'auth']);
// Azure Static Web Apps の組み込みロール。anonymous を許すとログイン不要になるため禁止。
const BUILTIN_ROLES = new Set(['authenticated']);

/** apps/ 配下のアプリを列挙する。先頭が _ のフォルダ（テンプレート）は対象外。 */
export function discoverApps(appsDir) {
  const found = [];
  if (!existsSync(appsDir)) return found;
  const dirs = (p) =>
    readdirSync(p, { withFileTypes: true })
      .filter((d) => d.isDirectory() && !d.name.startsWith('_') && !d.name.startsWith('.'))
      .map((d) => d.name)
      .sort();
  for (const dept of dirs(appsDir)) {
    for (const app of dirs(join(appsDir, dept))) {
      const dir = join(appsDir, dept, app);
      const manifestPath = join(dir, 'app.manifest.json');
      let manifest = null;
      let parseError = null;
      if (existsSync(manifestPath)) {
        try {
          manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
        } catch (e) {
          parseError = e.message;
        }
      }
      found.push({ dept, app, dir, manifest, parseError, hasPackage: existsSync(join(dir, 'package.json')) });
    }
  }
  return found;
}

/** 検証エラーの一覧を返す（空ならOK）。 */
export function validateApp({ dept, app, manifest, parseError, hasPackage }) {
  const where = `apps/${dept}/${app}`;
  const errors = [];
  if (!SLUG.test(dept) || RESERVED_DEPTS.has(dept)) errors.push(`${where}: 部署コードは半角英小文字・数字・ハイフンで指定してください`);
  if (!SLUG.test(app)) errors.push(`${where}: アプリ名（フォルダ名）は半角英小文字・数字・ハイフンで指定してください`);
  if (parseError) return [...errors, `${where}: app.manifest.json を読み込めません（${parseError}）`];
  if (!manifest) return [...errors, `${where}: app.manifest.json がありません`];

  const m = manifest;
  for (const key of ['name', 'description', 'owner']) {
    if (typeof m[key] !== 'string' || m[key].trim() === '') errors.push(`${where}: "${key}" を入力してください`);
  }
  if (!CATEGORIES.includes(m.category)) errors.push(`${where}: "category" は ${CATEGORIES.join('／')} のいずれかにしてください`);
  if (!STATUSES.includes(m.status)) errors.push(`${where}: "status" は available か preparing にしてください`);
  if (!Array.isArray(m.access) || m.access.length === 0) {
    errors.push(`${where}: "access" に利用できるロールを1つ以上指定してください（全社員は "authenticated"）`);
  } else {
    for (const role of m.access) {
      if (typeof role !== 'string' || !(BUILTIN_ROLES.has(role) || SLUG.test(role)) || role === 'anonymous') {
        errors.push(`${where}: "access" のロール "${role}" は使えません`);
      }
    }
  }
  if (m.status === 'available' && !hasPackage) errors.push(`${where}: 公開（available）するアプリには package.json が必要です`);
  if (m.request !== undefined) errors.push(...validateRequest(m.request, where));
  return errors;
}

/** 管理画面で CSV に出せる申請内容（①はアプリ名 name を使う）。古いアプリにはないことがある */
export const REQUEST_FIELDS = {
  summary: '② 機能概要',
  access: '③ 利用可能ユーザー',
  currentWork: '④ 削減される既存業務',
  hoursPerMonth: '⑤ 削減が期待される時間（時間/月）',
};

function validateRequest(r, where) {
  if (typeof r !== 'object' || r === null || Array.isArray(r)) return [`${where}: "request" はオブジェクトで書いてください`];
  const errors = [];
  for (const key of ['summary', 'access', 'currentWork']) {
    if (typeof r[key] !== 'string' || r[key].trim() === '') errors.push(`${where}: "request.${key}"（${REQUEST_FIELDS[key]}）を入力してください`);
  }
  if (typeof r.hoursPerMonth !== 'number' || !(r.hoursPerMonth > 0)) {
    errors.push(`${where}: "request.hoursPerMonth"（${REQUEST_FIELDS.hoursPerMonth}）は 0 より大きい数で入力してください`);
  }
  return errors;
}

/** 管理画面用の台帳（申請内容・利用できるロールを含む）。管理者だけが読める */
export function toAdminApps(apps) {
  return apps.map(({ dept, app, manifest: m }) => ({
    id: `${dept}-${app}`,
    dept,
    path: `/${dept}/${app}/`,
    folder: `apps/${dept}/${app}/`,
    name: m.name,
    description: m.description,
    category: m.category,
    owner: m.owner,
    status: m.status,
    access: [...m.access],
    request: m.request
      ? { summary: m.request.summary, access: m.request.access, currentWork: m.request.currentWork, hoursPerMonth: m.request.hoursPerMonth }
      : null,
  }));
}

export function toPortalApps(apps) {
  return apps.map(({ dept, app, manifest: m }) => ({
    id: `${dept}-${app}`,
    dept,
    path: `/${dept}/${app}/`,
    name: m.name,
    description: m.description,
    category: m.category,
    status: m.status,
    icon: m.icon ?? '🧩',
    color: m.color ?? '#2bb673',
    access: [...m.access],
  }));
}

export const CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data:",
  "font-src 'self' data:",
  "connect-src 'self'",
  "form-action 'self'",
  "base-uri 'self'",
  "object-src 'none'",
  "frame-ancestors 'none'",
].join('; ');

/** ポータルの管理画面（/admin/）を開けるロール */
export const ADMIN_ROLE = 'portal-admin';

/** Azure Static Web Apps の設定。パスごとに利用できるロールを指定する。 */
export function toSwaConfig(apps) {
  const appRoutes = apps.map(({ dept, app, manifest }) => ({
    route: `/${dept}/${app}/*`,
    allowedRoles: [...manifest.access],
  }));
  return {
    routes: [
      // ログインは Microsoft（Entra ID）のみ
      { route: '/.auth/login/github', statusCode: 404 },
      { route: '/.auth/login/twitter', statusCode: 404 },
      ...appRoutes,
      // 管理画面と、その画面のプログラム（申請内容の台帳を含む）：管理者だけ
      { route: '/admin*', allowedRoles: [ADMIN_ROLE] },
      { route: '/assets/admin-*', allowedRoles: [ADMIN_ROLE] },
      // ポータルを含むその他すべて：ログイン必須
      { route: '/*', allowedRoles: ['authenticated'] },
    ],
    responseOverrides: {
      401: { redirect: '/.auth/login/aad?post_login_redirect_uri=.referrer', statusCode: 302 },
      403: { rewrite: '/403.html', statusCode: 403 },
      404: { rewrite: '/404.html', statusCode: 404 },
    },
    globalHeaders: {
      // ⑥ ブラウザでの送信制限：自社サイト以外からの読み込み・自社サイト以外への送信を禁止する
      'Content-Security-Policy': CSP,
      'X-Content-Type-Options': 'nosniff',
      'X-Frame-Options': 'DENY',
      'Referrer-Policy': 'same-origin',
    },
  };
}

/** 読み込み＋検証。エラーがあれば例外にする。 */
export function loadApps(appsDir) {
  const apps = discoverApps(appsDir);
  const errors = apps.flatMap(validateApp);
  if (errors.length) {
    const err = new Error(`app.manifest.json の確認でエラーがあります:\n- ${errors.join('\n- ')}`);
    err.errors = errors;
    throw err;
  }
  return apps;
}
