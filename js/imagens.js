// Referências de imagens de fornecedores. Funções puras (sem rede), usadas pelo api.js e pelo store.
// No banco, logo_url e supplier_photos.url guardam a REFERÊNCIA no formato /object/public/<bucket>/<caminho>
// (a migração 006 exige esse formato). O bucket é privado: a exibição usa URLs assinadas, geradas a partir do caminho.
import { SUPABASE } from './config.js';

const BUCKET = SUPABASE.imageBucket;

// Caminho do arquivo dentro do bucket, a partir da referência. null se não for uma referência do bucket.
export function imagePathFromUrl(url = '', bucket = BUCKET) {
  const marker = `/object/public/${bucket}/`;
  const i = String(url || '').indexOf(marker);
  if (i < 0) return null;
  try {
    return decodeURIComponent(String(url).slice(i + marker.length));
  } catch {
    return null;
  }
}

// Todas as referências de imagem de um conjunto de linhas de fornecedores (logo e fotos).
export function imageRefsOf(rows = []) {
  return rows.flatMap((r) => [r.logo_url, ...(r.supplier_photos || []).map((p) => p.url)]).filter(Boolean);
}
