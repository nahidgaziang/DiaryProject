import type { DiaryEntry } from '../types';

const STORAGE_KEY = 'aurelius_diary_entries';

export class DiaryStorageService {
  /**
   * Retrieves all diary entries from LocalStorage, sorted by creation date (newest first).
   * We handle errors gracefully in case of malformed storage strings.
   */
  static getAll(): DiaryEntry[] {
    try {
      const data = localStorage.getItem(STORAGE_KEY);
      if (!data) return [];
      const entries: DiaryEntry[] = JSON.parse(data);
      
      // Sort: Newest logs first
      return entries.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    } catch (error) {
      console.error('Failed to read diary entries from LocalStorage:', error);
      return [];
    }
  }

  /**
   * Saves or updates a diary entry.
   * If the ID exists, updates the entry. Otherwise, prepends a new entry.
   */
  static save(entry: DiaryEntry): void {
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
   * Private internal helper to commit entries database array to LocalStorage.
   */
  private static writeAll(entries: DiaryEntry[]): void {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
    } catch (error) {
      console.error('Failed to save diary entries database:', error);
    }
  }
}
