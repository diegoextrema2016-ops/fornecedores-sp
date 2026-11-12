// Executado pelo GitHub Actions a cada 30 minutos. Lê os dados públicos, compara com o estado guardado
// e escreve em GITHUB_OUTPUT se deve disparar a publicação. Não grava nada no repositório.
import { readFile, writeFile, mkdir, appendFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname } from 'node:path';
import { loadData, fingerprint } from './dados.mjs';
import { decidir } from './decisao.mjs';

const ARQUIVO = process.env.ESTADO || 'estado/estado.json';

const estado = existsSync(ARQUIVO) ? JSON.parse(await readFile(ARQUIVO, 'utf8')) : null;
const atual = fingerprint(await loadData());
const { publicar, estado: novo, motivo } = decidir(estado, atual);

await mkdir(dirname(ARQUIVO), { recursive: true });
await writeFile(ARQUIVO, JSON.stringify(novo, null, 2));
if (process.env.GITHUB_OUTPUT) await appendFile(process.env.GITHUB_OUTPUT, `publicar=${publicar}\n`);
console.log(`Verificação: ${motivo}. Publicar: ${publicar}.`);
