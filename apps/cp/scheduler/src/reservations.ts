// 予約データの保存（ブラウザ内の localStorage）と、DeskNet's 取り込み用 CSV の作成。
import { toMinutes } from './parse';

export type Reservation = {
  id: string;
  date: string; // YYYY-MM-DD
  start: string; // HH:MM
  end: string; // HH:MM
  room: string;
  title: string;
  createdAt: string;
};

const RESERVATIONS_KEY = 'cp-scheduler:reservations';
const ROOMS_KEY = 'cp-scheduler:rooms';
export const DEFAULT_ROOMS = ['会議室A', '会議室B', '応接室'];

function readJson<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

export function loadReservations(): Reservation[] {
  const list = readJson<Reservation[]>(RESERVATIONS_KEY, []);
  return Array.isArray(list) ? sortReservations(list) : [];
}

export function saveReservations(list: Reservation[]) {
  localStorage.setItem(RESERVATIONS_KEY, JSON.stringify(list));
}

export function loadRooms(): string[] {
  const list = readJson<string[]>(ROOMS_KEY, DEFAULT_ROOMS);
  return Array.isArray(list) && list.length ? list : DEFAULT_ROOMS;
}

export function saveRooms(list: string[]) {
  localStorage.setItem(ROOMS_KEY, JSON.stringify(list));
}

export function sortReservations(list: Reservation[]) {
  return [...list].sort((a, b) => (a.date + a.start).localeCompare(b.date + b.start));
}

/** 同じ会議室・同じ日で、時間が重なる予約を返す */
export function findConflicts(list: Reservation[], target: Pick<Reservation, 'date' | 'start' | 'end' | 'room'>) {
  const s = toMinutes(target.start);
  const e = toMinutes(target.end);
  return list.filter((r) => r.room === target.room && r.date === target.date && toMinutes(r.start) < e && s < toMinutes(r.end));
}

export function newId() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function csvCell(value: string) {
  // 表計算ソフトで数式として扱われないように、先頭の = + - @ を無害化する
  const safe = /^[=+\-@]/.test(value) ? `'${value}` : value;
  return /[",\r\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

export const CSV_HEADER = ['開始日', '開始時刻', '終了日', '終了時刻', '設備', '予定', 'メモ'];

/**
 * DeskNet's に手動で取り込むための CSV（UTF-8・BOM付き）。
 * 日付は YYYY/MM/DD、時刻は HH:MM。列の並びは取り込み画面で合わせる。
 */
export function toCsv(list: Reservation[]): string {
  const rows = sortReservations(list).map((r) => [
    r.date.replace(/-/g, '/'),
    r.start,
    r.date.replace(/-/g, '/'),
    r.end,
    r.room,
    r.title || '会議',
    '会議室予約アプリから出力',
  ]);
  return '﻿' + [CSV_HEADER, ...rows].map((row) => row.map(csvCell).join(',')).join('\r\n') + '\r\n';
}
