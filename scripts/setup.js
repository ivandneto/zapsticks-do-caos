// Baixa (ou atualiza) o yt-dlp e, se faltar, o ffmpeg para a pasta bin/.
// O app já faz isso sozinho ao iniciar; este comando serve para forçar a atualização.
import { ensureTools, bin } from '../lib/tools.js';

await ensureTools({ force: true });
console.log(`yt-dlp: ${bin('yt-dlp')}\nffmpeg: ${bin('ffmpeg')}`);
