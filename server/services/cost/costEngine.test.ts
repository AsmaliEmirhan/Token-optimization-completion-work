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
  const gemini35Pricing = getModelPricing('gemini', 'gemini-3.5-flash');
  assert(gemini35Pricing !== null, 'gemini-3.5-flash pricing should be found');
  assert(gemini35Pricing?.inputPerMillionTokens === 1.50, 'gemini-3.5-flash input price should be $1.50/M');
  assert(gemini35Pricing?.outputPerMillionTokens === 9.00, 'gemini-3.5-flash output price should be $9.00/M');
  assert(gemini35Pricing?.thinkingBillingMode === 'billed_at_output_rate', 'gemini-3.5-flash thinking should be billed_at_output_rate');
  assert(gemini35Pricing?.verifiedAt === '2026-10-07', 'gemini-3.5-flash verifiedAt should be current 2026 date');

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

  // --------------------------------------------------------------------------
  // TEST A: Gemini 3.5 Flash real scenario
  // inputTokens: 7, outputTokens: 23, thinkingTokens: 441
  // Official pricing: Input $1.50/1M, Output $9.00/1M (including thinking)
  // billableOutputTokens = 23 + 441 = 464
  // inputCost = 7 / 1M * 1.50 = 0.0000105
  // outputCost = 464 / 1M * 9.00 = 0.004176
  // totalCost = 0.0000105 + 0.004176 = 0.0041865
  // --------------------------------------------------------------------------
  const costA = calculateRequestCost('gemini', 'gemini-3.5-flash', {
    inputTokens: 7,
    outputTokens: 23,
    thinkingTokens: 441,
    totalTokens: 471,
  });

  assert(costA.pricingAvailable === true, 'costA pricingAvailable must be true');
  assert(costA.billableInputTokens === 7, 'costA billableInputTokens must be 7');
  assert(costA.billableOutputTokens === 464, 'costA billableOutputTokens must be 464 (23 + 441)');
  assert(costA.inputCost !== null && Math.abs(costA.inputCost - 0.0000105) < 1e-10, 'costA inputCost must equal 0.0000105');
  assert(costA.outputCost !== null && Math.abs(costA.outputCost - 0.004176) < 1e-10, 'costA outputCost must equal 0.004176');
  assert(costA.thinkingCost !== null && Math.abs(costA.thinkingCost - 0.003969) < 1e-10, 'costA thinkingCost must equal 0.003969');
  assert(costA.totalCost !== null && Math.abs(costA.totalCost - 0.0041865) < 1e-10, 'costA totalCost must equal 0.0041865');

  // --------------------------------------------------------------------------
  // TEST B: Model with no pricing -> safe null
  // --------------------------------------------------------------------------
  const costB = calculateRequestCost('gemini', 'gemini-unreleased-future-model', {
    inputTokens: 100,
    outputTokens: 50,
    thinkingTokens: 10,
    totalTokens: 160,
  });
  assert(costB.pricingAvailable === false, 'costB pricingAvailable must be false');
  assert(costB.inputCost === null, 'costB inputCost must be null');
  assert(costB.outputCost === null, 'costB outputCost must be null');
  assert(costB.totalCost === null, 'costB totalCost must be null');

  const costBProvider = calculateRequestCost('unknown-provider', 'unknown-model', {
    inputTokens: 100,
    outputTokens: 50,
    thinkingTokens: null,
    totalTokens: 150,
  });
  assert(costBProvider.pricingAvailable === false, 'costBProvider pricingAvailable must be false');
  assert(costBProvider.totalCost === null, 'costBProvider totalCost must be null');

  // --------------------------------------------------------------------------
  // TEST C: Null token metadata -> safe null
  // --------------------------------------------------------------------------
  const costC1 = calculateRequestCost('openai', 'gpt-4o', {
    inputTokens: null,
    outputTokens: 50,
    thinkingTokens: null,
    totalTokens: 50,
  });
  assert(costC1.inputCost === null, 'costC1 null inputTokens produces null inputCost');
  assert(costC1.outputCost === 0.0005, 'costC1 known outputTokens produces outputCost');
  assert(costC1.totalCost === null, 'costC1 totalCost must be null when inputCost is null');

  const costC2 = calculateRequestCost('openai', 'gpt-4o', {
    inputTokens: 100,
    outputTokens: null,
    thinkingTokens: null,
    totalTokens: 100,
  });
  assert(costC2.outputCost === null, 'costC2 null outputTokens produces null outputCost');
  assert(costC2.totalCost === null, 'costC2 totalCost must be null when outputCost is null');

  // --------------------------------------------------------------------------
  // TEST D: Thinking billed at output rate
  // --------------------------------------------------------------------------
  // gemini-2.0-flash: Input $0.10/M, Output $0.40/M
  // input: 1000, output: 500, thinking: 500
  // billableOutputTokens = 1000
  // inputCost = 1000 / 1M * 0.10 = 0.0001
  // outputCost = 1000 / 1M * 0.40 = 0.0004
  // totalCost = 0.0005
  const costD = calculateRequestCost('gemini', 'gemini-2.0-flash', {
    inputTokens: 1000,
    outputTokens: 500,
    thinkingTokens: 500,
    totalTokens: 2000,
  });
  assert(costD.billableOutputTokens === 1000, 'costD billableOutputTokens should be 1000');
  assert(costD.inputCost === 0.0001, 'costD inputCost should be 0.0001');
  assert(costD.outputCost === 0.0004, 'costD outputCost should be 0.0004');
  assert(costD.totalCost === 0.0005, 'costD totalCost should be 0.0005');

  // --------------------------------------------------------------------------
  // TEST E: Thinking already included in output tokens -> no double counting
  // --------------------------------------------------------------------------
  // openai:o1: Input $15.00/M, Output $60.00/M (thinking already inside completion_tokens)
  // input: 1000, output: 500 (includes 300 reasoning tokens)
  // billableOutputTokens must remain 500 (NOT 800!)
  // inputCost = 1000 / 1M * 15.00 = 0.015
  // outputCost = 500 / 1M * 60.00 = 0.030
  // totalCost = 0.045
  const costE = calculateRequestCost('openai', 'o1', {
    inputTokens: 1000,
    outputTokens: 500,
    thinkingTokens: 300,
    totalTokens: 1500,
  });
  assert(costE.billableOutputTokens === 500, 'costE billableOutputTokens must not double count thinking');
  assert(costE.outputCost === 0.030, 'costE outputCost should be 0.030');
  assert(costE.totalCost === 0.045, 'costE totalCost should be 0.045');

  // --------------------------------------------------------------------------
  // TEST F: Separate thinking rate architecture test
  // --------------------------------------------------------------------------
  // calculateTokenCost pure helper
  assert(calculateTokenCost(100_000, 5.00) === 0.50, 'calculateTokenCost separate rate 100k @ 5.00 = 0.50');
  assert(calculateTokenCost(null, 5.00) === null, 'calculateTokenCost null tokens returns null');

  // --------------------------------------------------------------------------
  // TEST G: Zero-token valid input -> valid 0 calculation, not unknown
  // --------------------------------------------------------------------------
  const costG = calculateRequestCost('gemini', 'gemini-3.5-flash', {
    inputTokens: 0,
    outputTokens: 0,
    thinkingTokens: 0,
    totalTokens: 0,
  });
  assert(costG.pricingAvailable === true, 'costG pricingAvailable must be true');
  assert(costG.inputCost === 0, 'costG inputCost must be 0, not null');
  assert(costG.outputCost === 0, 'costG outputCost must be 0, not null');
  assert(costG.totalCost === 0, 'costG totalCost must be 0, not null');

  // Groq pricing verification
  const groqCost = calculateRequestCost('groq', 'llama3-70b-8192', {
    inputTokens: 10_000,
    outputTokens: 2_000,
    thinkingTokens: null,
    totalTokens: 12_000,
  });
  assert(groqCost.pricingAvailable === true, 'groq pricingAvailable must be true');
  assert(groqCost.inputCost !== null && Math.abs(groqCost.inputCost - 0.0059) < 1e-10, 'groq input cost');
  assert(groqCost.outputCost !== null && Math.abs(groqCost.outputCost - 0.00158) < 1e-10, 'groq output cost');
  assert(groqCost.totalCost !== null && Math.abs(groqCost.totalCost - 0.00748) < 1e-10, 'groq total cost');

  console.log(`ALL ${testsPassed} ASSERTIONS PASSED!`);
}

runTests();
