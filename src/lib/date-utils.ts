/**
 * Centralized date utility functions.
 *
 * All API routes should import from here instead of defining
 * their own copies of monthMap / getFromToDates / formatDateToYYYYMMDD.
 */

export const monthMap: Record<string, number> = {
  jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5,
  jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11,
};

/**
 * Given a short month name (e.g. "jan", "Feb") and a year, return
 * the UTC start and end Date objects for that calendar month.
 */
export function getFromToDates(month: string, year: number) {
  const monthIndex = monthMap[month.toLowerCase()];

  if (monthIndex === undefined) {
    throw new Error(
      "Invalid month provided. Please use short month names (e.g., 'Jan', 'Feb')."
    );
  }

  const startDate = new Date(Date.UTC(year, monthIndex, 1));
  const endDate = new Date(Date.UTC(year, monthIndex + 1, 0, 23, 59, 59, 999));

  return { startDate, endDate };
}

/**
 * Format a Date to "YYYY-MM-DD" string.
 *
 * NOTE: The previous function name `formatDateToDDMMYYYY` was a misnomer —
 * it actually returned YYYY-MM-DD. Kept the same behaviour; the alias below
 * preserves backward-compat for any callers still using the old name.
 */
export function formatDateToYYYYMMDD(date: Date): string {
  const day = String(date.getDate()).padStart(2, '0');
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const year = date.getFullYear();
  return `${year}-${month}-${day}`;
}

/** @deprecated Use `formatDateToYYYYMMDD` — kept for backward compatibility. */
export const formatDateToDDMMYYYY = formatDateToYYYYMMDD;
