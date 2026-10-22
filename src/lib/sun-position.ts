// The sun's position in the sky for a place on earth and a moment, with the NOAA solar position formulas
// (the "NOAA Solar Calculator" spreadsheet, after Jean Meeus, Astronomical Algorithms). Accurate to well
// under a degree between 1901 and 2099, which is plenty for showing where the light comes from. Pure, no
// dependencies; unit tested in sun-position.test.ts.

export type SunPosition = {
  /** Compass direction of the sun: degrees clockwise from true north (90 = east, 180 = south). */
  azimuth: number;
  /** Height above the horizon in degrees (geometric, no refraction); negative at night. */
  elevation: number;
  /** Declination of the sun in degrees. */
  declination: number;
  /** Equation of time in minutes (apparent minus mean solar time). */
  equationOfTime: number;
};

const toRadians = (degrees: number) => (degrees * Math.PI) / 180;
const toDegrees = (radians: number) => (radians * 180) / Math.PI;
const wrap360 = (degrees: number) => ((degrees % 360) + 360) % 360;

/** Julian day number (with fraction) of a moment. */
export const julianDay = (date: Date) => date.getTime() / 86_400_000 + 2_440_587.5;

/** The sun's declination and the equation of time at a moment (both independent of the place). */
function solarCoordinates(date: Date) {
  const t = (julianDay(date) - 2_451_545) / 36_525; // Julian centuries since J2000.0
  const meanLongitude = wrap360(280.46646 + t * (36_000.76983 + t * 0.0003032));
  const meanAnomaly = 357.52911 + t * (35_999.05029 - 0.0001537 * t);
  const eccentricity = 0.016708634 - t * (0.000042037 + 0.0000001267 * t);
  const m = toRadians(meanAnomaly);
  const centre = Math.sin(m) * (1.914602 - t * (0.004817 + 0.000014 * t)) + Math.sin(2 * m) * (0.019993 - 0.000101 * t) + Math.sin(3 * m) * 0.000289;
  const omega = toRadians(125.04 - 1934.136 * t);
  const apparentLongitude = meanLongitude + centre - 0.00569 - 0.00478 * Math.sin(omega);
  const meanObliquity = 23 + (26 + (21.448 - t * (46.815 + t * (0.00059 - t * 0.001813))) / 60) / 60;
  const obliquity = toRadians(meanObliquity + 0.00256 * Math.cos(omega));
  const declination = Math.asin(Math.sin(obliquity) * Math.sin(toRadians(apparentLongitude)));

  const y = Math.tan(obliquity / 2) ** 2;
  const l0 = toRadians(meanLongitude);
  const equationOfTime =
    4 *
    toDegrees(
      y * Math.sin(2 * l0) -
        2 * eccentricity * Math.sin(m) +
        4 * eccentricity * y * Math.sin(m) * Math.cos(2 * l0) -
        0.5 * y * y * Math.sin(4 * l0) -
        1.25 * eccentricity * eccentricity * Math.sin(2 * m),
    );
  return { declination, equationOfTime };
}

/**
 * Where the sun stands, seen from `latitude`/`longitude` (WGS84 degrees, east positive) at `date` (any
 * time zone: the moment is what counts).
 */
export function sunPosition(date: Date, latitude: number, longitude: number): SunPosition {
  const { declination, equationOfTime } = solarCoordinates(date);
  const utcMinutes = date.getUTCHours() * 60 + date.getUTCMinutes() + date.getUTCSeconds() / 60 + date.getUTCMilliseconds() / 60_000;
  const trueSolarMinutes = wrap360((utcMinutes + equationOfTime + 4 * longitude) / 4) * 4; // in [0, 1440)
  const hourAngle = toRadians(trueSolarMinutes / 4 - 180);
  const phi = toRadians(latitude);

  const cosZenith = Math.min(1, Math.max(-1, Math.sin(phi) * Math.sin(declination) + Math.cos(phi) * Math.cos(declination) * Math.cos(hourAngle)));
  const elevation = 90 - toDegrees(Math.acos(cosZenith));
  // Measured from south, positive to the west; +180 turns it into a compass bearing from north.
  const azimuth = wrap360(
    toDegrees(Math.atan2(Math.sin(hourAngle), Math.cos(hourAngle) * Math.sin(phi) - Math.tan(declination) * Math.cos(phi))) + 180,
  );
  return { azimuth, elevation, declination: toDegrees(declination), equationOfTime };
}

/** Solar noon (the sun due south, or north in the southern hemisphere) on the UTC day of `date`. */
export function solarNoon(date: Date, longitude: number): Date {
  const midnight = Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
  // The equation of time barely changes in a day: evaluate it at the first guess and correct once.
  let minutes = 720 - 4 * longitude;
  minutes = 720 - 4 * longitude - solarCoordinates(new Date(midnight + minutes * 60_000)).equationOfTime;
  return new Date(midnight + minutes * 60_000);
}
