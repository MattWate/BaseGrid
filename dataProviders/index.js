// dataProviders/index.js - Multi-source data provider factory
const config = require('../config');
const SupabaseProvider = require('./supabaseProvider');
const TextFileProvider = require('./textFileProvider');

class MultiSourceManager {
  constructor() {
    this.providers = new Map();
    this.initializeProviders();
  }

  initializeProviders() {
    const sources = config.getEnabledSources();
    
    sources.forEach(source => {
      let provider;
      
      switch (source.type) {
        case 'supabase':
          provider = new SupabaseProvider(source.config);
          break;
        case 'textfiles':
          provider = new TextFileProvider(source.config);
          break;
        default:
          console.warn(`Unknown data source type: ${source.type}`);
          return;
      }
      
      // Add metadata to provider
      provider.sourceId = source.id;
      provider.sourceName = source.name;
      provider.sourceType = source.type;
      
      this.providers.set(source.id, provider);
      console.log(`Initialized data source: ${source.name} (${source.id})`);
    });
  }

  getProvider(sourceId) {
    const provider = this.providers.get(sourceId);
    if (!provider) {
      throw new Error(`Data source not found: ${sourceId}`);
    }
    return provider;
  }

  getAllProviders() {
    return Array.from(this.providers.values());
  }

  getProviderEntries() {
    return Array.from(this.providers.entries());
  }

  async getAvailableTablesGroupedBySource() {
    const grouped = [];
    
    for (const [sourceId, provider] of this.providers.entries()) {
      try {
        const tables = await provider.getAvailableTables();
        grouped.push({
          sourceId: sourceId,
          sourceName: provider.sourceName,
          sourceType: provider.sourceType,
          tables: tables
        });
      } catch (error) {
        console.error(`Error getting tables from ${sourceId}:`, error);
        grouped.push({
          sourceId: sourceId,
          sourceName: provider.sourceName,
          sourceType: provider.sourceType,
          tables: [],
          error: error.message
        });
      }
    }
    
    return grouped;
  }

  // Proxy methods that route to the appropriate provider
  async getTableData(sourceId, tableName, userId) {
    const provider = this.getProvider(sourceId);
    return await provider.getTableData(tableName, userId);
  }

  async getRowById(sourceId, tableName, id, userId) {
    const provider = this.getProvider(sourceId);
    return await provider.getRowById(tableName, id, userId);
  }

  async insertRow(sourceId, tableName, row, userId) {
    const provider = this.getProvider(sourceId);
    return await provider.insertRow(tableName, row, userId);
  }

  async updateRow(sourceId, tableName, id, row, userId) {
    const provider = this.getProvider(sourceId);
    return await provider.updateRow(tableName, id, row, userId);
  }

  async deleteRow(sourceId, tableName, id, userId) {
    const provider = this.getProvider(sourceId);
    return await provider.deleteRow(tableName, id, userId);
  }

  async getLookupValues(sourceId, file, userId) {
    const provider = this.getProvider(sourceId);
    return await provider.getLookupValues(file, userId);
  }

  // Authentication - use first provider that supports auth
  isAuthRequired() {
    for (const provider of this.providers.values()) {
      if (provider.isAuthRequired && provider.isAuthRequired()) {
        return true;
      }
    }
    return false;
  }

  async login(email, password) {
    // Try each provider until one succeeds
    for (const provider of this.providers.values()) {
      if (provider.login) {
        try {
          const result = await provider.login(email, password);
          if (result.success) {
            return result;
          }
        } catch (error) {
          console.error(`Login failed for provider ${provider.sourceId}:`, error);
        }
      }
    }
    return { success: false, error: 'Invalid credentials' };
  }

  async register(email, password) {
    // Register with first provider that supports registration
    for (const provider of this.providers.values()) {
      if (provider.register) {
        try {
          return await provider.register(email, password);
        } catch (error) {
          console.error(`Registration failed for provider ${provider.sourceId}:`, error);
        }
      }
    }
    return { success: false, error: 'Registration not supported' };
  }
}

// Legacy factory for backward compatibility
class DataProviderFactory {
  static createProvider() {
    // Return MultiSourceManager as the default provider
    return new MultiSourceManager();
  }

  static createSingleProvider(type) {
    // For backward compatibility - create a single provider
    switch (type) {
      case 'supabase':
        return new SupabaseProvider({
          url: config.getSupabaseUrl(),
          key: config.getSupabaseKey()
        });
      case 'textfiles':
        return new TextFileProvider({
          dataPath: process.env.TEXT_DATA_PATH || './data'
        });
      default:
        throw new Error(`Unknown provider type: ${type}`);
    }
  }
}

module.exports = {
  DataProviderFactory,
  MultiSourceManager
};