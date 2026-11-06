import type { IncomingMessage, ServerResponse } from 'node:http';
import type { SniffResult } from './detect.ts';
export interface UploadOptions {
    /** Byte cap for one upload body. */
    maxBytes: number;
    /** Lowercase extension allowlist; empty array means every extension is allowed. */
    allowedExtensions: string[];
    /** How long an uploaded file may live before the sweep removes it. */
    ttlMs: number;
    /** Sweep interval; 0 disables the periodic sweep. */
    sweepIntervalMs: number;
    /** Concurrent upload bodies admitted at once. */
    maxConcurrent: number;
    /**
     * Resolve a session id to its workspace cwd. When the resolver exists but
     * returns undefined the request is rejected (unauthenticated session);
     * when the resolver is absent (no sessions service injected) requests fall
     * back to `defaultDir`.
     */
    sessionCwd?: (sessionId: string) => string | undefined | Promise<string | undefined>;
    /** Fallback storage root when no sessions service is available. */
    defaultDir: string;
    /**
     * Resolve whether the session's routed model accepts image input.
     * `'native'` → the agent reads images with the official `read_image` tool;
     * `'ocr'` → a visual description is generated via `vision`.
     */
    imageMode?: (sessionId: string) => Promise<'native' | 'ocr'>;
    /** Generate a text description ("讲解") of an image for text-only routes. */
    vision?: (filePath: string, name: string) => Promise<string>;
    now?: () => number;
}
export interface UploadedMeta {
    path: string;
    name: string;
    bytes: number;
    sessionId: string;
    sniff: SniffResult;
    imageMode?: 'native' | 'ocr';
    imageDescription?: string;
    deduplicated?: boolean;
}
/** Control chars, path separators, dot segments and leading dots stripped. */
export declare function sanitizeFileName(raw: string): string;
/** Sanitize a relative path for display: strip absolute prefixes, dot segments, control chars. */
export declare function sanitizeRelativePath(raw: string): string;
/** Session ids are opaque tokens; still constrain them to a safe alphabet. */
export declare function sanitizeSessionId(id: string): string;
export declare function createUploadHandler(options: UploadOptions): (req: IncomingMessage, res: ServerResponse) => Promise<void>;
/**
 * Periodically remove upload directories older than the TTL. Scans multiple
 * roots: the fallback `defaultDir` plus every session workspace's
 * `.dsh-uploads` directory (resolved live each sweep), so files stored under
 * session cwds are swept too — not just the no-session fallback root.
 * A root entry may be a path or a resolver returning one path, several paths
 * (e.g. every active session cwd) or nothing at all.
 */
export declare function createSweeper(roots: Array<string | (() => string | readonly (string | undefined)[] | undefined)>, ttlMs: number, intervalMs: number, now?: () => number): () => void;
