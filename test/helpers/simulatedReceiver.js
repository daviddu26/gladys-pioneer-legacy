// -----------------------------------------------------------------------------
// A tiny simulated Pioneer receiver: enough state to answer what the
// integration asks. `profile` picks what it supports, like a real model:
//   - 'vsx-528': main zone only, no names, no ?S (measured on the real one)
//   - 'full'   : zone 2, input names and ?S, like the bigger models
// -----------------------------------------------------------------------------

export function simulatedReceiver(profile = 'vsx-528') {
  const full = profile === 'full';
  const state = { power: 0, vol: 69, mute: 1, input: '25', z2power: 1, z2vol: 61, sr: '0112' };
  const pad = (n, width) => String(n).padStart(width, '0');
  return {
    state,
    answer(command) {
      const main = {
        '?P': [`PWR${state.power}`],
        '?V': [`VOL${pad(state.vol, 3)}`],
        '?M': [`MUT${state.mute}`],
        '?F': [`FN${state.input}`],
        '?RGD': [full ? 'RGD<004><VSX-1120/KUXJ>' : 'RGD<003><VSX-528/SYXE8    >'],
      }[command];
      if (main) {
        return main;
      }
      switch (command) {
        case 'PF':
          state.power = 2;
          return ['PWR2'];
        case 'PO':
          state.power = 0;
          return ['PWR0', `VOL${pad(state.vol, 3)}`];
        case 'VU':
          state.vol += 2;
          return [`VOL${pad(state.vol, 3)}`];
        case 'VD':
          state.vol -= 2;
          return [`VOL${pad(state.vol, 3)}`];
        case 'MO':
          state.mute = 0;
          return ['MUT0'];
        case 'MF':
          state.mute = 1;
          return ['MUT1'];
        default:
      }
      if (/^\d\dFN$/.test(command)) {
        state.input = command.slice(0, 2);
        return [`FN${state.input}`];
      }
      if (!full) {
        return [];
      }
      if (command === '?S') {
        return [`SR${state.sr}`];
      }
      if (command === '?AP') {
        return [`APR${state.z2power}`];
      }
      if (command === '?ZV') {
        return [`ZV${pad(state.z2vol, 2)}`];
      }
      if (command === 'ZU' || command === 'ZD') {
        state.z2vol += command === 'ZU' ? 1 : -1;
        return [`ZV${pad(state.z2vol, 2)}`];
      }
      if (command === '?Z2M') {
        return ['Z2MUT1'];
      }
      if (command === '?ZS') {
        return ['Z2F04'];
      }
      if (command === 'APO') {
        state.z2power = 0;
        return ['APR0'];
      }
      const name = { 19: 'HDMI 1', 25: 'BD', 4: 'DVD' }[Number(command.slice(4))];
      if (command.startsWith('?RGB') && name) {
        return [`RGB${command.slice(4)}0${name}`];
      }
      return [];
    },
  };
}
