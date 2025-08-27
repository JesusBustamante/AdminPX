// backend/bd/resolvers.js  (ESM)
import { query as dbQuery } from './server.js';
import { GraphQLScalarType, Kind } from 'graphql';

const TABLE = 'public."T_Dim_Formulario2"'; // con GUION_BAJO
const ALLOWED_FIELDS = [
  "nombres", "sede", "no_op", "sci_ref", "descripcion_referencia",
  "fecha_inicio", "hora_inicio", "fecha_final", "hora_final",
  "actividad", "cantidad", "estado_sci", "area", "maquina", "horario", "observaciones"
];

export const resolvers = {

  Date: new GraphQLScalarType({
    name: 'Date',
    description: 'Fecha en formato ISO (YYYY-MM-DD)',
    serialize(value) {
      return value instanceof Date ? value.toISOString().split('T')[0] : value;
    },
    parseValue(value) {
      return new Date(value); // cuando recibes un input
    },
    parseLiteral(ast) {
      return ast.kind === Kind.STRING ? new Date(ast.value) : null;
    },
  }),

  Query: {
    formularios: async (_p, { limit = 50, offset = 0, q, dateFrom, dateTo }) => {
      const lim = Math.min(Math.max(limit, 1), 500);
      const off = Math.max(offset, 0);

      const where = [];
      const params = [];

      // Texto: nombres o cc
      if (q && q.trim()) {
        params.push(`%${q.trim()}%`, `%${q.trim()}%`);
        where.push(`("nombres" ILIKE $${params.length - 1} OR "cc"::text ILIKE $${params.length})`);
      }

      // --- RANGO ESTRICTO DENTRO DEL INTERVALO SELECCIONADO ---
      // Normaliza y corrige si vienen invertidas
      const from = (dateFrom && dateFrom.trim()) ? dateFrom.trim() : null;
      const to = (dateTo && dateTo.trim()) ? dateTo.trim() : null;

      if (from && to) {
        // si el usuario eligió al revés, se corrige
        const a = from <= to ? from : to;
        const b = from <= to ? to : from;

        params.push(a, b);
        where.push(`("fecha_inicio"::date >= $${params.length - 1}::date AND "fecha_final"::date <= $${params.length}::date)`);
      } else if (from) {
        params.push(from);
        where.push(`"fecha_inicio"::date >= $${params.length}::date`);
      } else if (to) {
        params.push(to);
        where.push(`"fecha_final"::date <= $${params.length}::date`);
      }
      // --------------------------------------------------------

      const whereSQL = where.length ? `WHERE ${where.join(' AND ')}` : '';

      // total
      const totalSql = `SELECT COUNT(*)::int AS total FROM public."T_Dim_Formulario" ${whereSQL};`;
      const { rows: trows } = await dbQuery(totalSql, params);
      const total = trows[0]?.total ?? 0;

      // página (puedes añadir ORDER BY si lo deseas)
      const limitIndex = params.length + 1;
      const offsetIndex = params.length + 2;

      const dataSql = `
    SELECT "cc","nombres","sede","no_op","sci_ref","descripcion_referencia",
           "fecha_inicio","hora_inicio","fecha_final","hora_final",
           "actividad","cantidad","estado_sci","area","maquina","horario","observaciones"
    FROM public."T_Dim_Formulario"
    ${whereSQL}
    ORDER BY "id" DESC
    LIMIT $${limitIndex} OFFSET $${offsetIndex};
  `;

      const { rows } = await dbQuery(dataSql, [...params, lim, off]);
      return { items: rows, count: rows.length, total };
    },



    formulario: async (_p, { cc }) => {
      const { rows } = await dbQuery(
        `SELECT "cc","nombres", "actividad", "sede", "fecha_inicio", "fecha_final", "hora_inicio", "hora_final", "no_op", "sci_ref", "descripcion_referencia", "cantidad", "estado_sci", "area", "maquina", "horario", "observaciones" FROM ${TABLE} WHERE "cc"::text = $1 ORDER BY "id" DESC LIMIT 1;`,
        [String(cc)]
      );
      return rows[0] || null;
    },
  },

  Mutation: {
    updateFormulario: async (_p, { cc, patch }) => {
      // filtra solo claves válidas presentes en el patch
      const entries = Object.entries(patch || {}).filter(
        ([k, v]) => ALLOWED_FIELDS.includes(k) && v !== undefined
      );

      if (entries.length === 0) {
        throw new Error('Nada para actualizar');
      }

      // Validaciones básicas (ejemplo para cantidad y fechas)
      for (const [k, v] of entries) {
        if (k === 'cantidad' && v !== null && isNaN(Number(v))) {
          throw new Error('cantidad debe ser numérico');
        }
        // aquí podrías validar formato fecha/hora si lo necesitas
      }

      // arma SET "col" = $i
      const setClauses = [];
      const params = [];
      let i = 1;
      for (const [k, v] of entries) {
        setClauses.push(`"${k}" = $${i++}`);
        params.push(v);
      }
      // where por cc
      params.push(String(cc));

      const sql = `
        UPDATE ${TABLE}
        SET ${setClauses.join(', ')}
        WHERE "cc"::text = $${i}
        RETURNING "cc","nombres","sede","no_op","sci_ref","descripcion_referencia",
                  "fecha_inicio","hora_inicio","fecha_final","hora_final",
                  "actividad","cantidad","estado_sci","area","maquina","horario","observaciones";
      `;

      const { rows } = await dbQuery(sql, params);
      if (!rows.length) throw new Error('No encontrado');
      return rows[0];
    },
    // deleteFormulario se queda igual
  },
};
