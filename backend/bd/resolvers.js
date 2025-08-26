// backend/bd/resolvers.js  (ESM)
import { query as dbQuery } from './server.js';

const TABLE = 'public."T_Dim_Formulario"'; // con GUION_BAJO

export const resolvers = {
  Query: {
    formularios: async (_p, { limit = 50, offset = 0 }) => {
      const lim = Math.min(Math.max(limit, 1), 500);
      const off = Math.max(offset, 0);

      // total de filas
      const { rows: totalRows } = await dbQuery(
        `SELECT COUNT(*)::int AS total FROM ${TABLE};`
      );
      const total = totalRows[0]?.total ?? 0;

      // página
      const { rows } = await dbQuery(
        `
        SELECT "cc","nombres"
        FROM ${TABLE}
        LIMIT $1 OFFSET $2;
        `,
        [lim, off]
      );

      return { items: rows, count: rows.length, total };
    },

    formulario: async (_p, { cc }) => {
      const { rows } = await dbQuery(
        `SELECT "cc","nombres" FROM ${TABLE} WHERE "cc"::text = $1 LIMIT 1;`,
        [String(cc)]
      );
      return rows[0] || null;
    },
  },

  Mutation: {
    updateFormulario: async (_p, { cc, nombres }) => {
      if (!nombres || !nombres.trim()) throw new Error('nombres es requerido');
      const { rows } = await dbQuery(
        `
        UPDATE ${TABLE}
        SET "nombres" = $1
        WHERE "cc"::text = $2
        RETURNING "cc","nombres";
        `,
        [nombres.trim(), String(cc)]
      );
      if (!rows.length) throw new Error('No encontrado');
      return rows[0];
    },

    deleteFormulario: async (_p, { cc }) => {
      const { rows } = await dbQuery(
        `
        DELETE FROM ${TABLE}
        WHERE "cc"::text = $1
        RETURNING "cc","nombres";
        `,
        [String(cc)]
      );
      if (!rows.length) throw new Error('No encontrado');
      return rows[0];
    },
  },
};
