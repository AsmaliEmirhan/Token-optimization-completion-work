import { calculateTokenCost, calculateRequestCost } from './costEngine.js';
import { getModelPricing } from './pricing.js';

function runTests() {
  console.log('--- Running Cost Engine Unit Tests ---');
  let testsPassed = 0;

  function assert(condition: boolean, msg: string) {
    if (!condition) {
      console.error(`FAIL: ${msg}`);
      throw new Error(`Assertion failed: ${msg}`);
    }
    testsPassed++;
  }

  // 1. Exact model pricing lookup
  const gpt4oPricing = getModelPricing('openai', 'gpt-4o');
  assert(gpt4oPricing !== null, 'gpt-4o pricing should be found');
  assert(gpt4oPricing?.inputPerMillionTokens === 2.50, 'gpt-4o input price should be 2.50');
  assert(gpt4oPricing?.outputPerMillionTokens === 10.00, 'gpt-4o output price should be 10.00');

  // Exact model alias lookup
  const gpt4oAlias = getModelPricing('openai', 'gpt-4o-2024-08-06');
  assert(gpt4oAlias !== null, 'gpt-4o alias should be found');
  assert(gpt4oAlias?.inputPerMillionTokens === 2.50, 'gpt-4o alias should map to canonical price');

  // Case and whitespace insensitivity
  const geminiFlash = getModelPricing('Gemini', ' gemini-2.0-flash ');
  assert(geminiFlash !== null, 'gemini-2.0-flash should be found with trim and case insensitive');
  assert(geminiFlash?.inputPerMillionTokens === 0.10, 'gemini-2.0-flash input price should be 0.10');

  // 2. Unknown model returns null (never fake or 0)
  const unknownPricing = getModelPricing('openai', 'gpt-unknown-future-model');
  assert(unknownPricing === null, 'unknown model should return null');

  const unknownProvider = getModelPricing('mystery-provider', 'some-model');
  assert(unknownProvider === null, 'unknown provider should return null');

  // 3. calculateTokenCost pure function
  // Formula: (tokens / 1_000_000) * pricePerMillion
  // 1,000,000 tokens @ $2.50 -> $2.50
  assert(calculateTokenCost(1_000_000, 2.50) === 2.50, '1M tokens @ 2.50 should equal 2.50');

  // 100,000 tokens @ $10.00 -> $1.00
  assert(calculateTokenCost(100_000, 10.00) === 1.00, '100k tokens @ 10.00 should equal 1.00');

  // 24 tokens @ $0.075 -> (24 / 1_000_000) * 0.075 = 0.0000018
  const smallCost = calculateTokenCost(24, 0.075);
  assert(smallCost !== null && Math.abs(smallCost - 0.0000018) < 1e-10, 'Small token calculation precision check');

  // Null tokens or null price -> null
  assert(calculateTokenCost(null, 2.50) === null, 'null tokens should return null');
  assert(calculateTokenCost(1000, null) === null, 'null price should return null');
  assert(calculateTokenCost(null, null) === null, 'both null should return null');
  assert(calculateTokenCost(-10, 2.50) === null, 'negative tokens should return null');

  // 0 tokens -> 0 cost
  assert(calculateTokenCost(0, 2.50) === 0, '0 tokens should return 0 cost');

  // 4. calculateRequestCost for known model (gpt-4o)
  // Input: 1,000 tokens ($2.50/M) -> $0.0025
  // Output: 500 tokens ($10.00/M) -> $0.0050
  // Thinking: null
  // Total: $0.0075
  const gptCost = calculateRequestCost('openai', 'gpt-4o', {
    inputTokens: 1000,
    outputTokens: 500,
    thinkingTokens: null,
    totalTokens: 1500,
  });

  assert(gptCost.inputCost === 0.0025, 'gpt-4o inputCost should be 0.0025');
  assert(gptCost.outputCost === 0.0050, 'gpt-4o outputCost should be 0.0050');
  assert(gptCost.totalCost === 0.0075, 'gpt-4o totalCost should be 0.0075');

  // 5. Unknown model safe null
  const unpricedCost = calculateRequestCost('unknown-provider', 'unknown-model', {
    inputTokens: 1000,
    outputTokens: 500,
    thinkingTokens: null,
    totalTokens: 1500,
  });
  assert(unpricedCost.inputCost === null, 'unpriced model inputCost must be null');
  assert(unpricedCost.outputCost === null, 'unpriced model outputCost must be null');
  assert(unpricedCost.totalCost === null, 'unpriced model totalCost must be null');

  // 6. Null inputTokens or null outputTokens
  const partialNullCost = calculateRequestCost('openai', 'gpt-4o', {
    inputTokens: null,
    outputTokens: 500,
    thinkingTokens: null,
    totalTokens: 500,
  });
  assert(partialNullCost.inputCost === null, 'null inputTokens produces null inputCost');
  assert(partialNullCost.outputCost === 0.005, 'known outputTokens produces outputCost');
  assert(partialNullCost.totalCost === null, 'missing inputCost must cause totalCost to be null');

  // 7. Thinking tokens billing safety:
  // Gemini 2.0 Flash: thinkingBillingMode: 'included_in_output'
  // Input: 200 tokens ($0.10/M) -> $0.00002
  // Output: 100 tokens ($0.40/M) -> $0.00004
  // Thinking: 50 tokens (included in output)
  // Total: 0.00006
  const geminiCost = calculateRequestCost('gemini', 'gemini-2.0-flash', {
    inputTokens: 200,
    outputTokens: 100,
    thinkingTokens: 50,
    totalTokens: 300,
  });
  assert(geminiCost.inputCost !== null && Math.abs(geminiCost.inputCost - 0.00002) < 1e-10, 'gemini input cost');
  assert(geminiCost.outputCost !== null && Math.abs(geminiCost.outputCost - 0.00004) < 1e-10, 'gemini output cost');
  assert(geminiCost.totalCost !== null && Math.abs(geminiCost.totalCost - 0.00006) < 1e-10, 'gemini total cost with included thinking');

  // Groq Llama 3 70B
  // Input: 10,000 tokens ($0.59/M) -> $0.0059
  // Output: 2,000 tokens ($0.79/M) -> $0.00158
  // Total: $0.00748
  const groqCost = calculateRequestCost('groq', 'llama3-70b-8192', {
    inputTokens: 10_000,
    outputTokens: 2_000,
    thinkingTokens: null,
    totalTokens: 12_000,
  });
  assert(groqCost.inputCost !== null && Math.abs(groqCost.inputCost - 0.0059) < 1e-10, 'groq input cost');
  assert(groqCost.outputCost !== null && Math.abs(groqCost.outputCost - 0.00158) < 1e-10, 'groq output cost');
  assert(groqCost.totalCost !== null && Math.abs(groqCost.totalCost - 0.00748) < 1e-10, 'groq total cost');

  console.log(`ALL ${testsPassed} ASSERTIONS PASSED!`);
}

runTests();
