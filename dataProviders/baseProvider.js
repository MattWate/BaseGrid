// dataProviders/baseProvider.js - Base class for all data providers
class DataProvider {
  constructor(config) {
    this.config = config || {};
  }

  // Methods to be implemented by subclasses
  async getAvailableTables() {
    throw new Error('getAvailableTables() must be implemented by subclass');
  }

  async getTableData(tableName, userId) {
    throw new Error('getTableData() must be implemented by subclass');
  }

  async getRowById(tableName, id, userId) {
    throw new Error('getRowById() must be implemented by subclass');
  }

  async insertRow(tableName, row, userId) {
    throw new Error('insertRow() must be implemented by subclass');
  }

  async updateRow(tableName, id, row, userId) {
    throw new Error('updateRow() must be implemented by subclass');
  }

  async deleteRow(tableName, id, userId) {
    throw new Error('deleteRow() must be implemented by subclass');
  }

  async getLookupValues(file, userId) {
    throw new Error('getLookupValues() must be implemented by subclass');
  }

  // Optional authentication methods (not all providers need these)
  isAuthRequired() {
    return false;
  }

  async login(email, password) {
    return { success: false, error: 'Login not supported' };
  }

  async register(email, password) {
    return { success: false, error: 'Registration not supported' };
  }
}

module.exports = DataProvider;