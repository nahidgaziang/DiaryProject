import type { DiaryEntry } from '../types';

// ─── Storage Keys ──────────────────────────────────────────────────────────
const STORAGE_KEY     = 'dailydrive_diary_entries';
const BACKUP_KEY      = 'dailydrive_diary_entries_backup';
const THEME_KEY       = 'dailydrive_theme_mode';
const DRAFT_KEY       = 'dailydrive_draft';
const LAST_WEATHER_KEY = 'dailydrive_last_weather';

// Legacy key migration — if user had data under old "aurelius_" keys, move it
const LEGACY_STORAGE_KEY = 'aurelius_diary_entries';
const LEGACY_THEME_KEY   = 'aurelius_theme_mode';
const LEGACY_DRAFT_KEY   = 'aurelius_draft';

// ─── Migration ─────────────────────────────────────────────────────────────
/**
 * Run once on app start: migrates any data stored under the old "aurelius_"
 * prefix to "dailydrive_" so no data is lost after the rename.
 */
function runMigration(): void {
  try {
    // Migrate entries
    if (!localStorage.getItem(STORAGE_KEY)) {
      const legacy = localStorage.getItem(LEGACY_STORAGE_KEY);
      if (legacy) {
        localStorage.setItem(STORAGE_KEY, legacy);
        localStorage.removeItem(LEGACY_STORAGE_KEY);
        console.info('[DailyDrive] Migrated diary entries from legacy key.');
      }
    }
    // Migrate theme preference
    if (!localStorage.getItem(THEME_KEY)) {
      const legacyTheme = localStorage.getItem(LEGACY_THEME_KEY);
      if (legacyTheme) {
        localStorage.setItem(THEME_KEY, legacyTheme);
        localStorage.removeItem(LEGACY_THEME_KEY);
      }
    }
    // Migrate draft
    if (!localStorage.getItem(DRAFT_KEY)) {
      const legacyDraft = localStorage.getItem(LEGACY_DRAFT_KEY);
      if (legacyDraft) {
        localStorage.setItem(DRAFT_KEY, legacyDraft);
        localStorage.removeItem(LEGACY_DRAFT_KEY);
      }
    }
  } catch {
    // Migration errors are non-fatal
  }
}

// Run migration immediately when this module loads
runMigration();

// ─── Validation ────────────────────────────────────────────────────────────
function isValidEntry(entry: unknown): entry is DiaryEntry {
  if (!entry || typeof entry !== 'object') return false;
  const e = entry as Record<string, unknown>;
  return (
    typeof e.id === 'string' &&
    typeof e.dateString === 'string' &&
    typeof e.content === 'string'
  );
}

function sanitizeEntries(raw: unknown[]): DiaryEntry[] {
  return raw.filter(isValidEntry);
}

// ─── DiaryStorageService ───────────────────────────────────────────────────
export class DiaryStorageService {
  /**
   * Retrieves all diary entries, sorted by creation date (newest first).
   * Falls back to the backup copy if primary storage is corrupted.
   */
  static getAll(): DiaryEntry[] {
    try {
      const data = localStorage.getItem(STORAGE_KEY);
      if (!data) return [];

      const parsed = JSON.parse(data);
      if (!Array.isArray(parsed)) throw new Error('Storage data is not an array');

      const entries = sanitizeEntries(parsed);
      return entries.sort(
        (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      );
    } catch (error) {
      console.error('[DailyDrive] Primary storage corrupted, attempting backup restore:', error);
      return DiaryStorageService.restoreFromBackup();
    }
  }

  /**
   * Saves or updates a diary entry. Also writes a backup copy.
   */
  static save(entry: DiaryEntry): void {
    if (!isValidEntry(entry)) {
      console.error('[DailyDrive] Attempted to save invalid entry:', entry);
      return;
    }
    const entries = this.getAll();
    const existingIndex = entries.findIndex(e => e.id === entry.id);

    if (existingIndex > -1) {
      entries[existingIndex] = { ...entries[existingIndex], ...entry };
    } else {
      entries.unshift(entry);
    }

    this.writeAll(entries);
  }

  /**
   * Deletes a diary entry by its ID.
   */
  static delete(id: string): void {
    const entries = this.getAll();
    const filtered = entries.filter(e => e.id !== id);
    this.writeAll(filtered);
  }

  /**
   * Exports all entries as a JSON blob URL for download.
   */
  static exportJSON(): string {
    const entries = this.getAll();
    const blob = new Blob([JSON.stringify(entries, null, 2)], { type: 'application/json' });
    return URL.createObjectURL(blob);
  }

  /**
   * Imports entries from a JSON string, merging with existing data.
   * Existing entries with matching IDs are updated; new ones are added.
   * Returns number of entries imported.
   */
  static importJSON(jsonString: string): number {
    try {
      const imported = JSON.parse(jsonString);
      if (!Array.isArray(imported)) throw new Error('Invalid JSON format');

      const valid = sanitizeEntries(imported);
      const existing = this.getAll();
      const existingIds = new Set(existing.map(e => e.id));

      let count = 0;
      for (const entry of valid) {
        if (existingIds.has(entry.id)) {
          const idx = existing.findIndex(e => e.id === entry.id);
          existing[idx] = entry;
        } else {
          existing.push(entry);
          count++;
        }
      }

      this.writeAll(existing);
      return count;
    } catch (error) {
      console.error('[DailyDrive] Import failed:', error);
      throw error;
    }
  }

  /**
   * Returns the approximate size of the stored data in KB.
   */
  static getStorageSize(): string {
    try {
      const data = localStorage.getItem(STORAGE_KEY) ?? '';
      const bytes = new Blob([data]).size;
      return bytes < 1024
        ? `${bytes} B`
        : bytes < 1024 * 1024
        ? `${(bytes / 1024).toFixed(1)} KB`
        : `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
    } catch {
      return 'unknown';
    }
  }

  // ─── Theme preference ───────────────────────────────────────────────────
  static getTheme(): 'dark' | 'light' | null {
    try {
      const val = localStorage.getItem(THEME_KEY);
      if (val === 'dark' || val === 'light') return val;
      return null;
    } catch { return null; }
  }

  static setTheme(mode: 'dark' | 'light'): void {
    try { localStorage.setItem(THEME_KEY, mode); } catch { /* noop */ }
  }

  // ─── Draft ─────────────────────────────────────────────────────────────
  static getDraft(): { title: string; content: string } | null {
    try {
      const raw = localStorage.getItem(DRAFT_KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      if (typeof parsed?.title === 'string' && typeof parsed?.content === 'string') {
        return parsed as { title: string; content: string };
      }
      return null;
    } catch { return null; }
  }

  static saveDraft(title: string, content: string): void {
    try {
      localStorage.setItem(DRAFT_KEY, JSON.stringify({ title, content }));
    } catch { /* noop */ }
  }

  static clearDraft(): void {
    try { localStorage.removeItem(DRAFT_KEY); } catch { /* noop */ }
  }

  // ─── Last weather/location cache ────────────────────────────────────────
  static getLastWeather(): Record<string, unknown> | null {
    try {
      const raw = localStorage.getItem(LAST_WEATHER_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch { return null; }
  }

  static saveLastWeather(data: Record<string, unknown>): void {
    try {
      localStorage.setItem(LAST_WEATHER_KEY, JSON.stringify(data));
    } catch { /* noop */ }
  }

  // ─── Private helpers ────────────────────────────────────────────────────
  private static writeAll(entries: DiaryEntry[]): void {
    try {
      const serialized = JSON.stringify(entries);
      localStorage.setItem(STORAGE_KEY, serialized);
      // Write backup immediately after successful primary write
      localStorage.setItem(BACKUP_KEY, serialized);
    } catch (error) {
      console.error('[DailyDrive] Failed to save entries — storage may be full:', error);
      // Try trimming oldest entries from backup if quota exceeded
      this.handleStorageQuotaError(entries);
    }
  }

  private static restoreFromBackup(): DiaryEntry[] {
    try {
      const backup = localStorage.getItem(BACKUP_KEY);
      if (!backup) return [];
      const parsed = JSON.parse(backup);
      if (!Array.isArray(parsed)) return [];
      const entries = sanitizeEntries(parsed);
      // Restore backup into primary
      localStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
      console.info('[DailyDrive] Restored entries from backup. Count:', entries.length);
      return entries;
    } catch {
      console.error('[DailyDrive] Backup restore also failed. Returning empty state.');
      return [];
    }
  }

  private static handleStorageQuotaError(entries: DiaryEntry[]): void {
    try {
      // Last resort: trim content of oldest entries to save what we can
      const trimmed = entries.map(e => ({
        ...e,
        content: e.content.length > 500 ? e.content.slice(0, 500) + '…' : e.content,
      }));
      localStorage.setItem(STORAGE_KEY, JSON.stringify(trimmed));
      console.warn('[DailyDrive] Storage quota exceeded — entries trimmed to save metadata.');
    } catch {
      console.error('[DailyDrive] Critical: Could not save even trimmed entries.');
    }
  }
}

// Export individual storage key constants so App.tsx can use them
export { THEME_KEY, DRAFT_KEY, LAST_WEATHER_KEY };
