import config from "../config/config.js";

const BASE_URL = config.SIIAPI_URL;
const PAGE_SIZE = 100;

// ── SIIAPI Types ───────────────────────────────────────────────────────────────

export interface SiiapiCalendario {
  id: number;
  name: string;
  siiau_id: string;
}

export interface SiiapiCentro {
  id: number;
  name: string;
  siiau_id: string;
}

// As returned by /api/v1/aulas/ (edificio without centro)
export interface SiiapiAulaRaw {
  id: number;
  name: string;
  edificio_id: number;
  edificio?: {
    id: number;
    name: string;
    centro_id: number;
    // NOTE: centro is NOT embedded in the aulas endpoint response
  };
}

// As returned by /api/v1/edificios/ (includes full centro + aulas list)
export interface SiiapiEdificioFull {
  id: number;
  name: string;
  centro_id: number;
  centro: SiiapiCentro;
  aulas: Array<{ id: number; name: string; edificio_id: number }>;
}

// Resolved aula with full location hierarchy (built from edificios data)
export interface SiiapiAulaResolved {
  id: number;
  name: string;
  edificio: {
    id: number;
    name: string;
    centro: SiiapiCentro;
  };
}

export interface SiiapiMateria {
  id: number;
  name: string;
  clave: string;
  creditos: number;
}

export interface SiiapiProfesor {
  id: number;
  name: string;
}

export interface SiiapiClaseBasica {
  id: number;
  sesion: number;
  hora_inicio: string;
  hora_fin: string;
  dia: number;
  seccion_id: number;
  aula_id: number;
}

export interface SiiapiSeccion {
  id: number;
  name: string;
  nrc: string;
  cupos: number;
  cupos_disponibles: number;
  periodo_inicio: string;
  periodo_fin: string;
  centro_id: number;
  materia_id: number;
  profesor_id: number;
  calendario_id: number;
  centro?: SiiapiCentro;
  materia?: SiiapiMateria;
  profesor?: SiiapiProfesor;
  calendario?: SiiapiCalendario;
  clases?: SiiapiClaseBasica[];
}

interface PaginatedResponse<T> {
  total: number;
  results: T[];
}

// ── Helpers ────────────────────────────────────────────────────────────────────

async function fetchJson<T>(path: string): Promise<T> {
  const url = `${BASE_URL}${path}`;
  console.log(`[SIIAPI] GET ${url}`);
  const res = await fetch(url);
  if (!res.ok) {
    console.error(`[SIIAPI] Error ${res.status} ${res.statusText} — ${url}`);
    throw new Error(`SIIAPI request failed: ${res.status} ${res.statusText} — ${url}`);
  }
  return res.json() as Promise<T>;
}

/**
 * Fetches all pages of a paginated SIIAPI endpoint and returns all results.
 */
async function fetchAllPages<T>(
  path: string,
  extraParams: Record<string, string | number> = {}
): Promise<T[]> {
  const all: T[] = [];
  let skip = 0;
  let page = 1;

  while (true) {
    const params = new URLSearchParams({
      ...Object.fromEntries(
        Object.entries(extraParams).map(([k, v]) => [k, String(v)])
      ),
      skip: String(skip),
      limit: String(PAGE_SIZE),
    });

    console.log(`[SIIAPI] Fetching page ${page} of ${path} (skip=${skip}, limit=${PAGE_SIZE})`);
    const data = await fetchJson<PaginatedResponse<T>>(`${path}?${params.toString()}`);
    all.push(...data.results);

    console.log(`[SIIAPI] Page ${page}: got ${data.results.length} results (${all.length}/${data.total} total)`);

    if (all.length >= data.total || data.results.length === 0) break;
    skip += PAGE_SIZE;
    page++;
  }

  return all;
}

// ── Public API ─────────────────────────────────────────────────────────────────

/**
 * Fetches all secciones for a given calendario_id, with all related entities
 * embedded (materia, profesor, centro, calendario, clases).
 */
export async function fetchSeccionesByCalendario(
  calendarioId: number
): Promise<SiiapiSeccion[]> {
  console.log(`[SIIAPI] Fetching all secciones for calendario_id=${calendarioId}`);
  const secciones = await fetchAllPages<SiiapiSeccion>("/api/v1/secciones/", {
    calendario_id: calendarioId,
  });
  console.log(`[SIIAPI] Fetched ${secciones.length} secciones for calendario_id=${calendarioId}`);
  return secciones;
}

/**
 * Fetches all edificios and builds a lookup map: aula_id → SiiapiAulaResolved.
 * Uses /api/v1/edificios/ because it's the only endpoint that embeds both
 * the full centro object AND the aulas list in a single response.
 */
export async function fetchAulaMap(): Promise<Map<number, SiiapiAulaResolved>> {
  console.log(`[SIIAPI] Fetching all edificios to build aula lookup map`);
  const edificios = await fetchAllPages<SiiapiEdificioFull>("/api/v1/edificios/");
  console.log(`[SIIAPI] Fetched ${edificios.length} edificios`);

  const map = new Map<number, SiiapiAulaResolved>();

  for (const edificio of edificios) {
    if (!edificio.centro || !edificio.aulas?.length) {
      console.warn(`[SIIAPI] Edificio id=${edificio.id} skipped — missing centro or aulas`);
      continue;
    }
    for (const aula of edificio.aulas) {
      map.set(aula.id, {
        id: aula.id,
        name: aula.name,
        edificio: {
          id: edificio.id,
          name: edificio.name,
          centro: edificio.centro,
        },
      });
    }
  }

  console.log(`[SIIAPI] Aula map built with ${map.size} entries from ${edificios.length} edificios`);
  return map;
}
