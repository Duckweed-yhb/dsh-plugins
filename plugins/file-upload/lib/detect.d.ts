/** Shared vocabulary for dsh-file-upload. @module dsh-file-upload/types */
/** Categories the sniffing chain can assign to an uploaded file. */
export type SniffedType = 'text' | 'pdf' | 'docx' | 'xlsx' | 'image' | 'audio' | 'archive' | 'binary';
/** Marker categories for archive containers. */
export type ArchiveKind = 'zip' | 'other';
/** Result of the content sniff. */
export interface SniffResult {
    /** Assigned category; `binary` means "agent handles by path". */
    type: SniffedType;
    /** Lowercase extension when present. */
    ext: string;
    /** Human label for UI badges. */
    label: string;
    /** Whether the bytes look like a text encoding we can decode. */
    likelyText: boolean;
    /** Detected encoding for text (`utf8` | `utf16le` | `gb18030`). */
    encoding?: 'utf8' | 'utf16le' | 'gb18030';
}
/**
 * Decide whether bytes are decodable text and which encoding they use.
 * Mirrors the official read tool's chain: UTF-16 BOM → UTF-8 (fatal) → GB18030.
 */
export declare function detectEncoding(data: Buffer): {
    likelyText: boolean;
    encoding?: 'utf8' | 'utf16le' | 'gb18030';
};
/** Sniff the first bytes of an uploaded file. Never trusts the extension. */
export declare function sniff(data: Buffer, fileName: string): SniffResult;
