// App Service の認証（Easy Auth）が付けるログイン情報を、Static Web Apps と同じ形に変換する。
// 基盤の API（api/src/lib）は Static Web Apps の形（x-ms-client-principal）を前提にしているため。
//
// Easy Auth は、利用者が送ってきた X-MS-CLIENT-PRINCIPAL ヘッダーを消して、本物だけを付け直す。
// ただし Easy Auth が無効だと偽装できるので、有効なとき（trust=true）だけ信用する。

const ROLE_CLAIMS = new Set(['roles', 'http://schemas.microsoft.com/ws/2008/06/identity/claims/role']);
const OID_CLAIMS = ['http://schemas.microsoft.com/identity/claims/objectidentifier', 'oid'];
const NAME_CLAIMS = ['preferred_username', 'http://schemas.xmlsoap.org/ws/2005/05/identity/claims/upn', 'upn', 'name'];
const ROLE_NAME = /^[a-z0-9_]+$/;

const header = (headers, name) => {
  const v = headers[name.toLowerCase()];
  return Array.isArray(v) ? v[0] : v;
};

/**
 * リクエストのヘッダーから、Static Web Apps と同じ形のログイン情報を作る。ログインしていなければ null。
 * { identityProvider, userId, userDetails, userRoles: ['anonymous', 'authenticated', ...アプリ ロール] }
 */
export function principalFromEasyAuth(headers, { trust }) {
  if (!trust) return null;
  const raw = header(headers, 'x-ms-client-principal');
  if (!raw) return null;
  let p;
  try {
    p = JSON.parse(Buffer.from(raw, 'base64').toString('utf8'));
  } catch {
    return null;
  }
  const claims = Array.isArray(p?.claims) ? p.claims : [];
  const roleTyp = p?.role_typ;
  const find = (types) => types.map((t) => claims.find((c) => c?.typ === t)?.val).find(Boolean);
  const roles = claims
    .filter((c) => (ROLE_CLAIMS.has(c?.typ) || (roleTyp && c?.typ === roleTyp)) && typeof c.val === 'string')
    .map((c) => c.val)
    .filter((r) => ROLE_NAME.test(r) && r !== 'anonymous');
  const userId = header(headers, 'x-ms-client-principal-id') || find(OID_CLAIMS);
  if (!userId) return null;
  return {
    identityProvider: 'aad',
    userId,
    userDetails: header(headers, 'x-ms-client-principal-name') || find(NAME_CLAIMS) || userId,
    userRoles: ['anonymous', 'authenticated', ...new Set(roles)],
  };
}

/** API（api/src/lib）に渡す形（Static Web Apps の x-ms-client-principal と同じ base64） */
export function toSwaHeader(principal) {
  return principal ? Buffer.from(JSON.stringify(principal), 'utf8').toString('base64') : null;
}
