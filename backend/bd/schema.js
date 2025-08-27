export const typeDefs = /* GraphQL */ `
  scalar Date

  type Formulario {
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

  type Query {
    formularios(
      limit: Int = 50
      offset: Int = 0
      q: String
      dateFrom: String   # YYYY-MM-DD
      dateTo: String     # YYYY-MM-DD
    ): FormulariosResult!
    formulario(cc: ID!): Formulario
  }

  type Mutation {
    updateFormulario(cc: ID!, patch: FormularioPatch!): Formulario
    deleteFormulario(cc: ID!): Formulario
  }
`;
