import fs from 'fs';

class StatsGenerator {
  constructor() {
    this.codesFile = './data/premium-codes.json';
    this.logsFile = './data/usage-logs.json';
  }

  generateReport() {
    console.log('📊 CarMaster Premium Statistics Report');
    console.log('=' .repeat(50));
    console.log(`Generated: ${new Date().toISOString()}`);
    console.log('');

    const data = JSON.parse(fs.readFileSync(this.codesFile, 'utf8'));
    const logs = JSON.parse(fs.readFileSync(this.logsFile, 'utf8'));
    
    const codes = Object.values(data.codes);
    
    // Statistics generali
    console.log('📈 GENERAL STATISTICS');
    console.log('-'.repeat(30));
    console.log(`Total Codes: ${codes.length}`);
    console.log(`Used Codes: ${codes.filter(c => c.currentUses > 0).length}`);
    console.log(`Unused Codes: ${codes.filter(c => c.currentUses === 0).length}`);
    console.log(`Expired Codes: ${codes.filter(c => new Date() > new Date(c.expiresAt)).length}`);
    console.log(`Usage Rate: ${((codes.filter(c => c.currentUses > 0).length / codes.length) * 100).toFixed(1)}%`);
    console.log('');

    // Breakdown per tipo
    console.log('🏷️ BREAKDOWN BY TYPE');
    console.log('-'.repeat(30));
    const typeStats = {};
    codes.forEach(code => {
      if (!typeStats[code.type]) {
        typeStats[code.type] = { total: 0, used: 0 };
      }
      typeStats[code.type].total++;
      if (code.currentUses > 0) typeStats[code.type].used++;
    });

    Object.entries(typeStats).forEach(([type, stats]) => {
      const usageRate = ((stats.used / stats.total) * 100).toFixed(1);
      console.log(`${type.toUpperCase()}: ${stats.total} total, ${stats.used} used (${usageRate}%)`);
    });
    console.log('');

    // Activations recenti
    console.log('🕒 RECENT ACTIVATIONS (Last 10)');
    console.log('-'.repeat(30));
    const recentLogs = logs.logs.slice(-10).reverse();
    recentLogs.forEach(log => {
      const date = new Date(log.timestamp).toLocaleDateString();
      const time = new Date(log.timestamp).toLocaleTimeString();
      const device = log.deviceId.substring(0, 8) + '...';
      console.log(`${date} ${time} - ${log.code.split('-')[1]} - Device: ${device}`);
    });
    console.log('');

    // Codici in scadenza
    console.log('⚠️ EXPIRING SOON (Next 7 days)');
    console.log('-'.repeat(30));
    const oneWeek = new Date();
    oneWeek.setDate(oneWeek.getDate() + 7);
    
    const expiringSoon = codes.filter(code => 
      code.currentUses === 0 && 
      new Date(code.expiresAt) <= oneWeek &&
      new Date(code.expiresAt) > new Date()
    );

    if (expiringSoon.length === 0) {
      console.log('✅ No codes expiring in the next week');
    } else {
      expiringSoon.forEach(code => {
        const daysLeft = Math.ceil((new Date(code.expiresAt) - new Date()) / (1000 * 60 * 60 * 24));
        console.log(`${Object.keys(data.codes).find(key => data.codes[key] === code)} (${code.type}) - ${daysLeft} days left`);
      });
    }
    console.log('');

    // Revenue estimate
    console.log('💰 REVENUE ESTIMATE');
    console.log('-'.repeat(30));
    const priceMap = { customer: 19.90, influencer: 0, demo: 0, launch: 19.90, promo: 9.90 };
    let totalRevenue = 0;
    Object.entries(typeStats).forEach(([type, stats]) => {
      const revenue = stats.used * (priceMap[type] || 0);
      totalRevenue += revenue;
      console.log(`${type.toUpperCase()}: €${revenue.toFixed(2)} (${stats.used} × €${priceMap[type] || 0})`);
    });
    console.log(`TOTAL ESTIMATED REVENUE: €${totalRevenue.toFixed(2)}`);
  }
}

// CLI Usage
if (process.argv[1].endsWith('stats.js')) {
  const generator = new StatsGenerator();
  generator.generateReport();
}

export { StatsGenerator };
