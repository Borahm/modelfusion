import { TokenizationSupport } from "text/index.js";

export interface TextGenerationModel<PROMPT, RAW_OUTPUT> {
  readonly provider: string;
  readonly model: string | null;

  generate: (
    prompt: PROMPT,
    context?: {
      abortSignal?: AbortSignal | undefined;
      userId?: string | undefined;
    }
  ) => PromiseLike<RAW_OUTPUT>;

  extractText: (output: RAW_OUTPUT) => PromiseLike<string>;
}

export interface TextGenerationModelWithTokenization<PROMPT, RAW_OUTPUT>
  extends TextGenerationModel<PROMPT, RAW_OUTPUT>,
    TokenizationSupport {
  countPromptTokens: (prompt: PROMPT) => PromiseLike<number>;
  withMaxTokens: (
    maxTokens: number
  ) => TextGenerationModelWithTokenization<PROMPT, RAW_OUTPUT>;
}
