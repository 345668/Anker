# Anker open-weights gateway: the only public face of a private vLLM engine (docs/architecture/53).
# Build: docker build -t anker-openweights-gateway services/openweights-gateway
# Run:   docker run -p 8080:8080 -e GATEWAY_API_KEYS=<key> -e ALLOWED_MODELS=Qwen/Qwen3-8B -e OW_UPSTREAM=http://vllm:8000 anker-openweights-gateway
FROM node:22-bookworm-slim
WORKDIR /app
COPY package.json server.mjs ./
USER node
EXPOSE 8080
CMD ["node", "server.mjs"]
