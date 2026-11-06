/** read_document tool: page through uploaded documents with on-demand
 * conversion to Markdown (text fast-path, optional MarkItDown CLI, bundled
 * markitdown-node engine, JS fallback). Reads through ctx.fs, so workspace
 * resolution, sandbox policy and fs-observation policy behave exactly like
 * the built-in read tool. Results are cached with a byte-budgeted LRU keyed
 * by (targetKey, version, format), so re-reads after an edit re-parse while
 * identical files hit the cache.
 */
import { type FsTarget, type FsVersion } from '@deepseek-ai/dsh-fs';
export interface ReadDocumentConfig {
    readLimit: number;
    maxFileBytes: number;
    sheetRowLimit: number;
    maxSheets: number;
    markitdownBin?: string;
    markitdownTimeoutMs?: number;
}
export interface CacheEntry {
    markdown: string;
    bytes: number;
}
/** Byte-budgeted LRU cache keyed by targetKey+version+format. */
export declare class ParseCache {
    private readonly entries;
    private totalBytes;
    private readonly maxEntries;
    private readonly maxBytes;
    constructor(maxEntries: number, maxBytes: number);
    get(key: string): string | undefined;
    set(key: string, markdown: string): void;
    get size(): number;
}
/**
 * Split converted Markdown into the lines a reader counts.
 *
 * A trailing newline terminates the last line rather than opening a new one, so
 * `"a\nb\n"` is two lines, not three. `split('\n')` gets this wrong by leaving a
 * phantom empty element: the reader then reports one line more than the file
 * has, and a caller that has already read the whole document is told there is
 * still a page left — so it pages again and gets an empty line. Exactly one
 * trailing empty element is dropped, which keeps a file that genuinely ends in
 * a blank line (`"a\n\n"` → `['a', '']`) reported as two lines.
 */
export declare function splitLines(markdown: string): string[];
export declare function renderEnvelope(path: string, value: {
    offset: number;
    lines: Array<{
        number: number;
        text: string;
    }>;
    totalLines: number;
}): string;
export declare function defineReadDocumentTool(ctx: {
    fs: {
        resolve(path: string, opts?: {
            cwd?: string;
            signal?: AbortSignal;
        }): Promise<FsTarget>;
        stat(target: FsTarget, signal?: AbortSignal): Promise<{
            version: FsVersion;
            type: string;
            size?: number;
        } | undefined>;
        readBytes(target: FsTarget, signal: AbortSignal | undefined, maxBytes: number): Promise<Uint8Array>;
    };
    emit(event: string, target: FsTarget, observation: object, exec: object): void;
}, config: ReadDocumentConfig, cache: ParseCache): import("@deepseek-ai/dsh-tools").ToolDefinition;
