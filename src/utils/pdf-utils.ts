/**
 * Validates if a string is a valid base64 encoded PDF.
 * Checks for the PDF magic number (signature) %PDF-
 *
 * @param base64String The base64 encoded string to validate
 * @returns boolean True if the string is a valid base64 encoded PDF
 */
export function validatePdfBase64(base64String: string): boolean {
	try {
		// Remove data URI prefix if present
		const cleanBase64 = base64String.replace(/^data:application\/pdf;base64,/, "");

		// Decode the first few bytes to check the signature
		// We only need the first 5 bytes for %PDF-
		const decoded = atob(cleanBase64.substring(0, 20));

		return decoded.startsWith("%PDF-");
	} catch {
		return false;
	}
}
