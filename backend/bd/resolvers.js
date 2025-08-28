// backend/bd/resolvers.js  (ESM)
import { GraphQLScalarType, Kind } from 'graphql';

const TABLE = 'public."T_Dim_Formulario2"';
const OP_TABLE = 'tablas_servicios."T_Ctrol_OP"'
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
    parseValue(value) { return new Date(value); },
    parseLiteral(ast) { return ast.kind === Kind.STRING ? new Date(ast.value) : null; },
  }),

  Query: {
    formularios: async (_p, { limit = 50, offset = 0, q, dateFrom, dateTo }, { query }) => {
      const lim = Math.min(Math.max(limit, 1), 500);
      const off = Math.max(offset, 0);

      const where = [];
      const params = [];

      // Texto: nombres o cc
      if (q && q.trim()) {
        params.push(`%${q.trim()}%`, `%${q.trim()}%`);
        where.push(`("nombres" ILIKE $${params.length - 1} OR "cc"::text ILIKE $${params.length})`);
      }

      // Rango de fechas (estricto dentro del intervalo)
      const from = (dateFrom && dateFrom.trim()) ? dateFrom.trim() : null;
      const to = (dateTo && dateTo.trim()) ? dateTo.trim() : null;

      if (from && to) {
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

      const whereSQL = where.length ? `WHERE ${where.join(' AND ')}` : '';

      // total
      const totalSql = `SELECT COUNT(*)::int AS total FROM ${TABLE} ${whereSQL};`;
      const { rows: trows } = await query(totalSql, params);
      const total = trows[0]?.total ?? 0;

      // página
      const limitIndex = params.length + 1;
      const offsetIndex = params.length + 2;

      const dataSql = `
        SELECT "cc","nombres","sede","no_op","sci_ref","descripcion_referencia",
               "fecha_inicio","hora_inicio","fecha_final","hora_final",
               "actividad","cantidad","estado_sci","area","maquina","horario","observaciones"
        FROM ${TABLE}
        ${whereSQL}
        ORDER BY "id" DESC
        LIMIT $${limitIndex} OFFSET $${offsetIndex};
      `;
      const { rows } = await query(dataSql, [...params, lim, off]);
      return { items: rows, count: rows.length, total };
    },

    formulario: async (_p, { cc }, { query }) => {
      const { rows } = await query(
        `SELECT "cc","nombres","actividad","sede","fecha_inicio","fecha_final",
                "hora_inicio","hora_final","no_op","sci_ref","descripcion_referencia",
                "cantidad","estado_sci","area","maquina","horario","observaciones"
         FROM ${TABLE}
         WHERE "cc"::text = $1
         ORDER BY "id" DESC
         LIMIT 1;`,
        [String(cc)]
      );
      return rows[0] || null;
    },

    // SUGERENCIAS EN BD-2 (T_Ctrol_OP)
    buscarOpsExcel: async (_p, { prefix, limit = 10 }, { query2 }) => {
      const { rows } = await query2(`
        SELECT DISTINCT "O.P." AS op
        FROM ${OP_TABLE}
        WHERE "O.P." ILIKE $1
        ORDER BY "O.P." ASC
        LIMIT $2
      `, [`${prefix}%`, limit]);
      return rows.map(r => r.op);
    },


    buscarSciPorOp: async (_p, { op, prefix = '', limit = 10 }, { query2 }) => {
      const params = [op];
      let where = `WHERE "O.P." = $1`;
      if (prefix && prefix.trim()) {
        params.push(`${prefix.trim()}%`);
        where += ` AND CAST("SCI Ref." AS TEXT) ILIKE $${params.length}`;
      }
      params.push(limit);
      const { rows } = await query2(`
        SELECT "SCI Ref."::text AS sci
        FROM ${OP_TABLE}
        ${where}
        GROUP BY "SCI Ref."
        ORDER BY "SCI Ref." ASC
        LIMIT $${params.length}
      `, params);
      return rows.map(r => r.sci);
    },


    refPorOpSci: async (_p, { op, sci }, { query2 }) => {
      const { rows } = await query2(`
        SELECT "O.P." AS op,
              "SCI Ref."::text AS sci,
              "Descripción Referencia" AS descripcion
        FROM ${OP_TABLE}
        WHERE "O.P." = $1 AND CAST("SCI Ref." AS TEXT) = $2
        LIMIT 1
      `, [op, String(sci)]);
      return rows[0] || null;
    },

  },

  Mutation: {
    updateFormulario: async (_p, { cc, patch }, { query, query2 }) => {
      // Validar (no_op, sci_ref) contra BD-2 y traer la descripción real
      let desc = patch.descripcion_referencia ?? null;

      if (patch.no_op != null || patch.sci_ref != null) {
        const no_op = patch.no_op != null ? String(patch.no_op).trim() : null;
        const sci_ref = patch.sci_ref != null ? String(patch.sci_ref).trim() : null;

        if (!no_op || !sci_ref) {
          throw new Error('O.P. y sci_ref son obligatorios para actualizar esa relación');
        }

        const { rows } = await query2(`
          SELECT "Descripción Referencia" AS "descripcion_referencia"
          FROM ${OP_TABLE}
          WHERE "O.P." = $1 AND CAST("SCI Ref." AS TEXT) = $2
          LIMIT 1
        `, [no_op, sci_ref]);

        if (!rows.length) {
          throw new Error('El SCI no corresponde al OP seleccionado');
        }
        desc = rows[0].descripcion_referencia;
      }

      // SET dinámico
      const fields = [];
      const params = [];
      const push = (col, val, cast = '') => {
        params.push(val);
        fields.push(`"${col}" = $${params.length}${cast}`);
      };

      if (patch.no_op != null) push('no_op', String(patch.no_op));
      if (patch.sci_ref != null) push('sci_ref', String(patch.sci_ref));
      if (desc != null) push('descripcion_referencia', String(desc));
      if (patch.sede != null) push('sede', String(patch.sede));
      if (patch.actividad != null) push('actividad', String(patch.actividad));
      if (patch.cantidad != null) push('cantidad', Number(patch.cantidad));
      if (patch.estado_sci != null) push('estado_sci', String(patch.estado_sci));
      if (patch.area != null) push('area', String(patch.area));
      if (patch.maquina != null) push('maquina', String(patch.maquina));
      if (patch.horario != null) push('horario', String(patch.horario));
      if (patch.observaciones != null) push('observaciones', String(patch.observaciones));
      if (patch.fecha_inicio != null) push('fecha_inicio', String(patch.fecha_inicio), '::date');
      if (patch.fecha_final != null) push('fecha_final', String(patch.fecha_final), '::date');
      if (patch.hora_inicio != null) push('hora_inicio', String(patch.hora_inicio), '::time');
      if (patch.hora_final != null) push('hora_final', String(patch.hora_final), '::time');

      if (!fields.length) {
        const { rows } = await query(`
          SELECT "cc","no_op","sci_ref","descripcion_referencia"
          FROM ${TABLE} WHERE "cc"=$1 LIMIT 1
        `, [String(cc)]);
        return rows[0] || null;
      }

      params.push(String(cc));
      const sql = `
        UPDATE ${TABLE}
        SET ${fields.join(', ')}
        WHERE "cc" = $${params.length}
        RETURNING "cc","no_op","sci_ref","descripcion_referencia"
      `;
      const { rows } = await query(sql, params);
      return rows[0] || null;
    },
  },

  // (Si tienes deleteFormulario, lo dejas aquí)
};
