import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import test from 'node:test';

import {
  loadModelConnectorProfile,
  materializeModelConnector,
} from '../packages/runtime/dist/connectors/materialize-model.js';
import { createDefaultModelTransportRegistry } from '../packages/runtime/dist/model-protocols.js';

const configuration = (id, profile, parameters, environmentKeys = {}) => ({
  id,
  enabled: true,
  profile,
  parameters,
  environmentKeys,
  updatedAt: '2026-09-09T00:00:00Z',
});

const request = endpointId => ({
  contractVersion: '1.0.0',
  id: `request.${endpointId}`,
  endpointId,
  messages: [{ role: 'user', content: 'Hello' }],
  maxOutputTokens: 20,
  createdAt: '2026-09-09T00:00:00Z',
});

test('model profiles load as closed protocol-specific documents', () => {
  const chat = loadModelConnectorProfile('model-openai-chat-local');
  const responses = loadModelConnectorProfile('model-openai-responses-local');
  const anthropic = loadModelConnectorProfile('model-anthropic-messages-local');
  const hostedOpenai = loadModelConnectorProfile('model-openai-compatible-hosted');
  const hostedAnthropic = loadModelConnectorProfile('model-anthropic-compatible-hosted');
  assert.equal(chat.protocol, 'openai-chat-completions');
  assert.equal(responses.protocol, 'openai-responses');
  assert.equal(anthropic.protocol, 'anthropic-messages');
  assert.equal(hostedOpenai.adapterKind, 'provider-http');
  assert.equal(hostedAnthropic.adapterKind, 'provider-http');
});

test('local model profiles materialize complete existing ModelEndpoint documents', () => {
  const definition = {
    id: 'model.openai-chat.local', name: 'Local OpenAI Chat compatible', category: 'model', protocol: 'openai-chat-completions',
    platforms: ['any'], requirements: {}, profile: { kind: 'model-openai-chat-local' },
    compatibility: { status: 'experimental', note: 'profile path' }, provenance: 'first-party',
  };
  const endpoint = materializeModelConnector(definition, configuration(
    definition.id,
    definition.profile.kind,
    { url: 'http://127.0.0.1:1234/v1/chat/completions', model: 'local-model' },
  ));
  assert.equal(endpoint.contractVersion, '1.0.0');
  assert.equal(endpoint.adapterKind, 'local-inference');
  assert.equal(endpoint.protocol, 'openai-chat-completions');
  assert.equal(endpoint.url, 'http://127.0.0.1:1234/v1/chat/completions');
  assert.equal(endpoint.defaultModel, 'local-model');
  assert.deepEqual(endpoint.credentials ?? [], []);
});

test('hosted model profiles use environment-key credential references and never credential values', () => {
  const definition = {
    id: 'model.openai-compatible.hosted', name: 'Hosted OpenAI-compatible', category: 'model', protocol: 'openai-responses',
    platforms: ['any'], requirements: {}, profile: { kind: 'model-openai-compatible-hosted' },
    compatibility: { status: 'experimental', note: 'profile path' }, provenance: 'first-party',
  };
  const endpoint = materializeModelConnector(definition, configuration(
    definition.id,
    definition.profile.kind,
    { url: 'https://models.example.test/v1/responses', model: 'hosted-model' },
    { apiKey: 'HOSTED_MODEL_API_KEY' },
  ));
  assert.deepEqual(endpoint.credentials, [{ header: 'Authorization', environmentKey: 'HOSTED_MODEL_API_KEY', prefix: 'Bearer ' }]);
  assert.equal(JSON.stringify(endpoint).includes('actual-secret-value'), false);
});

test('model profile materialization rejects missing URL/model and insecure remote HTTP', () => {
  const definition = {
    id: 'model.openai-compatible.hosted', name: 'Hosted OpenAI-compatible', category: 'model', protocol: 'openai-responses',
    platforms: ['any'], requirements: {}, profile: { kind: 'model-openai-compatible-hosted' },
    compatibility: { status: 'experimental', note: 'profile path' }, provenance: 'first-party',
  };
  assert.throws(() => materializeModelConnector(definition, configuration(definition.id, definition.profile.kind, { model: 'x' })), /url/i);
  assert.throws(() => materializeModelConnector(definition, configuration(definition.id, definition.profile.kind, { url: 'https://example.test/v1/responses' })), /model/i);
  assert.throws(() => materializeModelConnector(definition, configuration(
    definition.id,
    definition.profile.kind,
    { url: 'http://models.example.test/v1/responses', model: 'x' },
    { apiKey: 'HOSTED_MODEL_API_KEY' },
  )), /http|secure|https/i);
});

test('materialized local profiles invoke all three existing model transports without source edits', async t => {
  const seen = [];
  const server = createServer(async (req, res) => {
    let raw = ''; for await (const chunk of req) raw += chunk;
    seen.push({ url: req.url, body: JSON.parse(raw) });
    res.setHeader('content-type', 'application/json');
    if (req.url === '/chat') res.end(JSON.stringify({ model: 'fixture', choices: [{ message: { content: 'chat-profile-ok' }, finish_reason: 'stop' }] }));
    else if (req.url === '/responses') res.end(JSON.stringify({ model: 'fixture', output: [{ type: 'message', content: [{ type: 'output_text', text: 'responses-profile-ok' }] }] }));
    else res.end(JSON.stringify({ model: 'fixture', content: [{ type: 'text', text: 'anthropic-profile-ok' }], stop_reason: 'end_turn' }));
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => server.close());
  const address = server.address(); assert.equal(typeof address, 'object');

  const cases = [
    ['model.openai-chat.local', 'model-openai-chat-local', 'openai-chat-completions', '/chat', 'chat-profile-ok'],
    ['model.openai-responses.local', 'model-openai-responses-local', 'openai-responses', '/responses', 'responses-profile-ok'],
    ['model.anthropic-messages.local', 'model-anthropic-messages-local', 'anthropic-messages', '/anthropic', 'anthropic-profile-ok'],
  ];
  const registry = createDefaultModelTransportRegistry();
  for (const [id, profile, protocol, path, expected] of cases) {
    const definition = {
      id, name: id, category: 'model', protocol, platforms: ['any'], requirements: {},
      profile: { kind: profile }, compatibility: { status: 'experimental', note: 'fixture' }, provenance: 'first-party',
    };
    const endpoint = materializeModelConnector(definition, configuration(id, profile, {
      url: `http://127.0.0.1:${address.port}${path}`,
      model: 'fixture',
    }));
    const response = await registry.invoke(endpoint, request(endpoint.id));
    assert.equal(response.outputText, expected);
  }
  assert.equal(seen.length, 3);
});
