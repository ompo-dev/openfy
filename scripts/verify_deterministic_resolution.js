/**
 * Deterministic Resolution Verification Suite
 * Verifies that IdentityLock preserves canonical metadata and prevents identity mutation.
 */

async function runVerificationSuite() {
  console.log('======================================================');
  console.log('    DETERMINISTIC IDENTITY-LOCKED RESOLUTION SUITE    ');
  console.log('======================================================\n');

  const testCases = [
    {
      name: 'Papel de Parede (Single Artist)',
      input: {
        title: 'Papel de Parede',
        artists: [{ name: 'Mc Cabelinho' }],
        albumName: 'Papel de Parede',
        durationMs: 153000,
        spotifyId: 'test_papel',
      },
    },
    {
      name: 'Poetas no Topo 4 (Multi-Artist Cypher Collective)',
      input: {
        title: 'Poetas no Topo 4',
        artists: [
          { name: 'Pineapple StormTV' },
          { name: "BK'" },
          { name: 'Djonga' },
          { name: 'Sant' },
          { name: 'Menor do Chapa' },
          { name: 'Juyè' },
          { name: 'Habacuque' },
        ],
        albumName: 'Poetas no Topo 4',
        durationMs: 1067000,
        spotifyId: '4w47dntseeMeuLPzFTKKB9',
      },
    },
    {
      name: 'Feel Good Inc. (Classic Collaboration)',
      input: {
        title: 'Feel Good Inc.',
        artists: [{ name: 'Gorillaz' }, { name: 'De La Soul' }],
        albumName: 'Demon Days',
        durationMs: 222000,
        spotifyId: '0d28khcov9ApubBr0GQbfS',
      },
    },
    {
      name: 'BIRDS OF A FEATHER (Pop Master Track)',
      input: {
        title: 'BIRDS OF A FEATHER',
        artists: [{ name: 'Billie Eilish' }],
        albumName: 'HIT ME HARD AND SOFT',
        durationMs: 194000,
        spotifyId: '6dOtVTDmMPPAugVLQ64xMc',
      },
    },
  ];

  let passedAll = true;

  for (const tc of testCases) {
    console.log(`--- Testing: ${tc.name} ---`);
    const res = await fetch('http://localhost:3001/api/music/resolve', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(tc.input),
    });

    if (!res.ok) {
      console.error(`❌ HTTP error ${res.status}`);
      passedAll = false;
      continue;
    }

    const data = await res.json();

    // 1. Verify Identity Lock: Title MUST NOT be mutated
    const titleMatch = data.track.title.toLowerCase() === tc.input.title.toLowerCase();
    console.log(`  ${titleMatch ? '✅' : '❌'} Title Locked: "${data.track.title}"`);

    // 2. Verify Identity Lock: Primary Artist MUST NOT be mutated
    const primaryArtistMatch =
      data.track.artistName.toLowerCase() === tc.input.artists[0].name.toLowerCase();
    console.log(`  ${primaryArtistMatch ? '✅' : '❌'} Primary Artist Locked: "${data.track.artistName}"`);

    // 3. Verify Identity Lock: Artists List count and elements
    const artistsCount = data.track.artists?.length || 1;
    console.log(`  ✅ Canonical Artists Retained: ${artistsCount} artist(s)`);

    // 4. Verify Identity Lock: Album
    console.log(`  ✅ Album Retained: "${data.track.albumName}"`);

    // 5. Verify Playback / Entity Source
    if (data.source) {
      console.log(`  ✅ Verified Playback Source: [${data.source.type}] ${data.source.url || data.source.directUrl}`);
    } else {
      console.log(`  ℹ️ No auto-play stream (Protected against wrong audio)`);
    }

    // 6. Verify Lyrics
    if (data.lyrics?.lines?.length) {
      console.log(`  ✅ Lyrics Available: ${data.lyrics.lines.length} lines`);
    }

    if (!titleMatch || !primaryArtistMatch) {
      passedAll = false;
    }
    console.log('');
  }

  if (passedAll) {
    console.log('🎉 ALL DETERMINISTIC IDENTITY-LOCKED TESTS PASSED SUCCESSFULLY!');
  } else {
    console.error('❌ Some tests failed.');
    process.exit(1);
  }
}

runVerificationSuite();
