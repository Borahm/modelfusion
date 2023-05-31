import {
  createJsonResponseHandler,
  postJsonToApi,
} from "../../../internal/postToApi.js";
import { failedOpenAICallResponseHandler } from "../internal/failedOpenAICallResponseHandler.js";
import {
  OpenAIChatCompletion,
  OpenAIChatMessage,
  openAIChatCompletionSchema,
} from "./OpenAIChatCompletion.js";
import { OpenAIChatModelType } from "./OpenAIChatModel.js";

/**
 * Call the OpenAI chat completion API to generate a chat completion for the messages.
 *
 * @see https://platform.openai.com/docs/api-reference/chat/create
 *
 * @example
 * const response = await generateOpenAIChatCompletion({
 *   apiKey: OPENAI_API_KEY,
 *   model: "gpt-3.5-turbo",
 *   messages: [
 *     {
 *       role: "system",
 *       content:
 *         "You are an AI assistant. Follow the user's instructions carefully.",
 *     },
 *     {
 *       role: "user",
 *       content: "Hello, how are you?",
 *     },
 *   ],
 *   temperature: 0.7,
 *   maxCompletionTokens: 500,
 * });
 *
 * console.log(response.choices[0].message.content);
 */
export async function generateOpenAIChatCompletion({
  baseUrl = "https://api.openai.com/v1",
  abortSignal,
  apiKey,
  model,
  messages,
  temperature,
  topP,
  n,
  stop,
  maxCompletionTokens,
  presencePenalty,
  frequencyPenalty,
  user,
}: {
  baseUrl?: string;
  abortSignal?: AbortSignal;
  apiKey: string;
  model: OpenAIChatModelType;
  messages: Array<OpenAIChatMessage>;
  temperature?: number;
  topP?: number;
  n?: number;
  stop?: string | string[];
  maxCompletionTokens?: number;
  presencePenalty?: number;
  frequencyPenalty?: number;
  user?: string;
}): Promise<OpenAIChatCompletion> {
  return postJsonToApi({
    url: `${baseUrl}/chat/completions`,
    apiKey,
    body: {
      model,
      messages,
      top_p: topP,
      n,
      stop,
      max_tokens: maxCompletionTokens,
      temperature,
      presence_penalty: presencePenalty,
      frequency_penalty: frequencyPenalty,
      user,
    },
    failedResponseHandler: failedOpenAICallResponseHandler,
    successfulResponseHandler: createJsonResponseHandler(
      openAIChatCompletionSchema
    ),
    abortSignal,
  });
}
