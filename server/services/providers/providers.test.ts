import test from 'node:test';
import assert from 'node:assert/strict';
import { openaiProvider } from './openai.js';
import { geminiProvider } from './gemini.js';
import { groqProvider } from './groq.js';

for (const [name, provider] of [['openai', openaiProvider], ['groq', groqProvider], ['gemini', geminiProvider]] as const) {
  test(name + ': SDK isteği gerçek ağa çıkmadan bağlam/parametre/iptal sözleşmesini korur', async t => {
    const requests: Request[] = [];
    const payloads: Record<string, unknown>[] = [];
    t.mock.method(globalThis, 'fetch', async (input: string | URL | Request, init?: RequestInit) => {
      const request = new Request(input, init);
      requests.push(request);
      payloads.push(await request.json() as Record<string, unknown>);
      const body = name === 'gemini' ? {
        candidates: [{ content: { role: 'model', parts: [{ text: 'mock answer' }] }, finishReason: 'STOP' }],
        usageMetadata: { promptTokenCount: 10, candidatesTokenCount: 20, thoughtsTokenCount: 5, totalTokenCount: 35 },
      } : { choices: [{ message: { role: 'assistant', content: 'mock answer' }, finish_reason: 'stop' }],
        usage: { prompt_tokens: 10, completion_tokens: 20, total_tokens: 30, completion_tokens_details: { reasoning_tokens: 5 } } };
      return new Response(JSON.stringify(body), { headers: { 'Content-Type': 'application/json' } });
    });
    const controller = new AbortController();
    const answer = await provider.sendMessage({ apiKey: 'mock-not-real', model: 'mock-model', message: 'current',
      systemInstructions: 'system', conversation: [{ role: 'user', content: 'prior' }, { role: 'assistant', content: 'answer' }],
      generationParameters: { temperature: 0.2, topP: 0.8, maxOutputTokens: 50, stopSequences: ['END'], ...(name === 'gemini' ? {} : { seed: 7 }) },
      signal: controller.signal,
    });
    assert.equal(requests.length, 1);
    assert.equal(answer.content, 'mock answer');
    assert.equal(answer.cacheable, true);
    assert.equal(answer.usage.inputTokens, 10);
    assert.equal(answer.usage.thinkingTokens, 5);
    const payload = payloads[0];
    if (name === 'gemini') {
      assert.deepEqual(payload.contents, [
        { role: 'user', parts: [{ text: 'prior' }] }, { role: 'model', parts: [{ text: 'answer' }] },
        { role: 'user', parts: [{ text: 'current' }] },
      ]);
      assert.deepEqual(payload.systemInstruction, { role: 'system', parts: [{ text: 'system' }] });
      assert.deepEqual(payload.generationConfig, { temperature: 0.2, topP: 0.8, maxOutputTokens: 50, stopSequences: ['END'] });
    } else {
      assert.deepEqual(payload.messages, [{ role: 'system', content: 'system' }, { role: 'user', content: 'prior' },
        { role: 'assistant', content: 'answer' }, { role: 'user', content: 'current' }]);
      assert.equal(payload.seed, 7);
      assert.equal(payload.temperature, 0.2);
      assert.equal(payload.top_p, 0.8);
      assert.equal(payload.max_tokens, 50);
      assert.deepEqual(payload.stop, ['END']);
    }
    controller.abort();
    assert.equal(requests[0].signal.aborted, true);
  });

  test(name + ': provider hatası otomatik ücretli tekrar üretmez', async t => {
    let calls = 0;
    t.mock.method(globalThis, 'fetch', async () => {
      calls++;
      return new Response(JSON.stringify({ error: { message: 'mock unavailable' } }), { status: 503 });
    });
    await assert.rejects(provider.sendMessage({ apiKey: 'mock', model: 'mock-model', message: 'x' }));
    assert.equal(calls, 1);
  });
}
