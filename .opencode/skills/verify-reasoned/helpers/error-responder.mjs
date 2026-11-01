// A provider that rejects one request field with HTTP 400, for verifying that the app names the
// rejected field instead of reporting a bare invalid_request.
// Usage: node helpers/error-responder.mjs <port>   (bound to 127.0.0.1, same model list as the stub)
import http from 'node:http';

const HOST = '127.0.0.1';
const MODEL = 'stub-teach';
const FIELD = process.env.REASONED_REJECTED_FIELD ?? 'max_tokens';

const port = Number(process.argv[2]);
if (!Number.isInteger(port) || port < 1 || port > 65535) {
  console.error(`Port must be an integer from 1 to 65535. Got: ${process.argv[2]}`);
  process.exit(1);
}

function record(line) {
  console.log(`${new Date().toISOString()} ${line}`);
}

function sendJson(res, status, body) {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(body));
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const parts = [];
    req.on('data', (piece) => parts.push(piece));
    req.on('end', () => resolve(Buffer.concat(parts).toString('utf8')));
    req.on('error', reject);
  });
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${HOST}:${port}`);

  if (req.method === 'GET' && url.pathname === '/v1/models') {
    record(`GET ${url.pathname} 200 models=1`);
    sendJson(res, 200, { object: 'list', data: [{ id: MODEL, object: 'model' }] });
    return;
  }

  if (req.method === 'POST' && url.pathname === '/v1/chat/completions') {
    const raw = await readBody(req);
    let model = '?';
    try {
      model = JSON.parse(raw).model ?? '?';
    } catch {
      model = 'unparseable';
    }
    record(`POST ${url.pathname} 400 model=${model} bytes=${raw.length} error=${JSON.stringify({ type: 'invalid_request_error', param: FIELD })}`);
    sendJson(res, 400, {
      error: {
        message: 'This endpoint does not accept that request field.',
        type: 'invalid_request_error',
        param: FIELD,
      },
    });
    return;
  }

  record(`${req.method} ${url.pathname} 404`);
  sendJson(res, 404, { error: { message: 'not found', type: 'invalid_request_error' } });
});

server.on('error', (error) => {
  console.error(error.code === 'EADDRINUSE' ? `Port ${port} is already in use.` : String(error));
  process.exit(1);
});

server.listen(port, HOST, () => {
  record(`LISTEN http://${HOST}:${port}/v1 ready rejects ${FIELD}`);
});
