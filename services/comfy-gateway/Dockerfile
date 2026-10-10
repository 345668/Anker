# Anker ComfyUI gateway: the only public face of a private ComfyUI worker (docs/architecture/49).
# Build: docker build -t anker-comfy-gateway services/comfy-gateway
# Run:   docker run -p 8080:8080 -e GATEWAY_API_KEYS=<key> -e GATEWAY_ADMIN_KEY=<admin> -e ALLOWED_NODES=EmptyImage,SaveImage -e COMFY_UPSTREAM=http://comfyui:8188 anker-comfy-gateway
FROM node:22-bookworm-slim
WORKDIR /app
COPY package.json server.mjs ./
USER node
EXPOSE 8080
CMD ["node", "server.mjs"]
