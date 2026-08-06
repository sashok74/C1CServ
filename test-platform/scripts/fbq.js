// Хелпер вызова процедур Firebird через локальный fb-port POST /query.
// ВАЖНО (контракт fb-port): параметры со значениями 0, '' и null уходят в базу как NULL
// (`if (!paramValue) return null`) — передавать только положительные ID и непустые строки.
import axios from 'axios';

const FBPORT_URL = process.env.FBPORT_URL || 'http://127.0.0.1:3333';

export async function fbq(procedureName, prm = {}, transactonType = 'READ_ONLY') {
  try {
    const res = await axios.post(`${FBPORT_URL}/query`, { procedureName, transactonType, prm }, { timeout: 60000 });
    return res.data;
  } catch (err) {
    const sqlerror = err.response?.data?.sqlerror;
    throw new Error(sqlerror ? `${procedureName}: ${String(sqlerror).replace(/\n/g, ' ')}` : err.message);
  }
}
