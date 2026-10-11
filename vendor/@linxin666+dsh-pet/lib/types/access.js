import { isPairedOrLoopbackAllowed } from "./pair-access.js";
/**
 * Whether this request may enter any /api/pet or /pet asset route.
 * @param ctx - host context; may expose remoteWebUiPairing.
 * @param request - the incoming HTTP request.
 * @returns true for loopback, or a live paired-device cookie.
 */
export function isPetAllowed(ctx, request) {
    return isPairedOrLoopbackAllowed(ctx, request);
}
