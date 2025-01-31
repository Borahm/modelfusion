import dotenv from "dotenv";
import {
  DefaultRun,
  OpenAICostCalculator,
  OpenAITextEmbeddingModel,
  calculateCost,
  embed,
  embedMany,
} from "modelfusion";

dotenv.config();

async function main() {
  const run = new DefaultRun();

  const embeddings = await embedMany(
    new OpenAITextEmbeddingModel({ model: "text-embedding-ada-002" }),
    [
      "At first, Nox didn't know what to do with the pup.",
      "He keenly observed and absorbed everything around him, from the birds in the sky to the trees in the forest.",
    ],
    { run }
  );

  const embeddings2 = await embed(
    new OpenAITextEmbeddingModel({ model: "text-embedding-ada-002" }),
    "At first, Nox didn't know what to do with the pup.",
    { run }
  );

  const cost = await calculateCost({
    calls: run.successfulModelCalls,
    costCalculators: [new OpenAICostCalculator()],
  });

  console.log(`Cost: ${cost.formatAsDollarAmount({ decimals: 6 })}`);
}

main().catch(console.error);
