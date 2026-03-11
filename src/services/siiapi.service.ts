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

export interface SiiapiEdificio {
  id: number;
  name: string;
  centro_id: number;
  centro?: SiiapiCentro;
}

export interface SiiapiAula {
  id: number;
  name: string;
  edificio_id: number;
  edificio?: SiiapiEdificio;
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
 * Fetches all aulas and builds a lookup map: aula_id → SiiapiAula (with edificio embedded).
 */
export async function fetchAulaMap(): Promise<Map<number, SiiapiAula>> {
  console.log(`[SIIAPI] Fetching all aulas`);
  const aulas = await fetchAllPages<SiiapiAula>("/api/v1/aulas/");
  console.log(`[SIIAPI] Fetched ${aulas.length} aulas`);
  const map = new Map<number, SiiapiAula>();
  for (const aula of aulas) {
    map.set(aula.id, aula);
  }
  return map;
}
