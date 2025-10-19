// sitemapGenerator.js - Generate sitemap from discovered tables/files
const { DataProviderFactory } = require('./dataProviders');

class SitemapGenerator {
  constructor(dataProvider = null) {
    this.provider = dataProvider || DataProviderFactory.createProvider();
  }

  /**
   * Generate sitemap in the format expected by server.js
   * This matches the structure used in buildSidebarHtml()
   * @returns {Promise<Object>} Sitemap object with pages array
   */
  async generateSitemap() {
    try {
      const tables = await this.provider.getAvailableTables();
      
      const sitemap = {
        pages: [
          {
            title: 'Home',
            object: 'home',
            children: []
          },
          {
            title: 'Tables',
            url: '#',
            children: tables.map(table => ({
              title: table.title,
              object: table.name,
              children: []
            }))
          }
        ]
      };
      
      return sitemap;
    } catch (error) {
      console.error('Error generating sitemap:', error);
      throw error;
    }
  }

  /**
   * Generate flat sitemap (Option 1 format) for API or export
   * @returns {Promise<Object>} Simple sitemap with tables array
   */
  async generateFlatSitemap() {
    try {
      const tables = await this.provider.getAvailableTables();
      
      return {
        tables: tables.map(table => ({
          name: table.name,
          title: table.title,
          path: `/table/${table.name}`
        }))
      };
    } catch (error) {
      console.error('Error generating flat sitemap:', error);
      throw error;
    }
  }

  /**
   * Generate sitemap with metadata
   * @returns {Promise<Object>} Enhanced sitemap with metadata
   */
  async generateEnhancedSitemap() {
    try {
      const tables = await this.provider.getAvailableTables();
      const config = require('./config');
      
      return {
        metadata: {
          generatedAt: new Date().toISOString(),
          tableCount: tables.length,
          dataSource: config.getDataSourceType()
        },
        pages: [
          {
            title: 'Home',
            object: 'home',
            url: '/',
            children: []
          },
          {
            title: 'Tables',
            url: '#',
            children: tables.map(table => ({
              title: table.title,
              object: table.name,
              url: `/?object=${table.name}`,
              children: []
            }))
          }
        ]
      };
    } catch (error) {
      console.error('Error generating enhanced sitemap:', error);
      throw error;
    }
  }

  /**
   * Generate grouped sitemap by category
   * Groups tables by first word or prefix
   * @returns {Promise<Object>} Sitemap with tables grouped by category
   */
  async generateGroupedSitemap() {
    try {
      const tables = await this.provider.getAvailableTables();
      
      // Group tables by first word
      const groups = {};
      tables.forEach(table => {
        const firstWord = table.title.split(' ')[0];
        if (!groups[firstWord]) {
          groups[firstWord] = [];
        }
        groups[firstWord].push(table);
      });
      
      const groupedChildren = Object.keys(groups).sort().map(groupName => ({
        title: groupName,
        url: '#',
        children: groups[groupName].map(table => ({
          title: table.title,
          object: table.name,
          children: []
        }))
      }));
      
      return {
        pages: [
          {
            title: 'Home',
            object: 'home',
            children: []
          },
          ...groupedChildren
        ]
      };
    } catch (error) {
      console.error('Error generating grouped sitemap:', error);
      throw error;
    }
  }

  /**
   * Export sitemap as JSON string
   * @param {boolean} pretty - Whether to pretty-print
   * @returns {Promise<string>} JSON string
   */
  async toJSON(pretty = true) {
    const sitemap = await this.generateSitemap();
    return JSON.stringify(sitemap, null, pretty ? 2 : 0);
  }

  /**
   * Generate and save sitemap to file
   * @param {string} outputPath - Path to save sitemap.json
   * @returns {Promise<void>}
   */
  async saveToFile(outputPath = './sitemap.json') {
    const fs = require('fs').promises;
    const sitemap = await this.generateSitemap();
    await fs.writeFile(outputPath, JSON.stringify(sitemap, null, 2), 'utf8');
    console.log(`Sitemap saved to ${outputPath}`);
  }

  /**
   * Generate sitemap.js module export
   * @returns {Promise<string>} JavaScript module code
   */
  async toJavaScriptModule() {
    const sitemap = await this.generateSitemap();
    return `// sitemap.js - Auto-generated sitemap
module.exports = ${JSON.stringify(sitemap, null, 2)};
`;
  }

  /**
   * Save sitemap as a JavaScript module
   * @param {string} outputPath - Path to save sitemap.js
   * @returns {Promise<void>}
   */
  async saveAsModule(outputPath = './sitemap.js') {
    const fs = require('fs').promises;
    const code = await this.toJavaScriptModule();
    await fs.writeFile(outputPath, code, 'utf8');
    console.log(`Sitemap module saved to ${outputPath}`);
  }
}

// CLI usage
async function generateSitemapCLI() {
  const args = process.argv.slice(2);
  const format = args[0] || 'json';
  const outputPath = args[1];
  
  const generator = new SitemapGenerator();
  
  try {
    switch (format) {
      case 'json':
        if (outputPath) {
          await generator.saveToFile(outputPath);
        } else {
          const json = await generator.toJSON();
          console.log(json);
        }
        break;
      
      case 'js':
      case 'module':
        if (outputPath) {
          await generator.saveAsModule(outputPath);
        } else {
          const code = await generator.toJavaScriptModule();
          console.log(code);
        }
        break;
      
      case 'flat':
        const flat = await generator.generateFlatSitemap();
        console.log(JSON.stringify(flat, null, 2));
        break;
      
      case 'enhanced':
        const enhanced = await generator.generateEnhancedSitemap();
        console.log(JSON.stringify(enhanced, null, 2));
        break;
      
      case 'grouped':
        const grouped = await generator.generateGroupedSitemap();
        console.log(JSON.stringify(grouped, null, 2));
        break;
      
      default:
        console.error('Unknown format. Use: json, js, flat, enhanced, or grouped');
        process.exit(1);
    }
  } catch (error) {
    console.error('Error generating sitemap:', error.message);
    process.exit(1);
  }
}

// Run CLI if executed directly
if (require.main === module) {
  generateSitemapCLI();
}

module.exports = SitemapGenerator;