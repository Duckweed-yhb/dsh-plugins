import z from '@deepseek-ai/schemastery';
/** Cordis plugin name — must match the row id in cordis.patch.yml. */
export declare const name = "dsh-file-upload";
/**
 * Services required by this plugin.
 *
 * `fs` is deliberately absent: `read_document` reaches the filesystem through
 * the `fs` interface handed to `defineReadDocumentTool`, so the plugin needs the
 * service to exist (the `tools` service itself depends on it) but never touches
 * `ctx.fs` directly, and `inject` is what forces load ordering.
 */
export declare const inject: string[];
/** Plugin config, mirroring the schemastery schema below. */
export interface FileUploadConfig {
    uploadMaxBytes: number;
    allowedExtensions: string[];
    uploadTtlMs: number;
    sweepIntervalMs: number;
    maxConcurrentUploads: number;
    maxFileBytes: number;
    readLimit: number;
    sheetRowLimit: number;
    maxSheets: number;
    cacheEntries: number;
    cacheMaxBytes: number;
    markitdownBin: string;
    markitdownTimeoutMs: number;
    visionEndpoint: string;
    visionModel: string;
    visionApiKeyEnv: string;
    visionMaxBytes: number;
    uploadDir: string;
}
export declare const Config: z<Schemastery.ObjectS<{
    /** Byte cap for one upload body. */
    uploadMaxBytes: z<number, number>;
    /** Lowercase extension allowlist; empty means all allowed. */
    allowedExtensions: z<string[], string[]>;
    /** Uploaded files older than this are swept away. */
    uploadTtlMs: z<number, number>;
    /** Sweep interval; 0 disables the periodic sweep. */
    sweepIntervalMs: z<number, number>;
    /** Concurrent upload bodies admitted at once. */
    maxConcurrentUploads: z<number, number>;
    /** Byte cap for one document read (PDF parsing amplifies memory severalfold). */
    maxFileBytes: z<number, number>;
    /** Default and maximum number of lines returned by one read_document call. */
    readLimit: z<number, number>;
    /** Rows kept per worksheet. */
    sheetRowLimit: z<number, number>;
    /** Sheets read per workbook (the rest are reported as truncated). */
    maxSheets: z<number, number>;
    /** Parse-cache capacity (path + size + mtime fingerprints). */
    cacheEntries: z<number, number>;
    /** Parse-cache byte budget; large PDFs dominate retained memory. */
    cacheMaxBytes: z<number, number>;
    /** Absolute path to a MarkItDown CLI (`markitdown`); empty = auto-detect on PATH. */
    markitdownBin: z<string, string>;
    /** Timeout for one MarkItDown CLI invocation. */
    markitdownTimeoutMs: z<number, number>;
    /** OpenAI-compatible vision endpoint for image descriptions; empty = auto (local Ollama → OpenAI standard). */
    visionEndpoint: z<string, string>;
    /** Vision model id; empty = auto (Ollama vision model or gpt-4o-mini). */
    visionModel: z<string, string>;
    /** Credential reference for the vision API key. */
    visionApiKeyEnv: z<string, string>;
    /** Max image bytes accepted by the vision endpoint. */
    visionMaxBytes: z<number, number>;
    /** Upload storage root when no sessions service is available. */
    uploadDir: z<string, string>;
}>, Schemastery.ObjectT<{
    /** Byte cap for one upload body. */
    uploadMaxBytes: z<number, number>;
    /** Lowercase extension allowlist; empty means all allowed. */
    allowedExtensions: z<string[], string[]>;
    /** Uploaded files older than this are swept away. */
    uploadTtlMs: z<number, number>;
    /** Sweep interval; 0 disables the periodic sweep. */
    sweepIntervalMs: z<number, number>;
    /** Concurrent upload bodies admitted at once. */
    maxConcurrentUploads: z<number, number>;
    /** Byte cap for one document read (PDF parsing amplifies memory severalfold). */
    maxFileBytes: z<number, number>;
    /** Default and maximum number of lines returned by one read_document call. */
    readLimit: z<number, number>;
    /** Rows kept per worksheet. */
    sheetRowLimit: z<number, number>;
    /** Sheets read per workbook (the rest are reported as truncated). */
    maxSheets: z<number, number>;
    /** Parse-cache capacity (path + size + mtime fingerprints). */
    cacheEntries: z<number, number>;
    /** Parse-cache byte budget; large PDFs dominate retained memory. */
    cacheMaxBytes: z<number, number>;
    /** Absolute path to a MarkItDown CLI (`markitdown`); empty = auto-detect on PATH. */
    markitdownBin: z<string, string>;
    /** Timeout for one MarkItDown CLI invocation. */
    markitdownTimeoutMs: z<number, number>;
    /** OpenAI-compatible vision endpoint for image descriptions; empty = auto (local Ollama → OpenAI standard). */
    visionEndpoint: z<string, string>;
    /** Vision model id; empty = auto (Ollama vision model or gpt-4o-mini). */
    visionModel: z<string, string>;
    /** Credential reference for the vision API key. */
    visionApiKeyEnv: z<string, string>;
    /** Max image bytes accepted by the vision endpoint. */
    visionMaxBytes: z<number, number>;
    /** Upload storage root when no sessions service is available. */
    uploadDir: z<string, string>;
}>>;
export declare function apply(ctx: any, config: FileUploadConfig): void;
