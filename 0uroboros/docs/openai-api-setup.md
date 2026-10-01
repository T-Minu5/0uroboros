# OpenAI API Setup

Phase 0 connection test plus Swarm v2.0 planning runtime env. This is not an execution swarm.

## 1. Create API key

Create an OpenAI API project key at https://platform.openai.com/api-keys.

A ChatGPT subscription is not an API key. API usage has separate billing.

## 2. Create local environment file

Copy `.env.example` to `.env` in the repository root, then populate:

```env
OPENAI_API_KEY=
OPENAI_TEST_MODEL=
ASTRA_MODEL=gpt-6-astra
ENGINEERING_MODEL=gpt-5.6-sol
SPECIALIST_MODEL=gpt-5.6-terra
UTILITY_MODEL=gpt-5.6-luna
ALLOW_MODEL_FALLBACK=false
```

`.env` is gitignored. Do not commit it.

If `OPENAI_TEST_MODEL` is empty, the smoke test uses `gpt-5.6-luna` (current official Agents SDK default and cost-sensitive GPT-5.6 text model). Set the variable if that model is unavailable to your API project.

## 3. Run test

```bash
npm run openai:test
npm run swarm:smoke
```

The command loads `.env`, validates `OPENAI_API_KEY`, makes one Agents SDK request, and prints the model and response.

## 4. Expected result

```text
0uroboros OpenAI API Test

Model: gpt-5.6-luna (default gpt-5.6-luna; set OPENAI_TEST_MODEL to override)

OpenAI connection successful.

Response:
0uroboros OpenAI connection confirmed.

Agents SDK tracing is enabled by default.
You can inspect this run in the OpenAI dashboard Trace viewer.
```

The default-model note appears only when `OPENAI_TEST_MODEL` is unset.

## 5. Troubleshooting

- **Authentication:** the project key is missing, invalid, or revoked. Edit `.env`. Do not paste the key into chat.
- **Model access:** API project access can differ from ChatGPT. Set `OPENAI_TEST_MODEL` to a model your project can call.
- **Billing/quota:** enable billing and credits on the OpenAI API project. ChatGPT Plus does not fund the API.
- **Network:** the process could not reach `api.openai.com`. Check connectivity and proxies.
