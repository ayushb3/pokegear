import type { DecorReaction } from '../reactions';

// Oshawott is a Water-type: the potted plants are the one thing in the house it can help with.
// Its `!` pops, the plant shakes under a short shower of blue drops, then the narrator.
// About one watering in three something falls out instead (`drop`): a berry, or one of Ayush's keepsakes.
// Lines are generic on purpose. TODO(Ayush): the items marked `draft` are placeholders until he writes the specifics.
const reaction: DecorReaction = {
  lines: ['Oshawott used Water Gun!', 'The plant perks up.'],
  again: ['The plant has had plenty of water.', 'Oshawott is just showing off now.'],
  emote: { actor: 'follower', slot: 'emote.exclaim', ms: 900 },
  anim: { ms: 900, burst: '#5ab0ff' },
  drop: {
    chance: 1 / 3,
    lead: ['Oshawott used Water Gun!', 'Something fell out of the plant!'],
    emote: { actor: 'follower', slot: 'emote.exclaim', ms: 1600 },
    items: [
      { slot: 'item.oran-berry', lines: ["It's an Oran Berry!"] },
      { slot: 'item.pecha-berry', lines: ["It's a Pecha Berry!"] },
      { slot: 'item.cheri-berry', lines: ["It's a Cheri Berry!"] },
      { slot: 'item.medal', lines: ["It's one of Ayush's gymnastics medals!"], draft: true },
      { slot: 'item.labubu', lines: ["It's Ayush's Labubu!"], emote: 'emote.heart', draft: true },
      { slot: 'item.jellycat', lines: ["It's Ayush's Jellycat!"], emote: 'emote.heart', draft: true },
    ],
  },
};
export default reaction;
