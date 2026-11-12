// Matriz de permissões: roda cada consulta como cada papel (igual à API, com JWT) e compara com o esperado.
// Uso: node tests/rls/matriz.mjs <socket_dir> <porta> <banco>
// Teste local apenas. Escritas são revertidas (rollback). Sai com código 1 se algo não bate.
import { execFileSync } from 'node:child_process';

const [SOCK, PORTA, BANCO] = process.argv.slice(2);
if (!SOCK || !PORTA || !BANCO) { console.error('uso: node tests/rls/matriz.mjs <socket_dir> <porta> <banco>'); process.exit(2); }

const ID = {
  sem: '00000000-0000-0000-0000-00000000a001',
  expirado: '00000000-0000-0000-0000-00000000a002',
  ativo: '00000000-0000-0000-0000-00000000a003',
  dono: '00000000-0000-0000-0000-00000000a004',
  admin: '00000000-0000-0000-0000-00000000a005',
};
const APROVADA = '10000000-0000-0000-0000-000000000001';

// Papéis: visitante (anon, sem login), cadastrados (authenticated com sub), build (papel de login do build).
const PAPEIS = {
  visitante: { role: 'anon', claims: '{"role":"anon"}' },
  sem_assinatura: { role: 'authenticated', claims: `{"sub":"${ID.sem}","role":"authenticated"}` },
  assinante_expirado: { role: 'authenticated', claims: `{"sub":"${ID.expirado}","role":"authenticated"}` },
  assinante_ativo: { role: 'authenticated', claims: `{"sub":"${ID.ativo}","role":"authenticated"}` },
  fornecedor_dono: { role: 'authenticated', claims: `{"sub":"${ID.dono}","role":"authenticated"}` },
  admin: { role: 'authenticated', claims: `{"sub":"${ID.admin}","role":"authenticated"}` },
  build_publico: { role: 'build_publico', claims: '{}' },
};

function psql(sql) {
  try {
    const out = execFileSync('psql', ['-h', SOCK, '-p', PORTA, '-U', 'postgres', '-d', BANCO, '-q', '-At', '-v', 'ON_ERROR_STOP=1', '-c', sql], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
    return out.trim().split('\n').filter(Boolean).pop() ?? '';
  } catch (err) {
    const erro = String(err.stderr || err.message);
    if (/permission denied|read-only transaction|row-level security|Você já tem um pagamento|Pedido inválido|Plano inválido/i.test(erro)) return 'negado';
    throw new Error(erro);
  }
}

function comoPapel(papel, consulta) {
  const p = PAPEIS[papel];
  const claims = p.claims.replace(/'/g, "''");
  // set role + JWT (request.jwt.claims) é exatamente o que o PostgREST faz por requisição.
  return `set role ${p.role}; select set_config('request.jwt.claims', '${claims}', false); ${consulta}`;
}

// Consultas. Escritas ficam dentro de transação revertida.
const SONDAGENS = {
  fornecedores_aprovados: { sql: "select count(*) from public.suppliers where approval_status = 'approved'" },
  fornecedores_todos: { sql: 'select count(*) from public.suppliers' },
  fotos: { sql: 'select count(*) from public.supplier_photos' },
  contatos: { sql: 'select count(*) from public.supplier_contacts' },
  categorias: { sql: 'select count(*) from public.categories' },
  subcategorias: { sql: 'select count(*) from public.subcategories' },
  bairros: { sql: 'select count(*) from public.regions' },
  assinaturas: { sql: 'select count(*) from public.subscriptions' },
  editar_fornecedores: { sql: 'begin; with u as (update public.suppliers set name = name returning id) select count(*) from u; rollback;' },
  apagar_fornecedores: { sql: 'begin; with d as (delete from public.suppliers returning id) select count(*) from d; rollback;' },
  rpc_contador_visita: { sql: `select public.increment_supplier_views('${APROVADA}')`, resultadoOk: true },
  // Burlas: promover-se a admin, criar pedido já ativo e ativar pedido existente.
  // Para cliente, o pedido SEMPRE entra como pendente (gatilho guard_subscription_insert). Admin pode criar ativo.
  escalar_perfil: { sql: "begin; with u as (update public.profiles set type = 'admin' where id = auth.uid() returning id) select count(*) from u; rollback;" },
  status_do_pedido_criado: { sql: "begin; with i as (insert into public.subscriptions (user_id, plan, amount, expires_at, status) values (auth.uid(), 'anual', 1, now() + interval '1 year', 'active') returning status) select status from i; rollback;" },
  ativar_pedido_proprio: { sql: "begin; with u as (update public.subscriptions set status = 'active', expires_at = now() + interval '1 year' where user_id = auth.uid() returning id) select count(*) from u; rollback;" },
};

// Papel do build: só a função de slugs deve funcionar.
const SONDAGENS_BUILD = {
  slugs: { sql: 'select count(*) from public.catalogo_slugs()' },
  ler_fornecedores: { sql: 'select count(*) from public.suppliers' },
  ler_categorias: { sql: 'select count(*) from public.categories' },
  ler_fotos: { sql: 'select count(*) from public.supplier_photos' },
  editar_fornecedores: { sql: "begin; update public.suppliers set name = name; rollback;" },
};

// Fatos do banco de teste (lidos como superusuário), para o esperado não ser chutado.
const fato = (sql) => psql(sql);
const F = {
  aprovados: Number(fato("select count(*) from public.suppliers where approval_status='approved'")),
  todos: Number(fato('select count(*) from public.suppliers')),
  fotos: Number(fato('select count(*) from public.supplier_photos')),
  fotosAprovadas: Number(fato("select count(*) from public.supplier_photos p join public.suppliers s on s.id=p.supplier_id where s.approval_status='approved'")),
  fotosDono: Number(fato(`select count(*) from public.supplier_photos p join public.suppliers s on s.id=p.supplier_id where s.owner_id='${ID.dono}'`)),
  contatos: Number(fato('select count(*) from public.supplier_contacts')),
  contatosAprovados: Number(fato("select count(*) from public.supplier_contacts c join public.suppliers s on s.id=c.supplier_id where s.approval_status='approved'")),
  contatosDono: Number(fato(`select count(*) from public.supplier_contacts c join public.suppliers s on s.id=c.supplier_id where s.owner_id='${ID.dono}'`)),
  proprios: Number(fato(`select count(*) from public.suppliers where owner_id='${ID.dono}'`)),
  categoriasAtivas: Number(fato("select count(*) from public.categories where status='active'")),
  categoriasTodas: Number(fato('select count(*) from public.categories')),
  subcategorias: Number(fato('select count(*) from public.subcategories')),
  bairros: Number(fato('select count(*) from public.regions')),
  assinaturasTodas: Number(fato('select count(*) from public.subscriptions')),
};
const SLUGS_ESPERADOS = F.categoriasAtivas + F.bairros + F.aprovados; // categorias ativas + bairros + aprovados não-demo

// Esperado por papel e sondagem. Um número, ou lista de aceitos ("negado" = a API recusa a consulta).
const ZERO = ['0', 'negado'];
const ESPERADO = {
  visitante: {
    fornecedores_aprovados: ZERO, fornecedores_todos: ZERO, fotos: ZERO, contatos: ZERO,
    categorias: ZERO, subcategorias: ZERO, bairros: ZERO, assinaturas: ZERO,
    editar_fornecedores: ZERO, apagar_fornecedores: ZERO, rpc_contador_visita: ['ok'],
    escalar_perfil: ZERO, status_do_pedido_criado: ['negado'], ativar_pedido_proprio: ZERO,
  },
  sem_assinatura: {
    fornecedores_aprovados: ['0'], fornecedores_todos: ['0'], fotos: ['0'], contatos: ['0'],
    categorias: [String(F.categoriasAtivas)], subcategorias: [String(F.subcategorias)], bairros: [String(F.bairros)],
    assinaturas: ['1'], editar_fornecedores: ['0'], apagar_fornecedores: ['0'], rpc_contador_visita: ['ok'], escalar_perfil: ZERO, status_do_pedido_criado: ['pending', 'negado'], ativar_pedido_proprio: ZERO,
  },
  assinante_expirado: {
    fornecedores_aprovados: ['0'], fornecedores_todos: ['0'], fotos: ['0'], contatos: ['0'],
    categorias: [String(F.categoriasAtivas)], subcategorias: [String(F.subcategorias)], bairros: [String(F.bairros)],
    assinaturas: ['1'], editar_fornecedores: ['0'], apagar_fornecedores: ['0'], rpc_contador_visita: ['ok'], escalar_perfil: ZERO, status_do_pedido_criado: ['pending', 'negado'], ativar_pedido_proprio: ZERO,
  },
  assinante_ativo: {
    fornecedores_aprovados: [String(F.aprovados)], fornecedores_todos: [String(F.aprovados)],
    fotos: [String(F.fotosAprovadas)], contatos: [String(F.contatosAprovados)],
    categorias: [String(F.categoriasAtivas)], subcategorias: [String(F.subcategorias)], bairros: [String(F.bairros)],
    assinaturas: ['1'], editar_fornecedores: ['0'], apagar_fornecedores: ['0'], rpc_contador_visita: ['ok'], escalar_perfil: ZERO, status_do_pedido_criado: ['pending', 'negado'], ativar_pedido_proprio: ZERO,
  },
  fornecedor_dono: {
    fornecedores_aprovados: ['0'], fornecedores_todos: [String(F.proprios)],
    fotos: [String(F.fotosDono)], contatos: [String(F.contatosDono)],
    categorias: [String(F.categoriasAtivas)], subcategorias: [String(F.subcategorias)], bairros: [String(F.bairros)],
    assinaturas: ['0'], editar_fornecedores: [String(F.proprios)], apagar_fornecedores: [String(F.proprios)], rpc_contador_visita: ['ok'], escalar_perfil: ZERO, status_do_pedido_criado: ['pending', 'negado'], ativar_pedido_proprio: ZERO,
  },
  admin: {
    fornecedores_aprovados: [String(F.aprovados)], fornecedores_todos: [String(F.todos)],
    fotos: [String(F.fotos)], contatos: [String(F.contatos)],
    categorias: [String(F.categoriasTodas)], subcategorias: [String(F.subcategorias)], bairros: [String(F.bairros)],
    assinaturas: [String(F.assinaturasTodas)], editar_fornecedores: [String(F.todos)], apagar_fornecedores: [String(F.todos)], rpc_contador_visita: ['ok'], escalar_perfil: ['1'], status_do_pedido_criado: ['active'], ativar_pedido_proprio: ['1'],
  },
  build_publico: {
    slugs: [String(SLUGS_ESPERADOS)], ler_fornecedores: ['negado'], ler_categorias: ['negado'], ler_fotos: ['negado'], editar_fornecedores: ['negado'],
  },
};

const resultados = [];
let falhas = 0;

function executa(papel, nome, sonda) {
  let obtido;
  try {
    const sql = papel === 'build_publico' ? sonda.sql : sonda.sql;
    const saida = psql(comoPapel(papel, sql));
    obtido = sonda.resultadoOk ? 'ok' : saida;
  } catch (err) {
    obtido = `erro: ${String(err.message).split('\n')[0]}`;
  }
  const aceitos = ESPERADO[papel][nome];
  const ok = aceitos.includes(obtido);
  if (!ok) falhas++;
  resultados.push({ papel, nome, obtido, aceitos, ok });
}

for (const nome of Object.keys(SONDAGENS)) for (const papel of Object.keys(PAPEIS).filter((p) => p !== 'build_publico')) executa(papel, nome, SONDAGENS[nome]);
for (const nome of Object.keys(SONDAGENS_BUILD)) executa('build_publico', nome, SONDAGENS_BUILD[nome]);

// Tabela: linhas = sondagens, colunas = papéis.
const papeis = Object.keys(PAPEIS);
const linhas = [...new Set(resultados.map((r) => r.nome))];
console.log(`Banco: ${BANCO}`);
console.log(`| Consulta | ${papeis.join(' | ')} |`);
console.log(`|---|${papeis.map(() => '---').join('|')}|`);
for (const nome of linhas) {
  const celulas = papeis.map((p) => {
    const r = resultados.find((x) => x.papel === p && x.nome === nome);
    if (!r) return '-';
    return `${r.ok ? '✅' : '❌'} ${r.obtido}`;
  });
  console.log(`| ${nome} | ${celulas.join(' | ')} |`);
}
console.log(`\nTotal: ${resultados.length} verificações, ${falhas} divergências.`);
if (falhas) {
  console.log('Divergências:');
  for (const r of resultados.filter((x) => !x.ok)) console.log(`  - ${r.papel} / ${r.nome}: obtido "${r.obtido}", esperado ${r.aceitos.join(' ou ')}`);
}
process.exit(falhas ? 1 : 0);
