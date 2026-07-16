// Type surface for the platform-split llm module (Metro resolves llm.native.ts on iOS/Android and
// llm.web.ts on web; TypeScript resolves this declaration).
export type ModelTier = { tier: string; file: string; repo: string; sizeGb: number; minRamGb: number };
export declare const MODEL_TIERS: readonly ModelTier[];
export declare function recommendedTier(): ModelTier;
export declare function installedTier(): Promise<ModelTier | null>;
export declare function downloadModel(m: ModelTier, onProgress: (frac: number) => void): Promise<void>;
export declare function deleteModels(): Promise<void>;
export declare function releaseLlm(): Promise<void>;
export declare function completionJson(opts: { system: string; user: string; schema: any; maxTokens?: number }): Promise<{ text: string; model: string }>;
export declare function llmAvailable(): boolean;
