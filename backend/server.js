// backend/server.js
const http = require('http');
const fs = require('fs');
const path = require('path');
const config = require('./src/config');
const routes = require('./src/routes/api');

const candidateFrontendPaths = [
  path.resolve(__dirname, '../frontend'),
  path.resolve(__dirname, './frontend'),
  path.join(process.resourcesPath || '', 'frontend')
];
const FRONTEND_DIR = candidateFrontendPaths.find(p => fs.existsSync(p)) || path.resolve(__dirname, '../frontend');

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff'
};

const HOST = '127.0.0.1';
const MAX_BODY_BYTES = 1024 * 1024;
const ALLOWED_HOSTS = new Set([`localhost:${config.port}`, `127.0.0.1:${config.port}`]);
const ALLOWED_ORIGINS = new Set([`http://localhost:${config.port}`, `http://127.0.0.1:${config.port}`]);

async function runHandler(route, req, res) {
  try {
    await route.handler(req, res);
  } catch (err) {
    console.error('[HTTP ERROR]', err);
    if (!res.headersSent) {
      res.statusCode = 500;
      res.json({ success: false, error: 'Erro interno no servidor' });
    }
  }
}

// Cria o servidor HTTP nativo
const server = http.createServer(async (req, res) => {
  // Segurança: o servidor só atende a própria interface do CWU App.
  // Sem CORS liberado, sites externos abertos no navegador não conseguem
  // disparar ações (ex.: encerrar processos) na API local.
  const host = (req.headers.host || '').toLowerCase();
  if (!ALLOWED_HOSTS.has(host)) {
    res.writeHead(403);
    return res.end('Host não permitido');
  }
  const origin = req.headers.origin;
  if (origin && !ALLOWED_ORIGINS.has(origin.toLowerCase())) {
    res.writeHead(403);
    return res.end('Origem não permitida');
  }
  if (req.method === 'OPTIONS') {
    res.writeHead(405);
    return res.end();
  }
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');

  const parsedUrl = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const pathname = parsedUrl.pathname;

  // Enriquecer response com utilitários tipo Express (.json e .status)
  res.status = (code) => {
    res.statusCode = code;
    return res;
  };

  res.json = (data) => {
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.end(JSON.stringify(data));
  };

  // 1. Roteamento de API
  if (pathname.startsWith('/api')) {
    console.log(`[HTTP REQ] ${req.method} ${pathname}`);
    const route = routes.find(r => r.method === req.method && r.path === pathname);

    if (route) {
      if (req.method === 'POST' || req.method === 'PUT') {
        // Exige JSON: força preflight CORS em requisições de outros sites (que é recusado)
        if (!String(req.headers['content-type'] || '').includes('application/json')) {
          res.statusCode = 415;
          return res.json({ success: false, error: 'Content-Type deve ser application/json' });
        }
        let body = '';
        let tooLarge = false;
        req.on('data', chunk => {
          body += chunk;
          if (body.length > MAX_BODY_BYTES) {
            tooLarge = true;
            req.destroy();
          }
        });
        req.on('end', () => {
          if (tooLarge) return;
          try {
            req.body = body ? JSON.parse(body) : {};
          } catch (e) {
            res.statusCode = 400;
            return res.json({ success: false, error: 'JSON inválido' });
          }
          runHandler(route, req, res);
        });
        return;
      }

      req.query = Object.fromEntries(parsedUrl.searchParams.entries());
      return runHandler(route, req, res);
    }

    res.statusCode = 404;
    return res.json({ success: false, error: 'Endpoint não encontrado' });
  }

  // 2. Servir arquivos estáticos do frontend
  let relativeFilePath = pathname === '/' ? 'index.html' : pathname.replace(/^\/+/, '');
  let filePath = path.join(FRONTEND_DIR, relativeFilePath);

  // Prevenção de Path Traversal
  if (!filePath.startsWith(FRONTEND_DIR + path.sep) && filePath !== FRONTEND_DIR) {
    res.statusCode = 403;
    return res.end('Acesso negado');
  }

  fs.stat(filePath, (err, stats) => {
    if (err || !stats.isFile()) {
      // Se não achar arquivo específico, fallback para index.html (SPA)
      filePath = path.join(FRONTEND_DIR, 'index.html');
    }

    const ext = path.extname(filePath).toLowerCase();
    const contentType = MIME_TYPES[ext] || 'application/octet-stream';

    fs.readFile(filePath, (readErr, content) => {
      if (readErr) {
        res.statusCode = 500;
        return res.end('Erro interno ao ler arquivo');
      }

      res.writeHead(200, { 'Content-Type': contentType });
      res.end(content);
    });
  });
});

server.on('error', (e) => {
  if (e.code === 'EADDRINUSE') {
    console.log(`\n⚠️  A porta ${config.port} já está em uso por outra instância do CWU App.`);
    if (!process.versions.electron) {
      setTimeout(() => process.exit(0), 4000);
    }
  } else {
    console.error('Erro no servidor:', e);
    if (!process.versions.electron) {
      process.exit(1);
    }
  }
});

server.listen(config.port, HOST, () => {
  console.log(`\n======================================================`);
  console.log(`🚀 ${config.appName} v${config.appVersion} iniciado com sucesso!`);
  console.log(`💻 Painel Web: http://localhost:${config.port}`);
  console.log(`📡 API REST:  http://localhost:${config.port}/api/specs`);
  console.log(`======================================================\n`);
});

