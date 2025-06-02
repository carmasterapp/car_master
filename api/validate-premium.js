import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

export default async function handler(req, res) {
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }
  
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { code, deviceId, email } = req.body;
  
  // Validazione input
  if (!code || !deviceId) {
    return res.status(400).json({ 
      success: false, 
      error: 'Codice e device ID sono richiesti' 
    });
  }

  try {
    // Rate limiting semplice
    const rateLimitKey = `${deviceId}-${Date.now().toString().slice(0, -4)}`; // 10 secondi window
    const rateLimitFile = '/tmp/rate-limit.json';
    
    let rateLimitData = {};
    try {
      if (fs.existsSync(rateLimitFile)) {
        rateLimitData = JSON.parse(fs.readFileSync(rateLimitFile, 'utf8'));
      }
    } catch (e) {
      // Ignora errori di rate limiting
    }
    
    if (rateLimitData[rateLimitKey] && rateLimitData[rateLimitKey] > 5) {
      return res.status(429).json({ 
        success: false, 
        error: 'Troppi tentativi. Riprova tra qualche secondo.' 
      });
    }
    
    // Incrementa rate limit
    rateLimitData[rateLimitKey] = (rateLimitData[rateLimitKey] || 0) + 1;
    try {
      fs.writeFileSync(rateLimitFile, JSON.stringify(rateLimitData));
    } catch (e) {
      // Ignora errori di scrittura rate limit
    }

    // Leggi database codici
    const codesPath = path.join(process.cwd(), 'data', 'premium-codes.json');
    const data = JSON.parse(fs.readFileSync(codesPath, 'utf8'));
    
    const codeData = data.codes[code.toUpperCase()];
    
    if (!codeData) {
      return res.status(400).json({ 
        success: false, 
        error: 'Codice non valido' 
      });
    }

    // Verifica integrità codice
    if (!validateCodeIntegrity(code)) {
      return res.status(400).json({ 
        success: false, 
        error: 'Codice corrotto o non autentico' 
      });
    }

    // Verifica scadenza
    if (new Date() > new Date(codeData.expiresAt)) {
      return res.status(400).json({ 
        success: false, 
        error: 'Codice scaduto' 
      });
    }

    // Verifica se device già registrato
    if (codeData.devices.includes(deviceId)) {
      return res.status(200).json({
        success: true,
        message: 'Codice già attivato per questo dispositivo',
        features: codeData.features,
        type: codeData.type,
        alreadyActivated: true
      });
    }

    // Verifica limite utilizzi
    if (codeData.maxUses && codeData.currentUses >= codeData.maxUses) {
      return res.status(400).json({ 
        success: false, 
        error: 'Codice esaurito' 
      });
    }

    // ATTIVA IL CODICE
    codeData.currentUses++;
    codeData.devices.push(deviceId);
    codeData.status = 'used';
    codeData.lastUsed = new Date().toISOString();
    
    if (email) {
      codeData.email = email;
    }

    // Salva aggiornamento
    data.metadata.lastUpdated = new Date().toISOString();
    data.metadata.totalUsed = Object.values(data.codes).filter(c => c.currentUses > 0).length;
    
    fs.writeFileSync(codesPath, JSON.stringify(data, null, 2));

    // Log attivazione
    logActivation(code, deviceId, req);

    return res.status(200).json({
      success: true,
      message: 'Premium attivato con successo!',
      features: codeData.features,
      type: codeData.type,
      activatedAt: codeData.lastUsed
    });

  } catch (error) {
    console.error('Premium validation error:', error);
    return res.status(500).json({ 
      success: false, 
      error: 'Errore interno del server' 
    });
  }
}

function validateCodeIntegrity(code) {
  try {
    const parts = code.split('-');
    if (parts.length !== 4) return false;
    
    const [prefix, typeCode, randomPart, checksum] = parts;
    const masterKey = process.env.CARMASTER_MASTER_KEY || 'default-dev-key-change-in-production';
    
    const dataToHash = `${prefix}-${typeCode}-${randomPart}-${masterKey}`;
    const expectedChecksum = crypto
      .createHash('sha256')
      .update(dataToHash)
      .digest('hex')
      .substring(0, 4)
      .toUpperCase();
    
    return checksum === expectedChecksum;
  } catch (error) {
    return false;
  }
}

function logActivation(code, deviceId, req) {
  try {
    const logPath = path.join(process.cwd(), 'data', 'usage-logs.json');
    const logs = JSON.parse(fs.readFileSync(logPath, 'utf8') || '{"logs":[],"metadata":{}}');
    
    const logEntry = {
      code,
      deviceId,
      timestamp: new Date().toISOString(),
      ip: req.headers['x-forwarded-for'] || req.connection.remoteAddress,
      userAgent: req.headers['user-agent'],
      country: req.headers['cf-ipcountry'] || 'unknown' // Cloudflare header
    };
    
    logs.logs.push(logEntry);
    logs.metadata.totalActivations = logs.logs.length;
    logs.metadata.lastActivation = logEntry.timestamp;
    
    fs.writeFileSync(logPath, JSON.stringify(logs, null, 2));
  } catch (error) {
    console.error('Failed to log activation:', error);
    // Non bloccare l'attivazione per errori di log
  }
}
