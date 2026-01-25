const SIGNATURE_DELIMITER = "__sig__";

/**
 * Encodes a thought signature into a tool call ID.
 * Format: call_<uuid>__sig__<base64_signature>
 *
 * This is used to preserve thought signatures through OpenAI-compatible clients
 * (like Cursor) that don't preserve custom fields but do preserve tool_call.id.
 */
export function encodeSignatureInToolCallId(signature: string | undefined): string {
	const baseId = `call_${crypto.randomUUID()}`;
	if (signature) {
		const encodedSig = btoa(signature);
		return `${baseId}${SIGNATURE_DELIMITER}${encodedSig}`;
	}
	return baseId;
}

/**
 * Extracts a thought signature from a tool call ID.
 * Returns undefined if no signature is embedded.
 *
 * This decodes signatures that were embedded using encodeSignatureInToolCallId().
 */
export function extractSignatureFromToolCallId(toolCallId: string | undefined): string | undefined {
	if (!toolCallId || !toolCallId.includes(SIGNATURE_DELIMITER)) {
		return undefined;
	}

	const sigPart = toolCallId.split(SIGNATURE_DELIMITER)[1];
	if (sigPart) {
		try {
			return atob(sigPart);
		} catch (e) {
			console.error("Failed to decode thought_signature from tool_call id:", e);
		}
	}

	return undefined;
}
