export const KINDS = ['文房具', 'PC周辺機器', '事務用品', 'その他'] as const;
export type Kind = (typeof KINDS)[number];

export interface EquipmentRequest {
  id: string;
  createdAt: string;
  kind: Kind;
  item: string;
  quantity: number;
  reason: string;
}

const KEY = 'bm-equipment.requests';

/** デモ用：申請はこのブラウザ内（localStorage）にだけ保存する。 */
export function loadRequests(): EquipmentRequest[] {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as EquipmentRequest[]) : [];
  } catch {
    return [];
  }
}

export function saveRequests(requests: EquipmentRequest[]): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(requests));
  } catch {
    // 保存できない環境（プライベートモード等）では画面上だけで保持する
  }
}

export function validate(input: { item: string; quantity: number }): string | null {
  if (input.item.trim() === '') return '品名を入力してください';
  if (!Number.isInteger(input.quantity) || input.quantity < 1 || input.quantity > 99) {
    return '数量は1〜99で入力してください';
  }
  return null;
}
