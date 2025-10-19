// dataProviders/textFileProvider.js
const fs = require('fs').promises;
const path = require('path');
const DataProvider = require('./baseProvider');
const config = require('../config');

class TextFileProvider extends DataProvider {
  constructor(textFilesConfig) {
    super();
    this.dataDirectory = textFilesConfig.dataPath || './data';
    this.authRequired = textFilesConfig.authRequired || false;
    this.lookupConfig = textFilesConfig.lookups || {};
    console.log('TextFileProvider initialized');
  }

  isAuthRequired() {
    return this.authRequired;
  }

  async login(email, password) {
    if (!this.authRequired) {
      return { success: true, user: { id: 'guest', email: 'guest' } };
    }

    return {
      success: true,
      user: { id: email, email: email }
    };
  }

  async register(email, password) {
    if (!this.authRequired) {
      return { success: true, message: 'Registration not required' };
    }

    return {
      success: true,
      message: 'Account created successfully'
    };
  }

  getFilePath(tableName) {
    return path.join(this.dataDirectory, `${tableName}.txt`);
  }

  parseCSVLine(line) {
    const result = [];
    let current = '';
    let inQuotes = false;
    
    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      
      if (char === '"') {
        inQuotes = !inQuotes;
      } else if (char === ',' && !inQuotes) {
        result.push(current.trim());
        current = '';
      } else {
        current += char;
      }
    }
    
    result.push(current.trim());
    
    return result;
  }

  async readFile(tableName) {
    try {
      const filePath = this.getFilePath(tableName);
      const content = await fs.readFile(filePath, 'utf8');
      const lines = content.split('\n').filter(line => line.trim());
      
      if (lines.length === 0) {
        return { headers: null, rows: [] };
      }
      
      const firstLine = this.parseCSVLine(lines[0]);
      let headers = null;
      let startIndex = 0;
      
      if (firstLine.some(field => field.includes(':'))) {
        headers = firstLine.map(field => {
          const parts = field.split(':').map(s => s.trim());
          const name = parts[0] || 'Unknown';
          let type = this.mapTypeCode(parts[1]);
          let luFile = null;
          
          // Check if this is a lookup field (format: "fieldname:lu:tablename")
          if (parts[1] && parts[1].toLowerCase() === 'lu' && parts[2]) {
            type = 'lu';
            luFile = parts[2];
          }
          // Check manual lookup configuration
          else if (this.lookupConfig[tableName] && this.lookupConfig[tableName][name]) {
            type = 'lu';
            luFile = this.lookupConfig[tableName][name];
          }
          
          const fieldDef = { name, type };
          if (luFile) {
            fieldDef.luFile = luFile;
          }
          return fieldDef;
        });
        startIndex = 1;
      }
      
      const rows = [];
      let needsUpdate = false;
      let nextId = 1;
      
      for (let i = startIndex; i < lines.length; i++) {
        const fields = this.parseCSVLine(lines[i]);
        
        if (!fields[0] || fields[0].trim() === '' || isNaN(parseInt(fields[0]))) {
          fields.unshift(String(nextId));
          nextId++;
          needsUpdate = true;
        } else {
          const currentId = parseInt(fields[0]);
          if (currentId >= nextId) {
            nextId = currentId + 1;
          }
        }
        
        rows.push(fields);
      }
      
      if (needsUpdate) {
        console.log(`Adding missing IDs to ${tableName} and saving...`);
        await this.writeFile(tableName, rows, headers);
      }
      
      return { headers, rows };
    } catch (error) {
      if (error.code === 'ENOENT') {
        return { headers: null, rows: [] };
      }
      throw error;
    }
  }

  mapTypeCode(code) {
    if (!code) return 'text';
    
    const lowerCode = code.toLowerCase();
    switch (lowerCode) {
      case 'int':
      case 'integer':
        return 'integer';
      case 'num':
      case 'number':
        return 'number';
      case 'dat':
      case 'date':
        return 'date';
      case 'bool':
      case 'boolean':
        return 'boolean';
      case 'lu':
      case 'lookup':
        return 'lu';
      case 'str':
      case 'string':
      case 'text':
      default:
        return 'text';
    }
  }

  async writeFile(tableName, rows, headers = null) {
    try {
      const filePath = this.getFilePath(tableName);
      
      const allLines = [];
      
      if (headers) {
        const headerLine = headers.map(h => {
          if (h.type === 'lu' && h.luFile) {
            return `${h.name}:lu:${h.luFile}`;
          }
          const typeCode = this.getTypeCode(h.type);
          return `${h.name}:${typeCode}`;
        }).join(',');
        allLines.push(headerLine);
      }
      
      const csvRows = rows.map(row => {
        return row.map(field => {
          const fieldStr = String(field || '');
          if (fieldStr.includes(',') || fieldStr.includes('"') || fieldStr.includes('\n')) {
            return '"' + fieldStr.replace(/"/g, '""') + '"';
          }
          return fieldStr;
        }).join(',');
      });
      
      allLines.push(...csvRows);
      const content = allLines.join('\n');
      await fs.writeFile(filePath, content, 'utf8');
    } catch (error) {
      throw new Error(`Failed to write file: ${error.message}`);
    }
  }

  getTypeCode(type) {
    switch (type) {
      case 'integer': return 'int';
      case 'number': return 'num';
      case 'date': return 'dat';
      case 'boolean': return 'bool';
      case 'lu': return 'lu';
      case 'text':
      default: return 'str';
    }
  }

  async getTableData(tableName, userId) {
    try {
      const { headers, rows } = await this.readFile(tableName);
      
      let fields;
      if (headers) {
        fields = headers.map((h, idx) => ({
          ...h,
          readonly: h.name.toLowerCase() === 'id'
        }));
      } else {
        if (rows.length > 0) {
          fields = rows[0].map((_, idx) => ({
            name: idx === 0 ? 'id' : `Column${idx}`,
            type: 'text',
            readonly: idx === 0
          }));
        } else {
          fields = [{ name: 'id', type: 'integer', readonly: true }];
        }
      }
      
      const metadata = {
        title: this.formatTitle(tableName),
        tableName: tableName,
        fields: fields
      };
      
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

  formatTitle(tableName) {
    return tableName
      .replace(/([A-Z])/g, ' $1')
      .replace(/_/g, ' ')
      .trim()
      .split(' ')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
      .join(' ');
  }

  async getRowById(tableName, id, userId) {
    try {
      const { headers, rows } = await this.readFile(tableName);
      const row = rows.find(r => r[0] === String(id));
      
      if (!row) {
        throw new Error('Row not found');
      }
      
      let fields;
      if (headers) {
        fields = headers.map(h => ({
          ...h,
          readonly: h.name.toLowerCase() === 'id'
        }));
      } else {
        fields = row.map((_, idx) => ({
          name: idx === 0 ? 'id' : `Column${idx}`,
          type: 'text',
          readonly: idx === 0
        }));
      }
      
      const metadata = {
        title: this.formatTitle(tableName),
        tableName: tableName,
        fields: fields
      };
      
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
      const { headers, rows } = await this.readFile(tableName);
      
      const fields = headers || (rows.length > 0 ? rows[0].map((_, idx) => ({
        name: idx === 0 ? 'id' : `Column${idx}`,
        type: 'text',
        readonly: idx === 0
      })) : [{ name: 'id', type: 'integer', readonly: true }]);
      
      let maxId = 0;
      rows.forEach(r => {
        const id = parseInt(r[0]);
        if (!isNaN(id) && id > maxId) {
          maxId = id;
        }
      });
      const newId = maxId + 1;
      
      const newRow = fields.map((field, idx) => {
        if (field.name.toLowerCase() === 'id') {
          return String(newId);
        }
        return rowData[field.name] || '';
      });
      
      rows.push(newRow);
      await this.writeFile(tableName, rows, headers);
      
      return { success: true };
    } catch (error) {
      throw new Error(`Failed to insert row: ${error.message}`);
    }
  }

  async updateRow(tableName, id, rowData, userId) {
    try {
      const { headers, rows } = await this.readFile(tableName);
      const rowIndex = rows.findIndex(r => r[0] === String(id));
      
      if (rowIndex === -1) {
        throw new Error('Row not found');
      }
      
      const fields = headers || rows[0].map((_, idx) => ({
        name: idx === 0 ? 'id' : `Column${idx}`,
        type: 'text',
        readonly: idx === 0
      }));
      
      rows[rowIndex] = fields.map((field, idx) => {
        if (field.readonly) {
          return rows[rowIndex][idx];
        }
        return rowData[field.name] || '';
      });
      
      await this.writeFile(tableName, rows, headers);
      
      return { success: true };
    } catch (error) {
      throw new Error(`Failed to update row: ${error.message}`);
    }
  }

  async deleteRow(tableName, id, userId) {
    try {
      const { headers, rows } = await this.readFile(tableName);
      const filteredRows = rows.filter(r => r[0] !== String(id));
      
      if (rows.length === filteredRows.length) {
        throw new Error('Row not found');
      }
      
      await this.writeFile(tableName, filteredRows, headers);
      
      return { success: true };
    } catch (error) {
      throw new Error(`Failed to delete row: ${error.message}`);
    }
  }

  async getLookupValues(tableName, fieldName) {
    try {
      const { headers, rows } = await this.readFile(tableName);
      
      const firstFieldIndex = 1;
      
      const values = rows.map(row => row[firstFieldIndex]);
      
      return { values };
    } catch (error) {
      throw new Error(`Failed to fetch lookup values: ${error.message}`);
    }
  }

  async getAvailableTables() {
    try {
      const files = await fs.readdir(this.dataDirectory);
      
      const txtFiles = files.filter(file => file.endsWith('.txt'));
      
      return txtFiles.map(file => {
        const tableName = file.replace('.txt', '');
        return {
          name: tableName,
          title: this.formatTitle(tableName)
        };
      }).sort((a, b) => a.title.localeCompare(b.title));
    } catch (error) {
      console.error('Error reading data directory:', error);
      return [];
    }
  }
}

module.exports = TextFileProvider;