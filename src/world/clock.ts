/** The visitor's clock decides the starting time of day (HGSS default window: night is 20:00 to 05:59). */
export function nightByHour(hour: number): boolean {
  return hour >= 20 || hour < 6;
}
