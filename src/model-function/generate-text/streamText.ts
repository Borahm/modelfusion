import { nanoid as createId } from "nanoid";
import { FunctionEventSource } from "../../core/FunctionEventSource.js";
import { getGlobalFunctionLogging } from "../../core/GlobalFunctionLogging.js";
import { getGlobalFunctionObservers } from "../../core/GlobalFunctionObservers.js";
import { AbortError } from "../../core/api/AbortError.js";
import { getFunctionCallLogger } from "../../core/getFunctionCallLogger.js";
import { startDurationMeasurement } from "../../util/DurationMeasurement.js";
import { runSafe } from "../../util/runSafe.js";
import { AsyncIterableResultPromise } from "../AsyncIterableResultPromise.js";
import { DeltaEvent } from "../DeltaEvent.js";
import { ModelFunctionOptions } from "../ModelFunctionOptions.js";
import { ModelCallMetadata } from "../executeCall.js";
import {
  TextGenerationModel,
  TextGenerationModelSettings,
} from "./TextGenerationModel.js";
import {
  TextStreamingFinishedEvent,
  TextStreamingStartedEvent,
} from "./TextStreamingEvent.js";

export function streamText<
  PROMPT,
  FULL_DELTA,
  SETTINGS extends TextGenerationModelSettings,
>(
  model: TextGenerationModel<PROMPT, unknown, FULL_DELTA, SETTINGS> & {
    generateDeltaStreamResponse: (
      prompt: PROMPT,
      options: ModelFunctionOptions<SETTINGS>
    ) => PromiseLike<AsyncIterable<DeltaEvent<FULL_DELTA>>>;
    extractTextDelta: (fullDelta: FULL_DELTA) => string | undefined;
  },
  prompt: PROMPT,
  options?: ModelFunctionOptions<SETTINGS>
): AsyncIterableResultPromise<string> {
  return new AsyncIterableResultPromise<string>(
    doStreamText(model, prompt, options)
  );
}

async function doStreamText<
  PROMPT,
  FULL_DELTA,
  SETTINGS extends TextGenerationModelSettings,
>(
  model: TextGenerationModel<PROMPT, unknown, FULL_DELTA, SETTINGS> & {
    generateDeltaStreamResponse: (
      prompt: PROMPT,
      options: ModelFunctionOptions<SETTINGS>
    ) => PromiseLike<AsyncIterable<DeltaEvent<FULL_DELTA>>>;
    extractTextDelta: (fullDelta: FULL_DELTA) => string | undefined;
  },
  prompt: PROMPT,
  options?: ModelFunctionOptions<SETTINGS>
): Promise<{
  output: AsyncIterable<string>;
  metadata: Omit<ModelCallMetadata, "durationInMs" | "finishTimestamp">;
}> {
  if (options?.settings != null) {
    model = model.withSettings(options.settings);
    options = {
      functionId: options.functionId,
      observers: options.observers,
      run: options.run,
    };
  }

  const run = options?.run;
  const settings = model.settings;

  const eventSource = new FunctionEventSource({
    observers: [
      ...getFunctionCallLogger(options?.logging ?? getGlobalFunctionLogging()),
      ...getGlobalFunctionObservers(),
      ...(settings.observers ?? []),
      ...(run?.functionObserver != null ? [run.functionObserver] : []),
      ...(options?.observers ?? []),
    ],
    errorHandler: run?.errorHandler,
  });

  const durationMeasurement = startDurationMeasurement();

  const startMetadata = {
    functionType: "text-streaming" as const,

    callId: `call-${createId()}`,
    runId: run?.runId,
    sessionId: run?.sessionId,
    userId: run?.userId,
    functionId: options?.functionId,

    model: model.modelInformation,
    settings: model.settingsForEvent,
    input: prompt,

    timestamp: durationMeasurement.startDate,
    startTimestamp: durationMeasurement.startDate,
  };

  eventSource.notify({
    eventType: "started",
    ...startMetadata,
  } satisfies TextStreamingStartedEvent);

  const result = await runSafe(async () => {
    const deltaIterable = await model.generateDeltaStreamResponse(prompt, {
      functionId: options?.functionId,
      settings, // options.setting is null here because of the initial guard
      run,
    });

    return (async function* () {
      let accumulatedText = "";
      let lastFullDelta: FULL_DELTA | undefined;

      for await (const event of deltaIterable) {
        if (event?.type === "error") {
          const error = event.error;

          const finishMetadata = {
            eventType: "finished" as const,
            ...startMetadata,
            finishTimestamp: new Date(),
            durationInMs: durationMeasurement.durationInMs,
          };

          eventSource.notify(
            error instanceof AbortError
              ? {
                  ...finishMetadata,
                  result: {
                    status: "abort",
                  },
                }
              : {
                  ...finishMetadata,
                  result: {
                    status: "error",
                    error,
                  },
                }
          );

          throw error;
        }

        if (event?.type === "delta") {
          lastFullDelta = event.fullDelta;

          const delta = model.extractTextDelta(lastFullDelta);

          if (delta != null && delta.length > 0) {
            accumulatedText += delta;
            yield delta;
          }
        }
      }

      const finishMetadata = {
        eventType: "finished" as const,
        ...startMetadata,
        finishTimestamp: new Date(),
        durationInMs: durationMeasurement.durationInMs,
      };

      eventSource.notify({
        ...finishMetadata,
        result: {
          status: "success",
          response: lastFullDelta,
          output: accumulatedText,
        },
      } satisfies TextStreamingFinishedEvent);
    })();
  });

  if (!result.ok) {
    const finishMetadata = {
      eventType: "finished" as const,
      ...startMetadata,
      finishTimestamp: new Date(),
      durationInMs: durationMeasurement.durationInMs,
    };

    if (result.isAborted) {
      eventSource.notify({
        ...finishMetadata,
        result: {
          status: "abort",
        },
      });
      throw new AbortError();
    }

    eventSource.notify({
      ...finishMetadata,
      result: {
        status: "error",
        error: result.error,
      },
    });
    throw result.error;
  }

  return {
    output: result.output,
    metadata: startMetadata,
  };
}
