import type { Request, Response } from "express";
import { getHorarios, type HorariosFilter } from "../services/horarios.service.js";

export const getHorariosHandler = async (req: Request, res: Response): Promise<void> => {
  const calendarioId = parseInt(String(req.query["calendario_id"]), 10);

  if (isNaN(calendarioId) || calendarioId <= 0) {
    res.status(400).json({
      error: "El parámetro 'calendario_id' es requerido y debe ser un entero positivo.",
    });
    return;
  }

  const filter: HorariosFilter = { calendario_id: calendarioId };

  const centroId = parseInt(String(req.query["centro_id"]), 10);
  if (!isNaN(centroId) && centroId > 0) filter.centro_id = centroId;

  const edificioId = parseInt(String(req.query["edificio_id"]), 10);
  if (!isNaN(edificioId) && edificioId > 0) filter.edificio_id = edificioId;

  const aulaId = parseInt(String(req.query["aula_id"]), 10);
  if (!isNaN(aulaId) && aulaId > 0) filter.aula_id = aulaId;

  const skip = Math.max(0, parseInt(String(req.query["skip"] ?? "0"), 10) || 0);
  const limit = Math.min(
    100,
    Math.max(1, parseInt(String(req.query["limit"] ?? "50"), 10) || 50)
  );

  try {
    const result = await getHorarios(filter, skip, limit);

    res.set("X-Cache", result.from_cache ? (result.stale ? "STALE" : "HIT") : "MISS");

    res.json({
      total: result.total,
      skip,
      limit,
      stale: result.stale,
      results: result.results,
    });
  } catch (err: unknown) {
    console.error("Error in getHorariosHandler:", err);
    res.status(502).json({ error: "Error al obtener datos de horarios." });
  }
};
