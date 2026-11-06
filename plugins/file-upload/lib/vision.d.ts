/** Image description ("讲解图片") via an OpenAI-compatible vision endpoint.
 *
 * Mature design, endpoint auto-discovery chain:
 *   1. explicit `visionEndpoint` + `visionModel` configuration;
 *   2. local Ollama auto-detected (http://localhost:11434) — picks the first
 *      vision-capable model (e.g. a locally deployed DeepSeek-VL2 or
 *      qwen2.5-vl) — zero config, images never leave the machine;
 *   3. DeepSeek official vision API (`deepseek-v4-flash-vision-exp`) using
 *      the `DEEPSEEK_API_KEY` resolved from the dsh credentials seam — the
 *      key the user already configured for DeepSeek chat works as-is;
 *   4. standard OpenAI endpoint with a key resolved from the dsh credentials
 *      seam (inherited env → $DSH_HOME/.credentials.yaml → project .env).
 *
 * The description travels with the message, so a text-only model (like the
 * DeepSeek chat API) can reason about the image content.
 */
export interface VisionOptions {
    /** Explicit endpoint override ('' = auto-discovery). */
    endpoint: string;
    /** Explicit model override ('' = auto). */
    model: string;
    /** Credential reference name resolved via dsh credentials. */
    apiKeyEnv: string;
    /** Resolver for the API key (dsh credentials seam). */
    resolveKey: () => Promise<string>;
    /** Resolver for an arbitrary env-named key via the same credentials seam. */
    resolveEnvKey?: (env: string) => Promise<string>;
    /** Request timeout in ms. */
    timeoutMs?: number;
    /** Max image bytes accepted (default 10 MB). */
    maxBytes?: number;
}
/**
 * Generate a description ("讲解") of an image. Throws on failure; callers
 * degrade to path-only references.
 */
export declare function describeImage(filePath: string, options: VisionOptions): Promise<string>;
