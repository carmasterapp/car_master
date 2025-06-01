import fs from 'fs';
import crypto from 'crypto';
import path from 'path';

class CarMasterCodeGenerator {
  constructor() {
    this.codesFile = './data/premium-codes.json';
    this.masterKey = process.env.CARMASTER_MASTER_KEY || 'default-dev-key-change-in-production';
  }

  loadData() {
    if (!fs.existsSync(this.codesFile)) {
      throw new Error('premium-codes.json not found! Run from repository root.');
    }
    return JSON.parse(fs.readFileSync(this.codesFile, 'utf8'));
  }

  saveData(data) {
    data.metadata.lastUpdated = new Date().toISOString();
    data.metadata.totalCodes = Object.keys(data.codes).length;
    data.metadata.totalUsed = Object.values(data.codes).filter(c => c.currentUses > 0).length;
    
    fs.writeFileSync(this.codesFile, JSON.stringify(data, null, 2));
  }

  generateSecureCode(prefix = 'CARMASTER', type = 'customer') {
    const typeMap = {
      customer: 'CUST',
      influencer: 'INFL', 
      demo: 'DEMO',
      launch: 'LNCH',
      promo: 'PRMO'
    };
    
    const typeCode = typeMap[type] || 'CUST';
    
    // Random bytes sicuri
    const randomBytes = crypto.randomBytes(8);
    const randomHex = randomBytes.toString('hex').toUpperCase();
    
    // Checksum per validazione integrità
    const dataToHash = `${prefix}-${typeCode}-${randomHex}-${this.masterKey}`;
    const checksum = crypto
      .createHash('sha256')
      .update(dataToHash)
      .digest('hex')
      .substring(0, 4)
      .toUpperCase();
    
    // Formato: CARMASTER-CUST-A1B2C3D4-E5F6
    const formatted = randomHex.match(/.{4}/g).join('');
    return `${prefix}-${typeCode}-${formatted}-${checksum}`;
  }

  addCodes(count, type = 'customer', options = {}) {
    const data = this.loadData();
    const batchId = options.batch || `BATCH_${Date.now()}`;
    const newCodes = [];

    console.log(`🚀 Generating ${count} ${type} codes...`);

    for (let i = 0; i < count; i++) {
      let code;
      let attempts = 0;
      
      // Assicurati che il codice sia unico
      do {
        code = this.generateSecureCode('CARMASTER', type);
        attempts++;
        if (attempts > 50) {
          throw new Error('Too many attempts to generate unique code');
        }
      } while (data.codes[code]);

      const codeData = {
        type,
        status: 'unused',
        features: this.getFeatures(type),
        expiresAt: this.getExpirationDate(type),
        maxUses: this.getMaxUses(type),
        currentUses: 0,
        createdAt: new Date().toISOString(),
        devices: [],
        batch: batchId,
        notes: options.notes || `Generated ${type} code`
      };

      data.codes[code] = codeData;
      newCodes.push(code);
      
      console.log(`✅ Generated: ${code}`);
    }

    this.saveData(data);
    
    // Export per file separato
    this.exportNewCodes(newCodes, type, batchId);
    
    return newCodes;
  }

  getFeatures(type) {
    switch (type) {
      case 'demo':
        return ['quiz'];
      case 'promo':
        return ['quiz', 'guides'];
      case 'customer':
      case 'influencer':
      case 'launch':
        return ['all'];
      default:
        return ['all'];
    }
  }

  getExpirationDate(type) {
    const now = new Date();
    switch (type) {
      case 'demo':
        return new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString(); // 7 giorni
      case 'promo':
        return new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000).toISOString(); // 30 giorni
      case 'launch':
        return new Date(now.getTime() + 90 * 24 * 60 * 60 * 1000).toISOString(); // 90 giorni
      case 'customer':
        return new Date(now.getTime() + 365 * 24 * 60 * 60 * 1000).toISOString(); // 1 anno
      case 'influencer':
        return new Date(now.getTime() + 2 * 365 * 24 * 60 * 60 * 1000).toISOString(); // 2 anni
      default:
        return new Date(now.getTime() + 365 * 24 * 60 * 60 * 1000).toISOString();
    }
  }

  getMaxUses(type) {
    switch (type) {
      case 'demo': return 1;
      case 'promo': return 1;
      case 'customer': return 1;
      case 'launch': return 1;
      case 'influencer': return 5; // Influencer può condividere
      default: return 1;
    }
  }

  exportNewCodes(codes, type, batchId) {
    const timestamp = new Date().toISOString().split('T')[0];
    const filename = `generated-codes-${type}-${timestamp}.txt`;
    
    const content = [
      `# CarMaster Premium Codes`,
      `# Type: ${type.toUpperCase()}`,
      `# Generated: ${new Date().toISOString()}`,
      `# Batch: ${batchId}`,
      `# Count: ${codes.length}`,
      ``,
      `# IMPORTANT: Keep these codes secure!`,
      `# Each code can only be used ${this.getMaxUses(type)} time(s)`,
      ``,
      ...codes
    ].join('\n');

    fs.writeFileSync(filename, content);
    console.log(`📁 Codes exported to: ${filename}`);
  }

  validateCodeStructure(code) {
    // Verifica formato base
    const parts = code.split('-');
    if (parts.length !== 4) return false;
    
    const [prefix, typeCode, randomPart, checksum] = parts;
    
    if (prefix !== 'CARMASTER') return false;
    if (!['CUST', 'INFL', 'DEMO', 'LNCH', 'PRMO'].includes(typeCode)) return false;
    if (randomPart.length !== 8) return false;
    if (checksum.length !== 4) return false;
    
    // Verifica checksum
    const dataToHash = `${prefix}-${typeCode}-${randomPart}-${this.masterKey}`;
    const expectedChecksum = crypto
      .createHash('sha256')
      .update(dataToHash)
      .digest('hex')
      .substring(0, 4)
      .toUpperCase();
    
    return checksum === expectedChecksum;
  }

  getStats() {
    const data = this.loadData();
    const codes = Object.values(data.codes);
    
    const stats = {
      total: codes.length,
      unused: codes.filter(c => c.status === 'unused').length,
      used: codes.filter(c => c.currentUses > 0).length,
      expired: codes.filter(c => new Date() > new Date(c.expiresAt)).length,
      byType: {},
      byBatch: {},
      recentActivations: 0
    };
    
    // Breakdown per tipo
    codes.forEach(code => {
      stats.byType[code.type] = (stats.byType[code.type] || 0) + 1;
      stats.byBatch[code.batch] = (stats.byBatch[code.batch] || 0) + 1;
    });
    
    // Attivazioni recenti (ultimi 7 giorni)
    const weekAgo = new Date();
    weekAgo.setDate(weekAgo.getDate() - 7);
    
    codes.forEach(code => {
      if (code.devices.length > 0) {
        // Assumiamo che l'ultima attivazione sia recente se il codice è stato usato
        stats.recentActivations++;
      }
    });
    
    return stats;
  }
}

// CLI Usage
if (process.argv[1].endsWith('generate-codes.js')) {
  const generator = new CarMasterCodeGenerator();
  
  const count = parseInt(process.argv[2]) || 10;
  const type = process.argv[3] || 'customer';
  const notes = process.argv[4] || undefined;
  
  console.log(`🎯 CarMaster Code Generator`);
  console.log(`📊 Count: ${count}`);
  console.log(`🏷️ Type: ${type}`);
  console.log('');
  
  try {
    const codes = generator.addCodes(count, type, { notes });
    
    console.log('');
    console.log(`🎉 SUCCESS! Generated ${codes.length} codes`);
    console.log(`📋 Sample codes:`);
    codes.slice(0, 3).forEach(code => console.log(`   ${code}`));
    if (codes.length > 3) {
      console.log(`   ... and ${codes.length - 3} more in export file`);
    }
    
    // Stats finali
    const stats = generator.getStats();
    console.log('');
    console.log(`📈 Total codes in system: ${stats.total}`);
    console.log(`💰 Usage rate: ${((stats.used / stats.total) * 100).toFixed(1)}%`);
    
  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

export { CarMasterCodeGenerator };
