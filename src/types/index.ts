export type MoodType = 'joyful' | 'calm' | 'reflective' | 'tired' | 'anxious';
export type WeatherType = 'sunny' | 'cloudy' | 'rainy' | 'snowy' | 'clear';

export interface DiaryEntry {
  id: string;
  title: string;
  content: string;
  createdAt: string; // ISO format
  dateString: string; // YYYY-MM-DD used to tie to calendar tiles
  mood: MoodType;
  weather: WeatherType;
  temperature?: string; // e.g. "26° / 18°"
  location: string; // e.g. "Tokyo, Gifu"
  tags: string[];
  cardColor?: string; // Optional per-entry accent hex color, e.g. "#8b5cf6"
}

