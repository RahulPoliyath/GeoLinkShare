'use client';

export interface GpsFixReading {
  latitude: number;
  longitude: number;
  accuracyMeters: number;
  altitudeMeters: number | null;
  headingDeg: number | null;
  speedMps: number | null;
  samplesCount: number;
  targetAccuracyMeters: number;
  targetMet: boolean;
  elapsedMs: number;
  bestRawAccuracyMeters: number;
}

export interface GpsLockProgress {
  samplesCount: number;
  bestAccuracyMeters: number | null;
  latestAccuracyMeters: number | null;
  latitude: number | null;
  longitude: number | null;
  elapsedMs: number;
  targetMet: boolean;
}

export interface GpsCaptureOptions {
  targetAccuracyMeters?: number;
  maxWaitMs?: number;
  onProgress?: (progress: GpsLockProgress) => void;
  signal?: AbortSignal;
}

/**
 * Great-circle distance in meters using the Haversine formula.
 */
export function haversineMeters(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const R = 6371000;
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) *
      Math.cos(toRad(lat2)) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  return 2 * R * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/**
 * Multi-sample precision browser GNSS acquisition.
 * Uses `enableHighAccuracy: true` and `maximumAge: 0` with live `watchPosition`,
 * computes an inverse-variance weighted centroid over consistent high-accuracy fixes,
 * and ALWAYS reports the authentic sensor-measured accuracy radius (never fabricated).
 */
export function acquireHighAccuracyGps(
  options: GpsCaptureOptions = {}
): Promise<GpsFixReading> {
  const targetAccuracyMeters = Math.max(0.1, options.targetAccuracyMeters ?? 1);
  const maxWaitMs = Math.max(3000, Math.min(25000, options.maxWaitMs ?? 9000));

  return new Promise((resolve, reject) => {
    if (typeof window === 'undefined' || !('geolocation' in navigator)) {
      reject(new Error('Geolocation API is not supported in this browser.'));
      return;
    }

    const startMs = Date.now();
    const samples: Array<{
      lat: number;
      lng: number;
      acc: number;
      alt: number | null;
      heading: number | null;
      speed: number | null;
    }> = [];

    let settled = false;
    let watchId: number | null = null;
    let windowTimer: ReturnType<typeof setTimeout> | null = null;

    const cleanup = () => {
      if (watchId !== null) {
        navigator.geolocation.clearWatch(watchId);
        watchId = null;
      }
      if (windowTimer !== null) {
        clearTimeout(windowTimer);
        windowTimer = null;
      }
      if (options.signal) {
        options.signal.removeEventListener('abort', handleAbort);
      }
    };

    const buildBestReading = (): GpsFixReading | null => {
      if (samples.length === 0) return null;

      // Sort tightest accuracy first
      const sorted = [...samples].sort((a, b) => a.acc - b.acc);
      const best = sorted[0];

      // Keep only consistent high-precision samples within 2.5x of best radius (drops coarse Wi-Fi/cell outliers)
      const consistent = sorted.filter((s) => s.acc <= Math.max(best.acc * 2.5, best.acc + 2));

      let sumW = 0;
      let weightedLat = 0;
      let weightedLng = 0;

      for (const s of consistent) {
        const clampedAcc = Math.max(0.05, s.acc);
        const w = 1 / (clampedAcc * clampedAcc);
        sumW += w;
        weightedLat += s.lat * w;
        weightedLng += s.lng * w;
      }

      const finalLat =
        sumW > 0 ? Math.round((weightedLat / sumW) * 1e7) / 1e7 : Math.round(best.lat * 1e7) / 1e7;
      const finalLng =
        sumW > 0 ? Math.round((weightedLng / sumW) * 1e7) / 1e7 : Math.round(best.lng * 1e7) / 1e7;
      // Preserve authentic device-reported best radius — never shrink or spoof accuracy
      const authenticAccuracy = Math.round(best.acc * 100) / 100;

      return {
        latitude: finalLat,
        longitude: finalLng,
        accuracyMeters: authenticAccuracy,
        altitudeMeters: best.alt !== null ? Math.round(best.alt * 100) / 100 : null,
        headingDeg: best.heading !== null ? Math.round(best.heading * 100) / 100 : null,
        speedMps: best.speed !== null ? Math.round(best.speed * 100) / 100 : null,
        samplesCount: samples.length,
        targetAccuracyMeters,
        targetMet: authenticAccuracy <= targetAccuracyMeters,
        elapsedMs: Date.now() - startMs,
        bestRawAccuracyMeters: authenticAccuracy,
      };
    };

    const finishWithBest = () => {
      if (settled) return;
      settled = true;
      cleanup();
      const reading = buildBestReading();
      if (!reading) {
        reject(
          new Error(
            'Unable to acquire a live GNSS fix within the time limit. Ensure location access is enabled and retry.'
          )
        );
        return;
      }
      resolve(reading);
    };

    const handleAbort = () => {
      if (settled) return;
      settled = true;
      cleanup();
      reject(new Error('GPS acquisition cancelled.'));
    };

    if (options.signal) {
      if (options.signal.aborted) {
        handleAbort();
        return;
      }
      options.signal.addEventListener('abort', handleAbort);
    }

    windowTimer = setTimeout(() => {
      finishWithBest();
    }, maxWaitMs);

    watchId = navigator.geolocation.watchPosition(
      (pos) => {
        if (settled) return;

        // Ignore stale cached locations older than 15 seconds
        if (pos.timestamp && Date.now() - pos.timestamp > 15000) {
          return;
        }

        const { latitude, longitude, accuracy, altitude, heading, speed } = pos.coords;
        if (
          !Number.isFinite(latitude) ||
          !Number.isFinite(longitude) ||
          !Number.isFinite(accuracy)
        ) {
          return;
        }

        samples.push({
          lat: latitude,
          lng: longitude,
          acc: accuracy,
          alt: typeof altitude === 'number' && Number.isFinite(altitude) ? altitude : null,
          heading: typeof heading === 'number' && Number.isFinite(heading) ? heading : null,
          speed: typeof speed === 'number' && Number.isFinite(speed) ? speed : null,
        });

        const bestSoFar = Math.min(...samples.map((s) => s.acc));
        const currentReading = buildBestReading();

        options.onProgress?.({
          samplesCount: samples.length,
          bestAccuracyMeters: Math.round(bestSoFar * 100) / 100,
          latestAccuracyMeters: Math.round(accuracy * 100) / 100,
          latitude: currentReading?.latitude ?? null,
          longitude: currentReading?.longitude ?? null,
          elapsedMs: Date.now() - startMs,
          targetMet: bestSoFar <= targetAccuracyMeters,
        });

        // Early finish once sub-target (e.g. <= 1m RTK) lock is confirmed with >= 2 samples (or <= 1m with >= 1.5s elapsed)
        if (bestSoFar <= targetAccuracyMeters && (samples.length >= 2 || Date.now() - startMs >= 1500)) {
          finishWithBest();
        }
      },
      (err) => {
        if (settled) return;
        // If we already captured at least one sample, resolve with best sample unless permission denied
        if (err.code === err.PERMISSION_DENIED) {
          settled = true;
          cleanup();
          reject(
            new Error(
              'Location permission was denied. Please grant browser location access to verify coordinates.'
            )
          );
          return;
        }
        if (samples.length > 0) {
          finishWithBest();
          return;
        }
        if (err.code === err.TIMEOUT && Date.now() - startMs < maxWaitMs) {
          return;
        }
        settled = true;
        cleanup();
        reject(
          new Error(
            err.message ||
              'GPS signal unavailable. Move near a window or outdoors for high-accuracy satellite lock.'
          )
        );
      },
      {
        enableHighAccuracy: true,
        maximumAge: 0,
        timeout: Math.min(maxWaitMs, 12000),
      }
    );
  });
}
