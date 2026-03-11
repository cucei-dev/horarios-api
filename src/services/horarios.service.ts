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
  dia?: number;
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
  console.log(`[Sync] Starting sync for calendario_id=${calendarioId}`);

  // Mark as refreshing to prevent concurrent syncs
  await CacheEntryModel.findOneAndUpdate(
    { calendario_id: calendarioId },
    { $set: { is_refreshing: true } },
    { upsert: true }
  );

  try {
    console.log(`[Sync] Fetching secciones and aulas from SIIAPI...`);
    // Fetch in parallel: secciones and aulas
    const [secciones, aulaMap] = await Promise.all([
      fetchSeccionesByCalendario(calendarioId),
      fetchAulaMap(),
    ]);

    console.log(`[Sync] Building clase documents from ${secciones.length} secciones and ${aulaMap.size} aulas...`);
    const claseDocuments = buildClaseDocuments(secciones, aulaMap);
    console.log(`[Sync] Built ${claseDocuments.length} clase documents`);

    if (claseDocuments.length > 0) {
      console.log(`[Sync] Upserting ${claseDocuments.length} clases into MongoDB...`);
      const ops = claseDocuments.map((doc) => ({
        updateOne: {
          filter: { siiapi_id: doc.siiapi_id },
          update: { $set: doc },
          upsert: true,
        },
      }));
      const bulkResult = await ClaseModel.bulkWrite(ops, { ordered: false });
      console.log(`[Sync] bulkWrite done — upserted: ${bulkResult.upsertedCount}, modified: ${bulkResult.modifiedCount}`);
    } else {
      console.warn(`[Sync] No clase documents to upsert for calendario_id=${calendarioId}`);
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
    console.log(`[Sync] Cache entry updated. Expires in ${config.CACHE_TTL_MINUTES} minutes`);
  } catch (err) {
    console.error(`[Sync] Error syncing calendario_id=${calendarioId}:`, err);
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
  let skippedMissingRelations = 0;
  let skippedNoClases = 0;

  for (const seccion of secciones) {
    if (!seccion.clases?.length) {
      skippedNoClases++;
      continue;
    }

    const calendario = seccion.calendario;
    const centro = seccion.centro;
    const materia = seccion.materia;
    const profesor = seccion.profesor;

    if (!calendario || !centro || !materia || !profesor) {
      console.warn(`[Sync] Seccion id=${seccion.id} skipped — missing: ${[
        !calendario && "calendario",
        !centro && "centro",
        !materia && "materia",
        !profesor && "profesor",
      ].filter(Boolean).join(", ")}`);
      skippedMissingRelations++;
      continue;
    }

    for (const clase of seccion.clases) {
      const aula = aulaMap.get(clase.aula_id);
      const edificio = aula?.edificio;
      const edilCentro = edificio?.centro;

      if (!aula || !edificio || !edilCentro) {
        console.warn(`[Sync] Clase id=${clase.id} skipped — aula_id=${clase.aula_id} not found in aula map or missing edificio/centro`);
        continue;
      }

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

  console.log(`[Sync] buildClaseDocuments: ${docs.length} docs built, ${skippedNoClases} secciones with no clases, ${skippedMissingRelations} secciones with missing relations`);
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
  if (filter.dia !== undefined) query["dia"] = filter.dia;
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
  console.log(`[Horarios] Request — filter: ${JSON.stringify(filter)}, skip=${skip}, limit=${limit}`);
  const cacheStatus = await isCacheValid(filter.calendario_id);
  console.log(`[Horarios] Cache status for calendario_id=${filter.calendario_id}: ${cacheStatus === null ? "MISS (no data)" : cacheStatus ? "HIT (fresh)" : "STALE"}`);

  // Cache miss: fetch synchronously, then respond
  if (cacheStatus === null) {
    console.log(`[Horarios] Cache miss — syncing from SIIAPI...`);
    await syncCalendario(filter.calendario_id);
    const { total, results } = await queryMongo(filter, skip, limit);
    console.log(`[Horarios] Returning ${results.length}/${total} results (MISS)`);
    return { total, results, from_cache: false, stale: false };
  }

  // Cache hit (fresh): respond from MongoDB
  if (cacheStatus === true) {
    const { total, results } = await queryMongo(filter, skip, limit);
    console.log(`[Horarios] Returning ${results.length}/${total} results (HIT)`);
    return { total, results, from_cache: true, stale: false };
  }

  // Cache stale: respond from MongoDB immediately, refresh in background
  console.log(`[Horarios] Cache stale — responding with cached data, refreshing in background...`);
  const { total, results } = await queryMongo(filter, skip, limit);

  // Fire-and-forget background refresh (avoid blocking the response)
  syncCalendario(filter.calendario_id).catch((err: unknown) => {
    console.error(`[Horarios] Background sync failed for calendario_id=${filter.calendario_id}:`, err);
  });

  console.log(`[Horarios] Returning ${results.length}/${total} results (STALE)`);
  return { total, results, from_cache: true, stale: true };
}
