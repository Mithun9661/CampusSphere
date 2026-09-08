/**
 * Generate a random 6-digit exam code
 * @returns {string} A random 6-digit code (000000 - 999999)
 */
export const generateExamCode = () => {
  return Math.floor(
    100000 + Math.random() * 900000
  ).toString();
};
