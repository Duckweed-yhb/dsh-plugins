/** Document → Markdown conversion chain.
 *
 * Three backends, most-capable first:
 *   - Microsoft MarkItDown CLI (`markitdown <file>`) — when `markitdownBin`
 *     is configured (or auto-detected on PATH) it wins: clean Markdown,
 *     audio transcription via Whisper, EPUB, Bing SERP and more;
 *   - built-in `markitdown-node` engine — a TypeScript port of MarkItDown
 *     bundled as a regular dependency, so document → Markdown works out of
 *     the box with zero external tooling (PDF, DOCX, PPTX, XLSX, HTML, CSV,
 *     JSON, XML, ZIP, Jupyter, images with OCR, …);
 *   - fast-path JS parsers for plain text (matching the official `read`
 *     tool's decoding chain) and a lightweight fallback for PDF/DOCX/XLSX.
 *
 * The chain never trusts the file extension: every parser re-verifies the
 * sniffed category before reading bytes.
 */
import type { SniffResult } from './detect.ts';
export interface ConvertOptions {
    /** Byte cap for one document read (PDF parsing amplifies memory severalfold). */
    maxFileBytes: number;
    /** Rows kept per worksheet. */
    sheetRowLimit: number;
    /** Sheets read per workbook (the rest are reported as truncated). */
    maxSheets: number;
    /** Absolute path to the `markitdown` CLI; empty disables the external backend. */
    markitdownBin?: string;
    /** CLI timeout in milliseconds. */
    markitdownTimeoutMs?: number;
}
export interface ConvertResult {
    /** Markdown text extracted from the document. */
    markdown: string;
    /** True when the extraction had to cut content (paging / limits). */
    truncated: boolean;
    /** Which backend produced the result. */
    backend: 'js' | 'markitdown-node' | 'markitdown-cli';
    /** Optional human note (e.g. truncated sheets). */
    note?: string;
}
/** Detect whether the markitdown CLI is runnable at the given path. */
export declare function probeMarkitdown(bin: string): Promise<boolean>;
/** Decode bytes as text using the sniffed encoding. */
export declare function decodeText(data: Buffer, encoding: 'utf8' | 'utf16le' | 'gb18030' | undefined): string;
/** Convert document bytes to Markdown with the built-in JS parsers. */
export declare function convertJs(data: Buffer, sniff: SniffResult, options: ConvertOptions): Promise<ConvertResult>;
/**
 * Convert a document on disk to Markdown with the bundled `markitdown-node`
 * engine (a TypeScript MarkItDown port covering PDF/DOCX/PPTX/XLSX/HTML/CSV/
 * JSON/XML/ZIP/Jupyter/images-OCR/…). Works out of the box — no Python, no
 * external tools. Text-like files are handled by the fast JS path instead.
 */
export declare function convertMarkitdownNode(filePath: string): Promise<ConvertResult>;
/**
 * Unified conversion entry: plain text takes the fast decode path; documents
 * use the Microsoft MarkItDown CLI when available, otherwise the bundled
 * markitdown-node engine, falling back to the lightweight JS parsers.
 */
export declare function convertDocument(filePath: string, data: Buffer, sniff: SniffResult, options: ConvertOptions): Promise<ConvertResult>;
/**
 * Convert document bytes to Markdown via the Microsoft MarkItDown CLI.
 * The CLI accepts the file on disk and prints Markdown to stdout.
 */
export declare function convertMarkitdown(bin: string, filePath: string, timeoutMs: number): Promise<ConvertResult>;
