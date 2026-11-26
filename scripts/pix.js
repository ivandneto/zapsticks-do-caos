// Pix "copia e cola" estático (BR Code / EMV do Banco Central), sem valor fixo: quem paga escolhe quanto.
// Campos: 00 formato · 26 conta (GUI br.gov.bcb.pix + chave) · 52 categoria · 53 moeda (986 = real)
// · 58 país · 59 nome (até 25) · 60 cidade (até 15) · 62 txid (*** = sem identificador) · 63 CRC16.

const campo = (id, valor) => `${id}${String(valor.length).padStart(2, '0')}${valor}`;
// O padrão pede ASCII simples no nome e na cidade
const limpa = (s, max) => String(s).normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^A-Za-z0-9 .-]/g, '').trim().slice(0, max);

/** CRC16-CCITT (polinômio 0x1021, começa em 0xFFFF), em 4 dígitos hexadecimais maiúsculos. */
export function crc16(texto) {
  let crc = 0xffff;
  for (const byte of Buffer.from(texto, 'utf8')) {
    crc ^= byte << 8;
    for (let i = 0; i < 8; i++) crc = crc & 0x8000 ? ((crc << 1) ^ 0x1021) & 0xffff : (crc << 1) & 0xffff;
  }
  return crc.toString(16).toUpperCase().padStart(4, '0');
}

export function pixCopiaECola({ pixKey, nome, cidade, txid = '***' }) {
  if (!pixKey) throw new Error('Falta a chave Pix');
  const corpo = campo('00', '01')
    + campo('26', campo('00', 'br.gov.bcb.pix') + campo('01', pixKey))
    + campo('52', '0000')
    + campo('53', '986')
    + campo('58', 'BR')
    + campo('59', limpa(nome, 25))
    + campo('60', limpa(cidade, 15))
    + campo('62', campo('05', txid))
    + '6304';
  return corpo + crc16(corpo);
}
