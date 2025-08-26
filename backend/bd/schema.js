// backend/bd/schema.js  (ESM)
export const typeDefs = /* GraphQL */ `
  type Formulario {
    cc: ID!
    nombres: String
  }

  type FormulariosResult {
    items: [Formulario!]!
    count: Int!   # items devueltos en esta página
    total: Int!   # total de filas en la tabla
  }

  type Query {
    formularios(limit: Int = 50, offset: Int = 0): FormulariosResult!
    formulario(cc: ID!): Formulario
  }

  type Mutation {
    updateFormulario(cc: ID!, nombres: String!): Formulario
    deleteFormulario(cc: ID!): Formulario
  }
`;
