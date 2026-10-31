# openweights-gateway

The only door to the language-model engine (docs/architecture/53 section 4.2). **The engine (vLLM) is never exposed to the internet**; this gateway is. It:

- needs an API key (`x-api-key`) on everything except `GET /health`;
- allows exactly `GET /v1/models`, `POST /v1/chat/completions`, `POST /v1/embeddings`;
- accepts only known fields, only models listed in `ALLOWED_MODELS`, no streaming, bounded `max_tokens` (4,096), at most 64 messages and 400,000 characters, 1 MB bodies;
- limits each key to `RATE_PER_MIN` requests a minute (default 120) and each call to `TIMEOUT_MS` (default 120 s);
- **never logs a prompt, an answer or a key**: one line per request with method, path, status, milliseconds and token counts.

```
GATEWAY_API_KEYS=<key1>,<key2> ALLOWED_MODELS=Qwen/Qwen3-8B OW_UPSTREAM=http://127.0.0.1:8000 node server.mjs
npm test        # node --test, with a fake engine; needs no GPU
```

Run it beside the engine on the GPU host (TLS in front of it, from the host's proxy). Nothing here has been run against a real vLLM: that is the first step of the P0 test.
