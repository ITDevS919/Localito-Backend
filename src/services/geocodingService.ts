/**
 * Geocoding service to convert addresses to coordinates
 * Uses OpenStreetMap Nominatim API (free, no API key required)
 * For production, consider using Google Maps Geocoding API or similar
 */

interface GeocodeResult {
  latitude: number;
  longitude: number;
}

export class GeocodingService {
  private readonly baseUrl = "https://nominatim.openstreetmap.org/search";
  private readonly userAgent = "Marketplace-Hub/1.0"; // Required by Nominatim

  /**
   * Geocode an address (postcode, city, or full address)
   * Returns latitude and longitude coordinates
   * Tries multiple query strategies for better results
   */
  async geocodeAddress(
    postcode?: string,
    city?: string,
    fullAddress?: string
  ): Promise<GeocodeResult | null> {
    try {
      // Build multiple query strategies to try (ordered by reliability)
      const queries: string[] = [];
      
      // Strategy 1: Postcode + City (most reliable, works for most countries)
      if (postcode && city && postcode !== city) {
        queries.push(`${postcode}, ${city}`);
      }
      
      // Strategy 2: Just postcode (works well for UK, US zip codes, etc.)
      if (postcode) {
        queries.push(postcode);
        // For US zip codes, also try with "USA" suffix
        if (/^\d{5}(-\d{4})?$/.test(postcode.trim())) {
          queries.push(`${postcode}, USA`);
          queries.push(`${postcode}, United States`);
        }
      }
      
      // Strategy 3: City + Postcode (alternative order)
      if (city && postcode && city !== postcode) {
        queries.push(`${city}, ${postcode}`);
      }
      
      // Strategy 4: Just city (less precise but often works)
      if (city) {
        queries.push(city);
      }
      
      // Strategy 5: Full address (try last as it's often too specific)
      if (fullAddress) {
        queries.push(fullAddress);
      }

      if (queries.length === 0) {
        console.warn("[Geocoding] No address components provided");
        return null;
      }

      // Try each query strategy until one works
      for (const query of queries) {
        console.log(`[Geocoding] Attempting to geocode: "${query}"`);
        
        const result = await this.tryGeocodeQuery(query);
        if (result) {
          return result;
        }
        
        // Wait a bit between requests to respect rate limits
        if (queries.indexOf(query) < queries.length - 1) {
          await new Promise(resolve => setTimeout(resolve, 500));
        }
      }

      console.warn(`[Geocoding] All geocoding strategies failed for provided address`);
      return null;
    } catch (error: any) {
      console.error("[Geocoding] Error during geocoding:", error);
      console.error("[Geocoding] Error stack:", error?.stack);
      if (error?.message) {
        console.error("[Geocoding] Error message:", error.message);
      }
      return null;
    }
  }

  /**
   * Try to geocode a single query string
   */
  private async tryGeocodeQuery(query: string): Promise<GeocodeResult | null> {
    try {
      // Construct URL with proper encoding
      const params = new URLSearchParams({
        q: query,
        format: "json",
        limit: "1",
        addressdetails: "1",
      });

      const url = `${this.baseUrl}?${params.toString()}`;
      console.log(`[Geocoding] Request URL: ${url}`);

      // Use native fetch (Node.js 18+ has it built-in)
      console.log(`[Geocoding] Making request to Nominatim API...`);
      const response = await fetch(url, {
        headers: {
          "User-Agent": this.userAgent,
          "Accept": "application/json",
        },
      });

      console.log(`[Geocoding] Response status: ${response.status} ${response.statusText}`);

      if (!response.ok) {
        const errorText = await response.text().catch(() => "Unable to read error");
        console.error(`[Geocoding] API error: ${response.status} ${response.statusText}`);
        console.error(`[Geocoding] Error details: ${errorText}`);
        return null;
      }

      const data = await response.json();
      console.log(`[Geocoding] Received ${Array.isArray(data) ? data.length : 0} result(s)`);

      if (!Array.isArray(data) || data.length === 0) {
        console.warn(`[Geocoding] No results found for: "${query}"`);
        return null;
      }

      const result = data[0];
      const lat = parseFloat(result.lat);
      const lon = parseFloat(result.lon);

      if (isNaN(lat) || isNaN(lon)) {
        console.error(`[Geocoding] Invalid coordinates: lat=${result.lat}, lon=${result.lon}`);
        return null;
      }

      console.log(`[Geocoding] ✓ Successfully geocoded "${query}" to: ${lat}, ${lon}`);
      return { latitude: lat, longitude: lon };
    } catch (error: any) {
      console.error(`[Geocoding] Error geocoding query "${query}":`, error?.message);
      return null;
    }
  }

  /**
   * Calculate distance between two coordinates using Haversine formula
   * Returns distance in kilometers
   */
  calculateDistance(
    lat1: number,
    lon1: number,
    lat2: number,
    lon2: number
  ): number {
    const R = 6371; // Earth's radius in kilometers
    const dLat = this.toRadians(lat2 - lat1);
    const dLon = this.toRadians(lon2 - lon1);

    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(this.toRadians(lat1)) *
        Math.cos(this.toRadians(lat2)) *
        Math.sin(dLon / 2) *
        Math.sin(dLon / 2);

    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    const distance = R * c;

    return distance;
  }

  private toRadians(degrees: number): number {
    return degrees * (Math.PI / 180);
  }
}

export const geocodingService = new GeocodingService();

