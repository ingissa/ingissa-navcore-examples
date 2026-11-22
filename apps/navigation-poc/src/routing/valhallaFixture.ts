export const valhallaFixture = {
  trip: {
    summary: {
      length: 0.208,
      time: 32.244,
    },
    legs: [
      {
        length: 0.208,
        time: 32.244,
        shape: '_zzfaBl|hFaPm]_F{LsAUu@kBy@gCgAcEk@wB[aEmAbBkAhB_@z@Qr@O`ASfCArBDhBXhCt@fExCpPoT|R',
        maneuvers: [
          { type: 1, begin_shape_index: 0, instruction: 'Drive northeast on Victoria Embankment/A3211.' },
          { type: 15, begin_shape_index: 8, instruction: 'Turn left onto Savoy Place.' },
          { type: 10, begin_shape_index: 19, instruction: 'Turn right onto Savoy Hill.' },
          { type: 4, begin_shape_index: 20, instruction: 'You have arrived at your destination.' },
        ],
      },
    ],
  },
} as const;
