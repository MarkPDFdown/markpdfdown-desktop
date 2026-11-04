-- OllamaClient speaks the /api/chat protocol, but older versions saved /generate suffixes (issue #72)
UPDATE "Provider" SET "suffix" = '/chat' WHERE "type" = 'ollama' AND "suffix" = '/generate';
UPDATE "Provider" SET "suffix" = '/api/chat' WHERE "type" = 'ollama' AND "suffix" = '/api/generate';
