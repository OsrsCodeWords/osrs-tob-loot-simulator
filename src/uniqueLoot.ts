import { ref, type Ref } from 'vue';
import type { Loot } from './normalLoot';

export const uniqueLoot: Ref<Loot[]> = ref([
  { id: 106, name: 'Scythe of Vitur', img: '/osrs-tob-loot-simulator/items/scythe_of_vitur.png', weight: 1, unique: true },
  { id: 105, name: 'Ghrazi rapier', img: '/osrs-tob-loot-simulator/items/ghrazi_rapier.png', weight: 2, unique: true },
  {
    id: 104,
    name: 'Sanguinesti staff',
    img: '/osrs-tob-loot-simulator/items/sanguinesti_staff.png',
    weight: 2,
    unique: true,
  },
  {
    id: 103,
    name: 'Justiciar faceguard',
    img: '/osrs-tob-loot-simulator/items/justiciar_faceguard.png',
    weight: 2,
    unique: true,
  },
  {
    id: 102,
    name: 'Justiciar chestguard',
    img: '/osrs-tob-loot-simulator/items/justiciar_chestguard.png',
    weight: 2,
    unique: true,
  },
  {
    id: 101,
    name: 'Justiciar legguards',
    img: '/osrs-tob-loot-simulator/items/justiciar_legguards.png',
    weight: 2,
    unique: true,
  },
  {
    id: 100,
    name: 'Avernic defender hilt',
    img: '/osrs-tob-loot-simulator/items/avernic_defender_hilt.png',
    weight: 8,
    unique: true,
  },
]);
