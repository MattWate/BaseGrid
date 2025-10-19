// dataProviders/supabaseProvider.js
const { createClient } = require('@supabase/supabase-js');
const DataProvider = require('./baseProvider');
const config = require('../config');

class SupabaseProvider extends DataProvider {
	constructor(supabaseConfig) {
	super();
	this.supabase = createClient(supabaseConfig.url, supabaseConfig.key);
	this.metadataCache = null;
	this.schemaCache = {};
	this.foreignKeyCache = {};
	this.lookupConfig = supabaseConfig.lookups || {};
	console.log('SupabaseProvider initialized');
  }

  isAuthRequired() {
    return true;
  }

  async login(email, password) {
    try {
      const { data, error } = await this.supabase.auth.signInWithPassword({
        email,
        password
      });
      
      if (error) throw error;
      
      return {
        success: true,
        user: {
          id: data.user.id,
          email: data.user.email
        }
      };
    } catch (error) {
      return {
        success: false,
        error: error.message || 'Invalid credentials'
      };
    }
  }

  async register(email, password) {
    try {
      const { data, error } = await this.supabase.auth.signUp({
        email,
        password
      });
      
      if (error) throw error;
      
      return {
        success: true,
        message: 'Account created successfully'
      };
    } catch (error) {
      return {
        success: false,
        error: error.message || 'Registration failed'
      };
    }
  }

  // Discover foreign key relationships for a table
  async discoverForeignKeys(tableName) {
    if (this.foreignKeyCache[tableName]) {
      return this.foreignKeyCache[tableName];
    }

    try {
      // Query PostgreSQL information_schema to get foreign key constraints
      const { data, error } = await this.supabase.rpc('get_foreign_keys', {
        table_name: tableName
      });
      
      if (error) {
        console.warn(`Could not fetch foreign keys for ${tableName}:`, error.message);
        return {};
      }
      
      const foreignKeys = {};
      if (data) {
        data.forEach(fk => {
          foreignKeys[fk.column_name] = {
            referencedTable: fk.foreign_table_name,
            referencedColumn: fk.foreign_column_name
          };
        });
      }
      
      this.foreignKeyCache[tableName] = foreignKeys;
      console.log(`Found ${Object.keys(foreignKeys).length} foreign keys for ${tableName}`);
      return foreignKeys;
    } catch (error) {
      console.warn(`Error discovering foreign keys for ${tableName}:`, error);
      return {};
    }
  }

  async discoverTables() {
    if (this.metadataCache) {
      return this.metadataCache;
    }

    try {
      const { data, error } = await this.supabase.rpc('get_public_tables');
      
      if (error) {
        console.error('Error calling get_public_tables:', error);
        return await this.discoverTablesFromConfig();
      }
      
      if (!data || data.length === 0) {
        console.warn('No tables found, using config fallback');
        return await this.discoverTablesFromConfig();
      }
      
      const tables = {};
      for (const row of data) {
        const tableName = row.table_name;
        tables[tableName] = {
          title: this.formatTitle(tableName),
          tableName: tableName,
          fields: await this.discoverTableSchema(tableName)
        };
      }
      
      this.metadataCache = tables;
      console.log(`Discovered ${Object.keys(tables).length} tables from Supabase`);
      return tables;
    } catch (error) {
      console.error('Error discovering tables:', error);
      return await this.discoverTablesFromConfig();
    }
  }

  async discoverTablesFromConfig() {
    const supabaseConfig = config.getSupabaseConfig();
    const tableList = supabaseConfig.tables || [];
    
    if (tableList.length === 0) {
      console.warn('No tables configured');
      return {};
    }
    
    const tables = {};
    for (const tableName of tableList) {
      try {
        tables[tableName] = {
          title: this.formatTitle(tableName),
          tableName: tableName,
          fields: await this.discoverTableSchema(tableName)
        };
      } catch (error) {
        console.error(`Error discovering schema for ${tableName}:`, error);
      }
    }
    
    this.metadataCache = tables;
    console.log(`Discovered ${Object.keys(tables).length} tables from config`);
    return tables;
  }

  async discoverTableSchema(tableName) {
    if (this.schemaCache[tableName]) {
      return this.schemaCache[tableName];
    }

    try {
      // Get foreign key relationships first
      const foreignKeys = await this.discoverForeignKeys(tableName);
      
      const { data, error } = await this.supabase
        .from(tableName)
        .select('*')
        .limit(1);
      
      if (error) throw error;
      
      if (!data || data.length === 0) {
        return [{ name: 'id', type: 'integer', readonly: true }];
      }
      
      const sampleRow = data[0];
      const fields = [];
      
      // Build fields from the sample row
      for (const [columnName, value] of Object.entries(sampleRow)) {
        if (columnName === 'created_at' || columnName === 'updated_at') {
          continue;
        }
        
        const field = {
          name: columnName,
          type: this.inferType(value, columnName, tableName),
          readonly: columnName === 'id'
        };
        
        // Check if this column is a foreign key
        if (foreignKeys[columnName]) {
          field.type = 'lu';
          field.luFile = foreignKeys[columnName].referencedTable;
          console.log(`Field ${tableName}.${columnName} is a lookup to ${field.luFile}`);
        }
        // Check manual lookup configuration (overrides FK detection)
        else if (this.lookupConfig[tableName] && this.lookupConfig[tableName][columnName]) {
          field.type = 'lu';
          field.luFile = this.lookupConfig[tableName][columnName];
          console.log(`Field ${tableName}.${columnName} is manually configured as lookup to ${field.luFile}`);
        }
        
        fields.push(field);
      }
      
      // Ensure 'id' is first
      fields.sort((a, b) => {
        if (a.name === 'id') return -1;
        if (b.name === 'id') return 1;
        return 0;
      });
      
      this.schemaCache[tableName] = fields;
      return fields;
    } catch (error) {
      console.error(`Error discovering schema for ${tableName}:`, error);
      return [{ name: 'id', type: 'integer', readonly: true }];
    }
  }

  inferType(value, columnName, tableName) {
    if (value === null || value === undefined) {
      return 'text';
    }
    
    const colLower = columnName.toLowerCase();
    
    if (colLower.includes('date') || colLower.includes('_at')) {
      return 'date';
    }
    
    if (typeof value === 'number') {
      return Number.isInteger(value) ? 'integer' : 'number';
    }
    
    if (typeof value === 'boolean') {
      return 'boolean';
    }
    
    if (typeof value === 'string' && !isNaN(Date.parse(value)) && value.match(/^\d{4}-\d{2}-\d{2}/)) {
      return 'date';
    }
    
    return 'text';
  }

  formatTitle(tableName) {
    return tableName
      .replace(/([A-Z])/g, ' $1')
      .replace(/_/g, ' ')
      .trim()
      .split(' ')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
      .join(' ');
  }

  async getTableMetadata(tableName) {
    const allMetadata = await this.discoverTables();
    return allMetadata[tableName];
  }

  async getTableData(tableName, userId) {
    try {
      const metadata = await this.getTableMetadata(tableName);
      if (!metadata) {
        throw new Error('Table not found');
      }

      const { data, error } = await this.supabase
        .from(tableName)
        .select('*')
        .order('id', { ascending: true });
      
      if (error) throw error;
      
      const rows = data.map(record => 
        metadata.fields.map(f => record[f.name])
      );
      
      return {
        object: tableName,
        title: metadata.title,
        headings: metadata.fields,
        rows: rows
      };
    } catch (error) {
      throw new Error(`Failed to fetch data: ${error.message}`);
    }
  }

  async getRowById(tableName, id, userId) {
    try {
      const metadata = await this.getTableMetadata(tableName);
      if (!metadata) {
        throw new Error('Table not found');
      }

      const { data, error } = await this.supabase
        .from(tableName)
        .select('*')
        .eq('id', id)
        .single();
      
      if (error) throw error;
      if (!data) throw new Error('Row not found');
      
      const row = metadata.fields.map(f => data[f.name]);
      
      return {
        object: tableName,
        title: metadata.title,
        headings: metadata.fields,
        row: row
      };
    } catch (error) {
      throw new Error(`Failed to fetch row: ${error.message}`);
    }
  }

  async insertRow(tableName, rowData, userId) {
    try {
      const metadata = await this.getTableMetadata(tableName);
      if (!metadata) {
        throw new Error('Table not found');
      }

      const inserts = {};
      metadata.fields.forEach((field) => {
        if (!field.readonly && field.name !== 'id') {
          inserts[field.name] = rowData[field.name];
        }
      });
      
      const { error } = await this.supabase
        .from(tableName)
        .insert([inserts]);
      
      if (error) throw error;
      
      return { success: true };
    } catch (error) {
      throw new Error(`Failed to insert row: ${error.message}`);
    }
  }

  async updateRow(tableName, id, rowData, userId) {
    try {
      const metadata = await this.getTableMetadata(tableName);
      if (!metadata) {
        throw new Error('Table not found');
      }

      const updates = {};
      metadata.fields.forEach((field) => {
        if (!field.readonly && field.name !== 'id') {
          updates[field.name] = rowData[field.name];
        }
      });
      
      const { error } = await this.supabase
        .from(tableName)
        .update(updates)
        .eq('id', id);
      
      if (error) throw error;
      
      return { success: true };
    } catch (error) {
      throw new Error(`Failed to update row: ${error.message}`);
    }
  }

  async deleteRow(tableName, id, userId) {
    try {
      const metadata = await this.getTableMetadata(tableName);
      if (!metadata) {
        throw new Error('Table not found');
      }

      const { error } = await this.supabase
        .from(tableName)
        .delete()
        .eq('id', id);
      
      if (error) throw error;
      
      return { success: true };
    } catch (error) {
      throw new Error(`Failed to delete row: ${error.message}`);
    }
  }

  async getLookupValues(tableName, fieldName) {
    try {
      const metadata = await this.getTableMetadata(tableName);
      if (!metadata) {
        throw new Error('Table not found');
      }

      const { data, error } = await this.supabase
        .from(tableName)
        .select('*')
        .order('id', { ascending: true });
      
      if (error) throw error;
      
      const firstField = metadata.fields.find(f => f.name !== 'id' && !f.name.includes('_at'));
      
      const values = data.map(record => record[firstField.name]);
      
      return { values };
    } catch (error) {
      throw new Error(`Failed to fetch lookup values: ${error.message}`);
    }
  }

  async getAvailableTables() {
    const metadata = await this.discoverTables();
    return Object.keys(metadata).map(tableName => ({
      name: tableName,
      title: metadata[tableName].title
    }));
  }
}

module.exports = SupabaseProvider;