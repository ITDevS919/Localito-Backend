/**
 * Geocoding service to convert addresses to coordinates.
 * Uses Google Maps Geocoding API or Mapbox Geocoding API (set one in .env).
 */

export interface GeocodeResult {
  latitude: number;
  longitude: number;
}

type GeocodeProvider = "google" | "mapbox";

export class GeocodingService {
  private readonly googleKey = process.env.GOOGLE_MAPS_API_KEY?.trim() || "";
  private readonly mapboxToken = process.env.MAPBOX_ACCESS_TOKEN?.trim() || "";

  private getProvider(): GeocodeProvider | null {
    if (this.googleKey) return "google";
    if (this.mapboxToken) return "mapbox";
    return null;
  }

  /**
   * Geocode an address (postcode, city, or full address).
   * Returns latitude and longitude. Tries multiple query strategies.
   */
  async geocodeAddress(
    postcode?: string,
    city?: string,
    fullAddress?: string
  ): Promise<GeocodeResult | null> {
    const provider = this.getProvider();
    if (!provider) {
      console.warn(
        "[Geocoding] No provider configured. Set GOOGLE_MAPS_API_KEY or MAPBOX_ACCESS_TOKEN in .env"
      );
      return null;
    }

    try {
      const queries: string[] = [];

      if (postcode && city && postcode !== city) {
        queries.push(`${postcode}, ${city}`);
      }
      if (postcode) {
        queries.push(postcode);
        if (/^\d{5}(-\d{4})?$/.test(postcode.trim())) {
          queries.push(`${postcode}, USA`);
          queries.push(`${postcode}, United States`);
        }
      }
      if (city && postcode && city !== postcode) {
        queries.push(`${city}, ${postcode}`);
      }
      if (city) {
        queries.push(city);
      }
      if (fullAddress) {
        queries.push(fullAddress);
      }

      if (queries.length === 0) {
        console.warn("[Geocoding] No address components provided");
        return null;
      }

      for (const query of queries) {
        console.log(`[Geocoding] Attempting to geocode: "${query}"`);
        const result = await this.tryGeocodeQuery(query, provider);
        if (result) return result;
        if (queries.indexOf(query) < queries.length - 1) {
          await new Promise((r) => setTimeout(r, 300));
        }
      }

      console.warn("[Geocoding] All geocoding strategies failed for provided address");
      return null;
    } catch (error: unknown) {
      console.error("[Geocoding] Error during geocoding:", error);
      return null;
    }
  }

  /**
   * Geocode a single query string using the configured provider.
   */
  private async tryGeocodeQuery(
    query: string,
    provider: GeocodeProvider
  ): Promise<GeocodeResult | null> {
    if (provider === "google") {
      return this.geocodeWithGoogle(query);
    }
    return this.geocodeWithMapbox(query);
  }

  /**
   * Google Maps Geocoding API:
   * https://maps.googleapis.com/maps/api/geocode/json?address=...&key=...
   * Response: data.results[0].geometry.location -> { lat, lng }
   */
  private async geocodeWithGoogle(query: string): Promise<GeocodeResult | null> {
    try {
      const addressParam = encodeURIComponent(query);
      const url = `https://maps.googleapis.com/maps/api/geocode/json?address=${addressParam}&key=${this.googleKey}`;

      const res = await fetch(url);
      const data = (await res.json()) as {
        status: string;
        results?: Array<{ geometry: { location: { lat: number; lng: number } } }>;
      };

      if (data.status !== "OK" || !data.results?.length) {
        console.warn(`[Geocoding] Google: no results for "${query}" (status: ${data.status})`);
        return null;
      }

      const { lat, lng } = data.results[0].geometry.location;
      const latitude = Number(lat);
      const longitude = Number(lng);
      if (Number.isNaN(latitude) || Number.isNaN(longitude)) {
        return null;
      }
      console.log(`[Geocoding] ✓ Google geocoded "${query}" to: ${latitude}, ${longitude}`);
      return { latitude, longitude };
    } catch (err) {
      console.error(`[Geocoding] Google error for "${query}":`, err);
      return null;
    }
  }

  /**
   * Mapbox Geocoding API v5:
   * https://api.mapbox.com/geocoding/v5/mapbox.places/{query}.json?access_token=...
   * Response: data.features[0].center -> [lng, lat]
   */
  private async geocodeWithMapbox(query: string): Promise<GeocodeResult | null> {
    try {
      const encodedQuery = encodeURIComponent(query);
      const url = `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodedQuery}.json?access_token=${this.mapboxToken}&limit=1`;

      const res = await fetch(url);
      const data = (await res.json()) as {
        features?: Array<{ center: [number, number] }>;
      };

      if (!data.features?.length) {
        console.warn(`[Geocoding] Mapbox: no results for "${query}"`);
        return null;
      }

      const [lng, lat] = data.features[0].center;
      const latitude = Number(lat);
      const longitude = Number(lng);
      if (Number.isNaN(latitude) || Number.isNaN(longitude)) {
        return null;
      }
      console.log(`[Geocoding] ✓ Mapbox geocoded "${query}" to: ${latitude}, ${longitude}`);
      return { latitude, longitude };
    } catch (err) {
      console.error(`[Geocoding] Mapbox error for "${query}":`, err);
      return null;
    }
  }

  /**
   * Distance between two coordinates in kilometers (Haversine).
   */
  calculateDistance(
    lat1: number,
    lon1: number,
    lat2: number,
    lon2: number
  ): number {
    const R = 6371;
    const dLat = this.toRadians(lat2 - lat1);
    const dLon = this.toRadians(lon2 - lon1);
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(this.toRadians(lat1)) *
        Math.cos(this.toRadians(lat2)) *
        Math.sin(dLon / 2) *
        Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  }

  private toRadians(degrees: number): number {
    return degrees * (Math.PI / 180);
  }
}

export const geocodingService = new GeocodingService();
