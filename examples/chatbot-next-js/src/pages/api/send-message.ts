import {
  CohereTextGenerationModel,
  LlamaCppTextGenerationModel,
  OpenAIApiConfiguration,
  OpenAIChatModel,
  createEventSourceStream,
  mapChatPromptToLlama2Format,
  mapChatPromptToOpenAIChatFormat,
  mapChatPromptToTextFormat,
  streamText,
  trimChatPrompt,
} from "modelfusion";
import { z } from "zod";

export const config = { runtime: "edge" };

const messageSchame = z.object({
  role: z.enum(["user", "assistant"]),
  content: z.string(),
});

const requestSchema = z.array(messageSchame);

const gpt35turboModel = new OpenAIChatModel({
  // explicit API configuration needed for NextJS environment
  // (otherwise env variables are not available):
  api: new OpenAIApiConfiguration({
    apiKey: process.env.OPENAI_API_KEY,
  }),
  model: "gpt-3.5-turbo",
  maxCompletionTokens: 512,
}).withPromptFormat(mapChatPromptToOpenAIChatFormat());

// eslint-disable-next-line @typescript-eslint/no-unused-vars
const llama2Model = new LlamaCppTextGenerationModel({
  contextWindowSize: 4096, // Llama 2 context window size
  maxCompletionTokens: 512,
}).withPromptFormat(mapChatPromptToLlama2Format());

// eslint-disable-next-line @typescript-eslint/no-unused-vars
const otherLlamaCppModel = new LlamaCppTextGenerationModel({
  contextWindowSize: 2048, // set to your models context window size
  maxCompletionTokens: 512,
}).withPromptFormat(
  mapChatPromptToTextFormat({ user: "user", ai: "assistant" })
);

// eslint-disable-next-line @typescript-eslint/no-unused-vars
const cohereModel = new CohereTextGenerationModel({
  // explicit API configuration needed for NextJS environment
  // (otherwise env variables are not available):
  // api: new CohereApiConfiguration({
  //   apiKey: process.env.COHERE_API_KEY,
  // }),
  model: "command",
  maxCompletionTokens: 512,
}).withPromptFormat(
  mapChatPromptToTextFormat({ user: "user", ai: "assistant" })
);

const sendMessage = async (request: Request): Promise<Response> => {
  if (request.method !== "POST") {
    return new Response(
      JSON.stringify({
        error: `Method ${request.method} not allowed. Only POST allowed.`,
      }),
      { status: 405, headers: { "Content-Type": "application/json" } }
    );
  }

  const parsedData = requestSchema.safeParse(await request.json());

  if (parsedData.success === false) {
    return new Response(
      JSON.stringify({
        error: `Could not parse content. Error: ${parsedData.error}`,
      }),
      { status: 400, headers: { "Content-Type": "application/json" } }
    );
  }

  // forward the abort signal
  const controller = new AbortController();
  request.signal.addEventListener("abort", () => controller.abort());

  const messages = parsedData.data;

  const model = gpt35turboModel; // change this to your preferred model

  const textStream = await streamText(
    model,
    // limit the size of the prompt to leave room for the answer:
    await trimChatPrompt({
      model,
      prompt: [
        {
          system:
            "You are an AI chat bot. " +
            "Follow the user's instructions carefully. Respond using markdown.",
        },
        ...messages.map((message) =>
          message.role === "user"
            ? { user: message.content }
            : { ai: message.content }
        ),
      ],
    }),

    // forward the abort signal:
    { run: { abortSignal: controller.signal } }
  );

  return new Response(createEventSourceStream(textStream), {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
      "Content-Encoding": "none",
    },
  });
};

export default sendMessage;
