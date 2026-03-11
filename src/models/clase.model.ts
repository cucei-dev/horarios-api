import { Schema, model, type Document } from "mongoose";

// ── Sub-schemas ────────────────────────────────────────────────────────────────

const CentroSchema = new Schema(
  {
    siiapi_id: { type: Number, required: true },
    name: { type: String, required: true },
    siiau_id: { type: String, required: true },
  },
  { _id: false }
);

const EdificioSchema = new Schema(
  {
    siiapi_id: { type: Number, required: true },
    name: { type: String, required: true },
    centro: { type: CentroSchema, required: true },
  },
  { _id: false }
);

const AulaSchema = new Schema(
  {
    siiapi_id: { type: Number, required: true },
    name: { type: String, required: true },
    edificio: { type: EdificioSchema, required: true },
  },
  { _id: false }
);

const MateriaSchema = new Schema(
  {
    siiapi_id: { type: Number, required: true },
    name: { type: String, required: true },
    clave: { type: String, required: true },
    creditos: { type: Number, required: true },
  },
  { _id: false }
);

const ProfesorSchema = new Schema(
  {
    siiapi_id: { type: Number, required: true },
    name: { type: String, required: true },
  },
  { _id: false }
);

const CalendarioSchema = new Schema(
  {
    siiapi_id: { type: Number, required: true },
    name: { type: String, required: true },
    siiau_id: { type: String, required: true },
  },
  { _id: false }
);

const SeccionSchema = new Schema(
  {
    siiapi_id: { type: Number, required: true },
    name: { type: String, required: true },
    nrc: { type: String, required: true },
    cupos: { type: Number, required: true },
    cupos_disponibles: { type: Number, required: true },
    periodo_inicio: { type: Date, required: true },
    periodo_fin: { type: Date, required: true },
    materia: { type: MateriaSchema, required: true },
    profesor: { type: ProfesorSchema, required: true },
    centro: { type: CentroSchema, required: true },
    calendario: { type: CalendarioSchema, required: true },
  },
  { _id: false }
);

// ── Main schema ────────────────────────────────────────────────────────────────

export interface ClaseData {
  siiapi_id: number;
  sesion: number;
  hora_inicio: string;
  hora_fin: string;
  dia: number;
  // Flat index fields for efficient filtering
  calendario_id: number;
  centro_id: number;
  edificio_id: number;
  aula_id: number;
  seccion_id: number;
  // Embedded full objects
  aula: {
    siiapi_id: number;
    name: string;
    edificio: {
      siiapi_id: number;
      name: string;
      centro: { siiapi_id: number; name: string; siiau_id: string };
    };
  };
  seccion: {
    siiapi_id: number;
    name: string;
    nrc: string;
    cupos: number;
    cupos_disponibles: number;
    periodo_inicio: Date;
    periodo_fin: Date;
    materia: { siiapi_id: number; name: string; clave: string; creditos: number };
    profesor: { siiapi_id: number; name: string };
    centro: { siiapi_id: number; name: string; siiau_id: string };
    calendario: { siiapi_id: number; name: string; siiau_id: string };
  };
  cached_at: Date;
}

export interface IClase extends Document, ClaseData {}

const ClaseSchema = new Schema<IClase>(
  {
    siiapi_id: { type: Number, required: true, unique: true },
    sesion: { type: Number, required: true },
    hora_inicio: { type: String, required: true },
    hora_fin: { type: String, required: true },
    dia: { type: Number, required: true },
    // Flat index fields
    calendario_id: { type: Number, required: true },
    centro_id: { type: Number, required: true },
    edificio_id: { type: Number, required: true },
    aula_id: { type: Number, required: true },
    seccion_id: { type: Number, required: true },
    // Embedded objects
    aula: { type: AulaSchema, required: true },
    seccion: { type: SeccionSchema, required: true },
    cached_at: { type: Date, required: true, default: () => new Date() },
  },
  {
    versionKey: false,
    collection: "clases",
  }
);

// Compound indexes for common filter combinations
ClaseSchema.index({ calendario_id: 1 });
ClaseSchema.index({ calendario_id: 1, centro_id: 1 });
ClaseSchema.index({ calendario_id: 1, edificio_id: 1 });
ClaseSchema.index({ calendario_id: 1, aula_id: 1 });
ClaseSchema.index({ calendario_id: 1, dia: 1 });
ClaseSchema.index({ calendario_id: 1, centro_id: 1, edificio_id: 1, aula_id: 1 });
ClaseSchema.index({ calendario_id: 1, centro_id: 1, edificio_id: 1, aula_id: 1, dia: 1 });

export const ClaseModel = model<IClase>("Clase", ClaseSchema);
