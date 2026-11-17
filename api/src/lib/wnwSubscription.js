// What'sNew ウォッチャー（apps/cp/wnw）：新着メールの受け取り登録（登録・確認・解除）。
// 登録者の一覧は Azure Table Storage の 1 つのテーブルに保存する（パーティション "subscriber"、行キー＝メールアドレス）。
// メールの送信は、別の Function App（Midac-Holdings/-taskuri-functions の wnwTimer）が、このテーブルを読んで行う。
//
// 環境変数（Azure Portal の静的 Web アプリ →「環境変数」に登録する。コードには書かない）
//   WNW_TABLE_ENDPOINT  例: https://<ストレージアカウント名>.table.core.windows.net
//   WNW_TABLE_SAS       テーブルの読み書きができる SAS トークン（先頭の ? は付けても付けなくてもよい）
//   WNW_TABLE_NAME      （任意）テーブル名。省略時は WnwWatcher
//   WNW_ALLOWED_DOMAINS （任意）登録できるメールアドレスのドメイン（カンマ区切り）。省略時は midac.jp

export const PARTITION = 'subscriber';
const EMAIL = /^[a-z0-9._%+-]+@[a-z0-9-]+(\.[a-z0-9-]+)+$/;

export function readConfig(env) {
  const endpoint = (env.WNW_TABLE_ENDPOINT ?? '').trim().replace(/\/+$/, '');
  const sas = (env.WNW_TABLE_SAS ?? '').trim().replace(/^\?/, '');
  const table = (env.WNW_TABLE_NAME ?? '').trim() || 'WnwWatcher';
  const domains = (env.WNW_ALLOWED_DOMAINS ?? '').trim() || 'midac.jp';
  return {
    configured: /^https:\/\/[a-z0-9-]+\.table\.core\.windows\.net$/i.test(endpoint) && sas.length > 0 && /^[A-Za-z][A-Za-z0-9]{2,62}$/.test(table),
    endpoint,
    sas,
    table,
    domains: domains.split(',').map((d) => d.trim().toLowerCase()).filter(Boolean),
  };
}

function parsePrincipal(header) {
  try {
    return header ? JSON.parse(Buffer.from(header, 'base64').toString('utf8')) : null;
  } catch {
    return null;
  }
}

/** ログインした人のメールアドレス（小文字）。メールアドレスの形でなければ null */
export function principalEmail(principal) {
  const e = String(principal?.userDetails ?? '').trim().toLowerCase();
  return EMAIL.test(e) ? e : null;
}

export function isAllowedDomain(email, domains) {
  const d = email.split('@')[1];
  return domains.includes(d);
}

function entityUrl(cfg, email) {
  // OData のキーでは ' を '' にする（EMAIL の形なので通常は含まれない）
  const key = encodeURIComponent(email.replace(/'/g, "''"));
  return `${cfg.endpoint}/${cfg.table}(PartitionKey='${PARTITION}',RowKey='${key}')?${cfg.sas}`;
}

const HEADERS = { Accept: 'application/json;odata=nometadata', 'x-ms-version': '2019-02-02' };

async function tableCall(fetchFn, url, init) {
  let res;
  try {
    res = await fetchFn(url, { ...init, headers: { ...HEADERS, ...init.headers } });
  } catch {
    const err = new Error('登録情報の保存先に接続できませんでした');
    err.status = 502;
    throw err;
  }
  return res;
}

async function failed(res, what) {
  const body = await res.text().catch(() => '');
  const err = new Error(`${what}に失敗しました（HTTP ${res.status}）`);
  err.status = 502;
  err.detail = body.slice(0, 300);
  return err;
}

export async function isSubscribed(cfg, email, fetchFn = fetch) {
  const res = await tableCall(fetchFn, entityUrl(cfg, email), { method: 'GET' });
  if (res.status === 404) return false;
  if (!res.ok) throw await failed(res, '登録状況の確認');
  return true;
}

export async function subscribe(cfg, email, now = new Date(), fetchFn = fetch) {
  // PUT ＝ 追加または置き換え（2回押しても1件のまま）
  const res = await tableCall(fetchFn, entityUrl(cfg, email), {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ PartitionKey: PARTITION, RowKey: email, Email: email, SubscribedAt: now.toISOString() }),
  });
  if (!res.ok) throw await failed(res, '登録');
}

export async function unsubscribe(cfg, email, fetchFn = fetch) {
  const res = await tableCall(fetchFn, entityUrl(cfg, email), { method: 'DELETE', headers: { 'If-Match': '*' } });
  if (res.status === 404) return;
  if (!res.ok) throw await failed(res, '解除');
}

/** HTTP 呼び出し1回分の処理（GET＝確認、PUT＝登録、DELETE＝解除）。本人のアドレスだけを扱う */
export async function handleSubscription({ method, principalHeader, env, fetchFn = fetch, now = new Date(), log = () => {} }) {
  const principal = parsePrincipal(principalHeader);
  if (!principal?.userRoles?.includes('authenticated')) return { status: 401, jsonBody: { error: 'ログインが必要です' } };

  const cfg = readConfig(env);
  const email = principalEmail(principal);
  const base = { email };
  if (!cfg.configured) {
    const reason = 'メール通知はまだ準備中です（管理者の設定待ち）';
    return method === 'GET' ? { status: 200, jsonBody: { ...base, available: false, subscribed: false, reason } } : { status: 503, jsonBody: { error: reason } };
  }
  if (!email || !isAllowedDomain(email, cfg.domains)) {
    const reason = '会社のメールアドレスでログインした人だけが登録できます';
    return method === 'GET' ? { status: 200, jsonBody: { ...base, available: false, subscribed: false, reason } } : { status: 403, jsonBody: { error: reason } };
  }

  try {
    if (method === 'GET') {
      return { status: 200, jsonBody: { ...base, available: true, subscribed: await isSubscribed(cfg, email, fetchFn) } };
    }
    if (method === 'PUT') {
      await subscribe(cfg, email, now, fetchFn);
      log('wnw-subscription: subscribed');
      return { status: 200, jsonBody: { ...base, available: true, subscribed: true } };
    }
    if (method === 'DELETE') {
      await unsubscribe(cfg, email, fetchFn);
      log('wnw-subscription: unsubscribed');
      return { status: 200, jsonBody: { ...base, available: true, subscribed: false } };
    }
    return { status: 405, jsonBody: { error: 'この操作はできません' } };
  } catch (e) {
    log(`wnw-subscription: ${e.message} ${e.detail ?? ''}`);
    return { status: e.status ?? 502, jsonBody: { error: e.message } };
  }
}
