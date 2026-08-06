import fs from 'fs';
import path from 'path';

// json-lines лог всего, что отдал мок: эталон «что отдали» для verify.
export class ServedLog {
  constructor(logDir) {
    this.file = path.join(logDir, 'served.jsonl');
    fs.mkdirSync(logDir, { recursive: true });
  }

  write(entry) {
    const line = JSON.stringify({ ts: new Date().toISOString(), ...entry });
    // синхронно: лог — оракул verify, потерянная строка = ложный результат сверки
    try {
      fs.appendFileSync(this.file, line + '\n');
    } catch (err) {
      console.error('servedLog append error:', err.message);
    }
  }

  readSince(sinceTs) {
    if (!fs.existsSync(this.file)) return [];
    const lines = fs.readFileSync(this.file, 'utf8').split('\n').filter(Boolean);
    const entries = lines.map((l) => JSON.parse(l));
    return sinceTs ? entries.filter((e) => e.ts >= sinceTs) : entries;
  }
}
