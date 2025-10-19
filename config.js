// config.js - Multi-source configuration (reads from config.json)
const fs = require('fs');
const path = require('path');

let configData;
try {
  const configPath = path.join(__dirname, 'config.json');
  configData = JSON.parse(fs.readFileSync(configPath, 'utf8'));
} catch (error) {
  console.error('Failed to load config.json, using defaults:', error.message);
  // Default configuration if config.json doesn't exist
  configData = {
    port: 3000,
    dataSources: [
      {
        id: 'source1',
        name: 'Text Files',
        type: 'textfiles',
        enabled: true,
        config: {
          dataPath: './data'
        }
      }
    ]
  };
}

const config = {
  port: configData.port || 3000,
  dataSources: configData.dataSources || [],

  // Helper methods
  getPort() {
    return this.port;
  },

  getEnabledSources() {
    return this.dataSources.filter(source => source.enabled);
  },

  getSourceById(id) {
    return this.dataSources.find(source => source.id === id);
  },

  getSourceByType(type) {
    return this.dataSources.find(source => source.type === type && source.enabled);
  },

  // Legacy methods for backward compatibility
  getDataSourceType() {
    const firstEnabled = this.dataSources.find(s => s.enabled);
    return firstEnabled ? firstEnabled.type : 'textfiles';
  },

  getSupabaseUrl() {
    const supabaseSource = this.getSourceByType('supabase');
    return supabaseSource?.config?.url;
  },

  getSupabaseKey() {
    const supabaseSource = this.getSourceByType('supabase');
    return supabaseSource?.config?.key;
  },

  isProduction() {
    return process.env.NODE_ENV === 'production';
  }
};

module.exports = config;