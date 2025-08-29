// backend/bd/schema.js (ESM)
export const typeDefs = /* GraphQL */ `
  scalar Date

  type Formulario {
    id: ID!
    cc: ID!
    nombres: String
    actividad: String
    sede: String
    fecha_inicio: Date
    fecha_final: Date
    hora_inicio: String
    hora_final: String
    no_op: String
    sci_ref: String
    descripcion_referencia: String
    cantidad: Float
    estado_sci: String
    area: String
    maquina: String
    horario: String
    observaciones: String
  }

  input FormularioPatch {
    nombres: String
    actividad: String
    sede: String
    fecha_inicio: String
    fecha_final: String
    hora_inicio: String
    hora_final: String
    no_op: String
    sci_ref: String
    descripcion_referencia: String
    cantidad: Float
    estado_sci: String
    area: String
    maquina: String
    horario: String
    observaciones: String
  }

  type FormulariosResult {
    items: [Formulario!]!
    count: Int!
    total: Int!
  }

  # === Tipos para Control OP ===
  type RefRow {
    op: String!
    sci: String!
    descripcion: String!
  }

  type Query {
    # Lista/paginación principal (T_Dim_Formulario2)
    formularios(
      limit: Int = 50
      offset: Int = 0
      q: String
      dateFrom: String   # YYYY-MM-DD
      dateTo: String     # YYYY-MM-DD
    ): FormulariosResult!

    formulario(cc: ID!): Formulario

    # === Autocompletados/relaciones desde T_Ctrol_OP ===
    buscarOpsExcel(prefix: String!, limit: Int = 10): [String!]!
    buscarSciPorOp(op: String!, prefix: String, limit: Int = 10): [String!]!
    refPorOpSci(op: String!, sci: String!): RefRow

    ctpnList: [String!]
    maquinasPorCtpn(ctpn: String!): [String!]
  }

  type Mutation {
    updateFormulario(id: ID!, patch: FormularioPatch!): Formulario
    deleteFormulario(id: ID!): Formulario
  }
`;
