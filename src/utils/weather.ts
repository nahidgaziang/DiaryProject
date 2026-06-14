import type { WeatherType } from '../types';

export interface LocationData {
  city: string;
  lat: number;
  lon: number;
}

export interface WeatherData {
  temp: string;
  weatherType: WeatherType;
}

/**
 * Detects the user's location.
 * First tries native browser Geolocation API.
 * If permission is denied or fails, falls back to IP-based location via FreeIPAPI.
 */
export async function detectLocation(): Promise<LocationData> {
  return new Promise((resolve) => {
    if (!navigator.geolocation) {
      resolve(fetchIpLocation());
      return;
    }

    navigator.geolocation.getCurrentPosition(
      async (position) => {
        try {
          const { latitude, longitude } = position.coords;
          // Reverse geocode using OpenStreetMap Nominatim (Free, no keys)
          const res = await fetch(
            `https://nominatim.openstreetmap.org/reverse?format=json&lat=${latitude}&lon=${longitude}`,
            { headers: { 'User-Agent': 'AureliusDiaryApp/1.0' } }
          );
          const data = await res.json();
          const city = data.address.city || data.address.town || data.address.village || data.address.suburb || 'Local Area';
          const country = data.address.country || '';
          resolve({
            city: country ? `${city}, ${country}` : city,
            lat: latitude,
            lon: longitude
          });
        } catch {
          // If reverse geocode fails, fallback to coordinates format
          resolve({
            city: `${position.coords.latitude.toFixed(2)}°N, ${position.coords.longitude.toFixed(2)}°E`,
            lat: position.coords.latitude,
            lon: position.coords.longitude
          });
        }
      },
      () => {
        // Geolocation failed or denied -> Fallback to IP Geolocation
        resolve(fetchIpLocation());
      },
      { timeout: 5000 }
    );
  });
}

/**
 * Fallback IP Geolocation using freeipapi.com
 */
async function fetchIpLocation(): Promise<LocationData> {
  try {
    const res = await fetch('https://freeipapi.com/api/json');
    const data = await res.json();
    const city = data.cityName || 'Unknown City';
    const country = data.countryName || '';
    return {
      city: country ? `${city}, ${country}` : city,
      lat: data.latitude || 35.6762, // Default to Tokyo if failed
      lon: data.longitude || 139.6503
    };
  } catch (error) {
    console.error('IP Geolocation fallback failed:', error);
    return {
      city: 'Itomori, Gifu',
      lat: 36.2462,
      lon: 137.2512
    };
  }
}

/**
 * Fetches current weather from Open-Meteo for the given lat/lon.
 */
export async function fetchWeather(lat: number, lon: number): Promise<WeatherData> {
  try {
    const res = await fetch(
      `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current_weather=true`
    );
    const data = await res.json();
    const current = data.current_weather;
    const rawTemp = current.temperature;
    
    // Map WMO codes to our WeatherType
    const code = current.weathercode;
    let weatherType: WeatherType = 'sunny';
    
    if (code === 0) {
      weatherType = 'sunny';
    } else if (code >= 1 && code <= 3) {
      weatherType = 'cloudy';
    } else if (code >= 45 && code <= 48) {
      weatherType = 'cloudy'; // Foggy
    } else if ((code >= 51 && code <= 67) || (code >= 80 && code <= 82) || (code >= 95 && code <= 99)) {
      weatherType = 'rainy';
    } else if ((code >= 71 && code <= 77) || (code >= 85 && code <= 86)) {
      weatherType = 'snowy';
    } else {
      weatherType = 'clear';
    }

    return {
      temp: `${Math.round(rawTemp)}°C`,
      weatherType
    };
  } catch (error) {
    console.error('Weather API fetch failed:', error);
    return {
      temp: '22°C',
      weatherType: 'sunny'
    };
  }
}
