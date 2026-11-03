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

// Cria o servidor HTTP nativo
const server = http.createServer(async (req, res) => {
  // Configuração de CORS para qualquer requisição
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS, PUT, DELETE');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    return res.end();
  }

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
        let body = '';
        req.on('data', chunk => { body += chunk; });
        req.on('end', () => {
          try {
            req.body = body ? JSON.parse(body) : {};
          } catch (e) {
            req.body = {};
          }
          console.log(`[HTTP BODY]`, req.body);
          route.handler(req, res);
        });
        return;
      }

      req.query = Object.fromEntries(parsedUrl.searchParams.entries());
      return route.handler(req, res);
    }

    res.statusCode = 404;
    return res.json({ success: false, error: 'Endpoint não encontrado' });
  }

  // 2. Servir arquivos estáticos do frontend
  let relativeFilePath = pathname === '/' ? 'index.html' : pathname.replace(/^\/+/, '');
  let filePath = path.join(FRONTEND_DIR, relativeFilePath);

  // Prevenção de Path Traversal
  if (!filePath.startsWith(FRONTEND_DIR)) {
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

server.listen(config.port, () => {
  console.log(`\n======================================================`);
  console.log(`🚀 ${config.appName} v${config.appVersion} iniciado com sucesso!`);
  console.log(`💻 Painel Web: http://localhost:${config.port}`);
  console.log(`📡 API REST:  http://localhost:${config.port}/api/specs`);
  console.log(`======================================================\n`);
});

