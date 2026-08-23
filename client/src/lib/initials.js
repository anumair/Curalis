export function initialsOf(fullName) {
  if (!fullName) return '';
  return fullName
    .replace(/^Dr\.\s*/i, '')
    .trim()
    .split(/\s+/)
    .map((word) => word[0])
    .join('')
    .toUpperCase();
}
