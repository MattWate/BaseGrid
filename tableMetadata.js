// tableMetadata.js - Shared table metadata for both providers
module.exports = {
  countries: {
    title: 'Countries',
    tableName: 'countries',
    fields: [
      { name: 'id', type: 'integer', readonly: true },
      { name: 'Name', type: 'text' },
      { name: 'ISO2', type: 'text' },
      { name: 'ISO3', type: 'text' },
      { name: 'Capital', type: 'text' }
    ]
  },
  another: {
    title: 'Another',
    tableName: 'another',
    fields: [
      { name: 'id', type: 'integer', readonly: true },
      { name: 'Name', type: 'text' },
      { name: 'Date', type: 'date' },
      { name: 'Value', type: 'number' },
      { name: 'Amount', type: 'number' },
      { name: 'Country', type: 'lu', luFile: 'countries' }
    ]
  },
  cities: {
    title: 'Cities',
    tableName: 'cities',
    fields: [
      { name: 'id', type: 'integer', readonly: true },
      { name: 'Name', type: 'text' },
      { name: 'Country', type: 'text' }
    ]
  },
  saprovinces: {
    title: 'SA Provinces',
    tableName: 'SAProvinces',
    fields: [
      { name: 'id', type: 'integer', readonly: true },
      { name: 'Name', type: 'text' },
      { name: 'Capital', type: 'text' }
    ]
  },
  saprovinces: {
    title: 'USA States',
    tableName: 'USAStates',
    fields: [
      { name: 'id', type: 'integer', readonly: true },
      { name: 'Name', type: 'text' },
      { name: 'Capital', type: 'text' }
    ]
  }
};