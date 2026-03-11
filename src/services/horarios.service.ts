import config from "../config/config.js";
import { ClaseModel, type IClase, type ClaseData } from "../models/clase.model.js";
import { CacheEntryModel } from "../models/cache.model.js";
import {
  fetchSeccionesByCalendario,
  fetchAulaMap,
  type SiiapiSeccion,
  type SiiapiAula,
} from "./siiapi.service.js";

// ── Types ──────────────────────────────────────────────────────────────────────

export interface HorariosFilter {
  calendario_id: number;
  centro_id?: number;
  edificio_id?: number;
  aula_id?: number;
}

export interface HorariosResult {
  total: number;
  results: IClase[];
  from_cache: boolean;
  stale: boolean;
}

// ── Cache helpers ──────────────────────────────────────────────────────────────

function getTTLMs(): number {
  return config.CACHE_TTL_MINUTES * 60 * 1000;
}

async function isCacheValid(calendarioId: number): Promise<boolean | null> {
  const entry = await CacheEntryModel.findOne({ calendario_id: calendarioId }).lean();
  if (!entry) return null; // no cache at all
  return new Date() < entry.expires_at; // true = fresh, false = stale
}

// ── Sync from SIIAPI ───────────────────────────────────────────────────────────

/**
 * Fetches all data for a calendario from SIIAPI and upserts into MongoDB.
 * Updates the cache_entry on completion.
 */
async function syncCalendario(calendarioId: number): Promise<void> {
  // Mark as refreshing to prevent concurrent syncs
  await CacheEntryModel.findOneAndUpdate(
    { calendario_id: calendarioId },
    { $set: { is_refreshing: true } },
    { upsert: true }
  );

  try {
    // Fetch in parallel: secciones and aulas
    const [secciones, aulaMap] = await Promise.all([
      fetchSeccionesByCalendario(calendarioId),
      fetchAulaMap(),
    ]);

    const claseDocuments = buildClaseDocuments(secciones, aulaMap);

    if (claseDocuments.length > 0) {
      // Upsert all clase documents by siiapi_id
      const ops = claseDocuments.map((doc) => ({
        updateOne: {
          filter: { siiapi_id: doc.siiapi_id },
          update: { $set: doc },
          upsert: true,
        },
      }));
      await ClaseModel.bulkWrite(ops, { ordered: false });
    }

    const now = new Date();
    await CacheEntryModel.findOneAndUpdate(
      { calendario_id: calendarioId },
      {
        $set: {
          fetched_at: now,
          expires_at: new Date(now.getTime() + getTTLMs()),
          total_clases: claseDocuments.length,
          is_refreshing: false,
        },
      },
      { upsert: true }
    );
  } catch (err) {
    // Release refreshing lock on error
    await CacheEntryModel.findOneAndUpdate(
      { calendario_id: calendarioId },
      { $set: { is_refreshing: false } }
    );
    throw err;
  }
}

/**
 * Transforms SIIAPI secciones + aula map into denormalized clase documents.
 */
function buildClaseDocuments(
  secciones: SiiapiSeccion[],
  aulaMap: Map<number, SiiapiAula>
): ClaseData[] {
  const docs: ClaseData[] = [];

  for (const seccion of secciones) {
    if (!seccion.clases?.length) continue;

    const calendario = seccion.calendario;
    const centro = seccion.centro;
    const materia = seccion.materia;
    const profesor = seccion.profesor;

    if (!calendario || !centro || !materia || !profesor) continue;

    for (const clase of seccion.clases) {
      const aula = aulaMap.get(clase.aula_id);
      const edificio = aula?.edificio;
      const edilCentro = edificio?.centro;

      if (!aula || !edificio || !edilCentro) continue;

      docs.push({
        siiapi_id: clase.id,
        sesion: clase.sesion,
        hora_inicio: clase.hora_inicio,
        hora_fin: clase.hora_fin,
        dia: clase.dia,
        // Flat filter fields
        calendario_id: calendario.id,
        centro_id: centro.id,
        edificio_id: edificio.id,
        aula_id: aula.id,
        seccion_id: seccion.id,
        // Embedded objects
        aula: {
          siiapi_id: aula.id,
          name: aula.name,
          edificio: {
            siiapi_id: edificio.id,
            name: edificio.name,
            centro: {
              siiapi_id: edilCentro.id,
              name: edilCentro.name,
              siiau_id: edilCentro.siiau_id,
            },
          },
        },
        seccion: {
          siiapi_id: seccion.id,
          name: seccion.name,
          nrc: seccion.nrc,
          cupos: seccion.cupos,
          cupos_disponibles: seccion.cupos_disponibles,
          periodo_inicio: new Date(seccion.periodo_inicio),
          periodo_fin: new Date(seccion.periodo_fin),
          materia: {
            siiapi_id: materia.id,
            name: materia.name,
            clave: materia.clave,
            creditos: materia.creditos,
          },
          profesor: {
            siiapi_id: profesor.id,
            name: profesor.name,
          },
          centro: {
            siiapi_id: centro.id,
            name: centro.name,
            siiau_id: centro.siiau_id,
          },
          calendario: {
            siiapi_id: calendario.id,
            name: calendario.name,
            siiau_id: calendario.siiau_id,
          },
        },
        cached_at: new Date(),
      });
    }
  }

  return docs;
}

// ── Query ──────────────────────────────────────────────────────────────────────

function buildMongoFilter(filter: HorariosFilter): Record<string, unknown> {
  const query: Record<string, unknown> = {
    calendario_id: filter.calendario_id,
  };
  if (filter.centro_id !== undefined) query["centro_id"] = filter.centro_id;
  if (filter.edificio_id !== undefined) query["edificio_id"] = filter.edificio_id;
  if (filter.aula_id !== undefined) query["aula_id"] = filter.aula_id;
  return query;
}

async function queryMongo(
  filter: HorariosFilter,
  skip: number,
  limit: number
): Promise<{ total: number; results: IClase[] }> {
  const query = buildMongoFilter(filter);
  const [total, results] = await Promise.all([
    ClaseModel.countDocuments(query),
    ClaseModel.find(query).skip(skip).limit(limit).lean<IClase[]>(),
  ]);
  return { total, results };
}

// ── Main entry point ───────────────────────────────────────────────────────────

export async function getHorarios(
  filter: HorariosFilter,
  skip = 0,
  limit = 50
): Promise<HorariosResult> {
  const cacheStatus = await isCacheValid(filter.calendario_id);

  // Cache miss: fetch synchronously, then respond
  if (cacheStatus === null) {
    await syncCalendario(filter.calendario_id);
    const { total, results } = await queryMongo(filter, skip, limit);
    return { total, results, from_cache: false, stale: false };
  }

  // Cache hit (fresh): respond from MongoDB
  if (cacheStatus === true) {
    const { total, results } = await queryMongo(filter, skip, limit);
    return { total, results, from_cache: true, stale: false };
  }

  // Cache stale: respond from MongoDB immediately, refresh in background
  const { total, results } = await queryMongo(filter, skip, limit);

  // Fire-and-forget background refresh (avoid blocking the response)
  syncCalendario(filter.calendario_id).catch((err: unknown) => {
    console.error(`Background sync failed for calendario_id=${filter.calendario_id}:`, err);
  });

  return { total, results, from_cache: true, stale: true };
}
