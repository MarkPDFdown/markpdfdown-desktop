-- The dropdown no longer offers /api/chat: on a base ending in /api it requests /api/api/chat, and on any other base the model list (base + /tags) fails.
-- Move every saved /api/chat to the one shape where both work: a base ending in /api with the /chat suffix.
-- A base that already ends in /api, or is unset (the runtime default ends in /api), only needs the suffix changed.
UPDATE "Provider" SET "base_url" = RTRIM("base_url", '/'), "suffix" = '/chat'
WHERE "type" = 'ollama' AND "suffix" = '/api/chat'
  AND (COALESCE("base_url", '') = '' OR RTRIM("base_url", '/') GLOB '*/api');
-- Any other base moves /api out of the suffix, so the chat endpoint stays the same URL.
UPDATE "Provider" SET "base_url" = RTRIM("base_url", '/') || '/api', "suffix" = '/chat'
WHERE "type" = 'ollama' AND "suffix" = '/api/chat';
