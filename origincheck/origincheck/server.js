import http from 'node:http';
import express from 'express';
import { loadConfig } from './src/config.js';
import { createHandler } from './src/app.js';
import { createRateLimiter } from './src/ratelimit.js';
import { createSightengine } from './src/providers/sightengine.js';
import { createGptzero } from './src/providers/gptzero.js';
import { checkProvenance } from './src/provenance.js';

const config = loadConfig();
const providers = { image: createSightengine(), text: createGptzero() };
const limiter = createRateLimiter({ limit: config.ratelimitPerMinute });
const handler = createHandler({ config, providers, checkProvenance, limiter });

const app = express();
const PORT = process.env.PORT || 10000;

app.get("/", (req, res) => {
    res.send("Application is running!");
});

const server = http.createServer(handler);

server.requestTimeout = 60000;
server.headersTimeout = 15000;

server.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on port ${PORT}`);
});
