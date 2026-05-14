/**
 * Formats raw ISO strings into a clean "8:30 AM" format.
 * Manually extracts time to avoid browser timezone shifts and 
 * handle malformed ISO strings (e.g., missing leading zeros).
 */
export const formatTime = (timeStr?: string): string => {
  if (!timeStr) return '';
  const timeMatch = timeStr.match(/(\d{1,2}):(\d{2})/);
  if (timeMatch) {
    let hours = parseInt(timeMatch[1], 10);
    const minutes = timeMatch[2];
    const ampm = hours >= 12 ? 'PM' : 'AM';
    hours = hours % 12;
    hours = hours ? hours : 12; // the hour '0' should be '12'
    return `${hours}:${minutes} ${ampm}`;
  }
  return timeStr;
};