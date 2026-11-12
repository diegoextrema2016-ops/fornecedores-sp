// Leitura dos slugs do catálogo direto no PostgreSQL do Supabase, para o build e a verificação de alterações.
//
// Por que não usar a API REST: depois da migração 007, a chave anônima não lê mais o catálogo. O build usa um
// papel de login próprio (build_publico) que só pode executar public.catalogo_slugs(), que devolve tipo e slug.
// Nunca usa a service_role. Nenhum nome, descrição, foto ou contato chega ao build.
//
// Cliente mínimo do protocolo PostgreSQL, sem dependências (o npm não é usado neste projeto).
// Regras de segurança, todas com falha fechada:
// - só aceita o usuário build_publico;
// - só aceita sslmode=verify-full, com a CA fixada em SUPABASE_DB_CA (sem CA, não conecta);
// - sslmode=disable só para teste local (host de loopback e SPF_TESTE_BANCO_LOCAL=1);
// - autenticação somente SCRAM-SHA-256, com verificação da assinatura do servidor;
// - sessão somente leitura e com tempo limite de comando (startup options);
// - cada slug é validado antes de virar caminho de arquivo.
// A senha nunca entra em mensagem de erro, log ou arquivo.
import net from 'node:net';
import tls from 'node:tls';
import { createHash, createHmac, pbkdf2Sync, randomBytes, timingSafeEqual } from 'node:crypto';

export const USUARIO_DO_BUILD = 'build_publico';
const CONSULTA = 'select tipo, slug from public.catalogo_slugs()';
const TEMPO_LIMITE_MS = 15000;
const PROTOCOLO_V3 = 196608;
const PEDIDO_TLS = Buffer.from([0x00, 0x00, 0x00, 0x08, 0x04, 0xd2, 0x16, 0x2f]);
const SLUG = /^[a-z0-9][a-z0-9-]{0,99}$/;
const TIPOS = new Set(['categoria', 'regiao', 'fornecedor']);
const LOOPBACK = new Set(['localhost', '127.0.0.1', '::1']);

const hmac = (chave, texto) => createHmac('sha256', chave).update(texto).digest();
const sha256 = (dados) => createHash('sha256').update(dados).digest();
const cstr = (texto) => Buffer.concat([Buffer.from(texto, 'utf8'), Buffer.from([0])]);
const int32 = (n) => { const b = Buffer.alloc(4); b.writeInt32BE(n, 0); return b; };

function mensagem(tipo, corpo) {
  return Buffer.concat([Buffer.from(tipo, 'ascii'), int32(4 + corpo.length), corpo]);
}

// Resposta SCRAM-SHA-256 do cliente (RFC 5802 / RFC 7677). Função pura, testada com o vetor da RFC.
export function scramResposta({ senha, cnonce, primeiraBare, mensagemServidor }) {
  const campos = Object.fromEntries(mensagemServidor.split(',').map((p) => [p[0], p.slice(2)]));
  if (!campos.r || !campos.r.startsWith(cnonce) || !campos.s || !campos.i) throw new Error('Resposta de autenticação inválida do banco.');
  const iteracoes = Number(campos.i);
  if (!Number.isInteger(iteracoes) || iteracoes < 4096 || iteracoes > 1000000) throw new Error('Iterações SCRAM fora do intervalo aceito.');
  const salgada = pbkdf2Sync(senha.normalize('NFKC'), Buffer.from(campos.s, 'base64'), iteracoes, 32, 'sha256');
  const chaveCliente = hmac(salgada, 'Client Key');
  const chaveServidor = hmac(salgada, 'Server Key');
  const semProva = `c=biws,r=${campos.r}`;
  const authMessage = `${primeiraBare},${mensagemServidor},${semProva}`;
  const assinatura = hmac(sha256(chaveCliente), authMessage);
  const prova = Buffer.from(chaveCliente.map((byte, i) => byte ^ assinatura[i]));
  return {
    final: `${semProva},p=${prova.toString('base64')}`,
    assinaturaServidor: hmac(chaveServidor, authMessage).toString('base64'),
  };
}

// Lê a configuração do ambiente e recusa qualquer combinação insegura. Não imprime a URL.
export function configDoBanco(env = process.env) {
  const bruta = env.SUPABASE_BUILD_DB_URL;
  if (!bruta) {
    throw new Error('SUPABASE_BUILD_DB_URL não definida. O build precisa da credencial de leitura dos slugs (papel build_publico).');
  }
  let url;
  try { url = new URL(bruta); } catch { throw new Error('SUPABASE_BUILD_DB_URL está em formato inválido.'); }
  if (url.protocol !== 'postgresql:' && url.protocol !== 'postgres:') throw new Error('SUPABASE_BUILD_DB_URL deve começar com postgresql://.');
  const usuario = decodeURIComponent(url.username);
  if (usuario !== USUARIO_DO_BUILD) throw new Error(`O usuário do build deve ser ${USUARIO_DO_BUILD}.`);
  const senha = decodeURIComponent(url.password);
  if (!senha) throw new Error('SUPABASE_BUILD_DB_URL sem senha.');
  const host = url.hostname.replace(/^\[|\]$/g, '');
  const modo = url.searchParams.get('sslmode') || 'verify-full';
  let ca = null;
  if (modo === 'verify-full') {
    ca = (env.SUPABASE_DB_CA || '').replace(/\\n/g, '\n');
    if (!ca.includes('BEGIN CERTIFICATE')) throw new Error('SUPABASE_DB_CA não definida. A CA precisa estar fixada para conectar com verificação.');
  } else if (!(modo === 'disable' && LOOPBACK.has(host) && env.SPF_TESTE_BANCO_LOCAL === '1')) {
    throw new Error('sslmode não permitido. Use verify-full com SUPABASE_DB_CA.');
  }
  return {
    host,
    port: Number(url.port || 5432),
    usuario,
    senha,
    banco: decodeURIComponent(url.pathname.slice(1)) || 'postgres',
    modo,
    ca,
  };
}

function abrirSocket(cfg) {
  return new Promise((ok, falha) => {
    const tcp = net.createConnection({ host: cfg.host, port: cfg.port });
    tcp.setTimeout(TEMPO_LIMITE_MS, () => { tcp.destroy(); falha(new Error('Tempo esgotado ao conectar no banco.')); });
    tcp.once('error', falha);
    tcp.once('connect', async () => {
      try {
        if (cfg.modo === 'disable') return ok(tcp);
        tcp.write(PEDIDO_TLS);
        const [resposta] = await new Promise((r, f) => { tcp.once('data', r); tcp.once('error', f); });
        if (resposta !== 0x53) throw new Error('O banco não aceitou conexão TLS.');
        const seguro = tls.connect({ socket: tcp, servername: cfg.host, ca: cfg.ca, rejectUnauthorized: true, minVersion: 'TLSv1.2' });
        seguro.once('secureConnect', () => ok(seguro));
        seguro.once('error', (e) => falha(new Error(`Falha no TLS com o banco: ${e.code || 'erro'}.`)));
      } catch (e) { tcp.destroy(); falha(e); }
    });
  });
}

// Fila de mensagens do servidor. Entrega uma por vez, na ordem em que chegam.
function leitor(socket) {
  let pendente = Buffer.alloc(0);
  const prontas = [];
  let aguarda = null;
  let erro = null;
  const falhar = (e) => {
    erro = erro || e;
    if (aguarda) { const a = aguarda; aguarda = null; a.reject(erro); }
  };
  socket.on('data', (pedaco) => {
    pendente = Buffer.concat([pendente, pedaco]);
    while (pendente.length >= 5) {
      const tam = pendente.readInt32BE(1);
      if (tam < 4 || tam > 16 * 1024 * 1024) return falhar(new Error('Resposta inválida do banco.'));
      if (pendente.length < tam + 1) break;
      prontas.push({ tipo: String.fromCharCode(pendente[0]), corpo: pendente.subarray(5, tam + 1) });
      pendente = pendente.subarray(tam + 1);
    }
    if (aguarda && prontas.length) { const a = aguarda; aguarda = null; a.resolve(prontas.shift()); }
  });
  socket.on('error', falhar);
  socket.on('close', () => falhar(new Error('Conexão com o banco foi encerrada.')));
  socket.setTimeout(TEMPO_LIMITE_MS, () => { falhar(new Error('Tempo esgotado aguardando o banco.')); socket.destroy(); });
  return () => new Promise((resolve, reject) => {
    if (prontas.length) return resolve(prontas.shift());
    if (erro) return reject(erro);
    aguarda = { resolve, reject };
  });
}

function erroDoServidor(corpo) {
  let pos = 0;
  while (pos < corpo.length && corpo[pos] !== 0) {
    const campo = String.fromCharCode(corpo[pos++]);
    const fim = corpo.indexOf(0, pos);
    if (campo === 'M') return corpo.subarray(pos, fim).toString('utf8');
    pos = fim + 1;
  }
  return 'erro não detalhado';
}

function lerLinha(corpo) {
  const n = corpo.readInt16BE(0);
  const campos = [];
  let pos = 2;
  for (let i = 0; i < n; i++) {
    const tam = corpo.readInt32BE(pos);
    pos += 4;
    if (tam === -1) { campos.push(null); continue; }
    campos.push(corpo.subarray(pos, pos + tam).toString('utf8'));
    pos += tam;
  }
  return campos;
}

async function executarConsulta(cfg, socket) {
  const proximo = leitor(socket);
  const parametros = [
    ['user', cfg.usuario],
    ['database', cfg.banco],
    ['application_name', 'spf-build'],
    ['options', '-c statement_timeout=5000 -c default_transaction_read_only=on'],
  ];
  const partes = [int32(PROTOCOLO_V3)];
  for (const [chave, valor] of parametros) partes.push(cstr(chave), cstr(valor));
  partes.push(Buffer.from([0]));
  const corpoStartup = Buffer.concat(partes);
  socket.write(Buffer.concat([int32(corpoStartup.length + 4), corpoStartup]));

  let cnonce = null;
  let primeiraBare = null;
  let assinaturaEsperada = null;
  let autenticado = false;
  let consultaEnviada = false;
  const linhas = [];

  for (;;) {
    const m = await proximo();
    if (m.tipo === 'E') throw new Error(`Banco recusou a operação: ${erroDoServidor(m.corpo)}`);
    if (m.tipo === 'R') {
      const codigo = m.corpo.readInt32BE(0);
      if (codigo === 10) {
        const mecanismos = m.corpo.subarray(4).toString('utf8').split('\0').filter(Boolean);
        if (!mecanismos.includes('SCRAM-SHA-256')) throw new Error('O banco não oferece SCRAM-SHA-256.');
        cnonce = randomBytes(18).toString('base64');
        primeiraBare = `n=,r=${cnonce}`;
        const inicial = Buffer.from(`n,,${primeiraBare}`, 'utf8');
        socket.write(mensagem('p', Buffer.concat([cstr('SCRAM-SHA-256'), int32(inicial.length), inicial])));
      } else if (codigo === 11) {
        const r = scramResposta({ senha: cfg.senha, cnonce, primeiraBare, mensagemServidor: m.corpo.subarray(4).toString('utf8') });
        assinaturaEsperada = r.assinaturaServidor;
        socket.write(mensagem('p', Buffer.from(r.final, 'utf8')));
      } else if (codigo === 12) {
        const recebida = m.corpo.subarray(4).toString('utf8');
        const esperada = Buffer.from(`v=${assinaturaEsperada}`);
        const obtida = Buffer.from(recebida);
        if (obtida.length !== esperada.length || !timingSafeEqual(obtida, esperada)) throw new Error('Falha ao verificar o servidor do banco.');
      } else if (codigo === 0) {
        if (!assinaturaEsperada) throw new Error('O banco aceitou a conexão sem autenticação SCRAM.');
        autenticado = true;
      } else {
        throw new Error(`Método de autenticação não suportado pelo banco (${codigo}).`);
      }
    } else if (m.tipo === 'Z') {
      if (!autenticado) throw new Error('Conexão com o banco não autenticada.');
      if (!consultaEnviada) {
        consultaEnviada = true;
        socket.write(mensagem('Q', cstr(CONSULTA)));
      } else {
        socket.write(mensagem('X', Buffer.alloc(0)));
        return linhas;
      }
    } else if (m.tipo === 'D') {
      linhas.push(lerLinha(m.corpo));
    }
    // T (cabeçalho), C (fim do comando), S, K, N e demais: não são usados aqui.
  }
}

// Confere cada linha antes de usar. Um slug fora do formato interrompe o build (nada é publicado).
export function validarSlugs(linhas) {
  const grupos = { categoria: [], regiao: [], fornecedor: [] };
  for (const [tipo, slug] of linhas) {
    if (!TIPOS.has(tipo) || typeof slug !== 'string' || !SLUG.test(slug)) {
      throw new Error('Slug fora do formato esperado vindo do banco. O build foi interrompido.');
    }
    grupos[tipo].push({ slug });
  }
  if (!grupos.categoria.length || !grupos.regiao.length) {
    throw new Error('Categorias ou bairros vieram vazios. Verifique as permissões do papel build_publico antes de publicar.');
  }
  return grupos;
}

export async function lerSlugsDoCatalogo(env = process.env) {
  const cfg = configDoBanco(env);
  const socket = await abrirSocket(cfg);
  try {
    return validarSlugs(await executarConsulta(cfg, socket));
  } finally {
    socket.end();
  }
}
