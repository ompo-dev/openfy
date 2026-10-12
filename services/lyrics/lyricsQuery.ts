const packaging = /^(?:(?:official\s+)?(?:music\s+)?(?:video|audio|visuali[sz]er|lyric(?:s|\s+video)?|m\/v|hd|hq|4k|full\s+song)|official)$/i;

export const lyricsSearchIdentity = (title: string, artist: string) => {
  const clean = title.replace(/[\[(]([^\])]+)[\])]/g, (whole, content: string) => {
    const value = content.trim();
    if (/^(?:feat\.?|ft\.?|featuring|with|prod\.?|produced\s+by)\s/i.test(value) || packaging.test(value)) return ' ';
    return whole;
  }).replace(/\s+(?:feat\.?|ft\.?|featuring)\s+[^\[(]*/gi, ' ')
    .replace(/\s+/g, ' ').trim().replace(/[,-]+$/, '').trim();
  const primary = artist.split(',')[0].replace(/\s+-\s+Topic$/i, '').trim();
  return { title: clean || title.trim(), artist: primary || artist.trim() };
};
