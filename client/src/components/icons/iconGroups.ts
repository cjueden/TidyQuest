import { EXTRA_ICON_OPTIONS } from './TaskIconsExtra';

/**
 * The icon picker's groups: the original 56 household icons by room, then the family-activity ones
 * (TaskIconsExtra.tsx). Group names are i18n `iconGroups.<id>`; icon names `taskIcons.<key>`.
 */
const extra = (group: string) => EXTRA_ICON_OPTIONS.filter((o) => o.group === group).map((o) => o.key as string);

export const ICON_GROUPS: Array<{ id: string; keys: string[] }> = [
  { id: 'kitchen', keys: ['dishes', 'sink', 'stove', 'counter', 'fridge', 'oven', 'microwave', 'kettle', 'rangehood', 'pantry', 'cabinet', ...extra('cooking')] },
  { id: 'bathroom', keys: ['toilet', 'shower', 'showerhead', 'mirror', 'towel', 'drain', 'bathmat', 'toothbrush', 'grout'] },
  { id: 'bedroom', keys: ['bed', 'pillow', 'sheets', 'mattress', 'nightstand'] },
  { id: 'cleaning', keys: ['vacuum', 'mop', 'dust', 'sweep', 'broom', 'cobweb', 'chemicals', 'window', 'curtain', 'trash'] },
  { id: 'laundry', keys: ['washer', 'dryer', 'detergent', 'iron', 'clothes', ...extra('laundry')] },
  { id: 'living', keys: ['sofa', 'tv', 'lamp', 'furniture', 'rug', 'lightswitch'] },
  { id: 'office', keys: ['desk', 'keyboard', 'monitor', 'cable', 'chair'] },
  { id: 'storage', keys: ['shelf', 'drawer', 'closet'] },
  { id: 'pets', keys: extra('pets') },
  { id: 'yard', keys: extra('yard') },
  { id: 'car', keys: [...extra('car'), 'tools', 'garagedoor'] },
  { id: 'upkeep', keys: extra('upkeep') },
  { id: 'errands', keys: extra('errands') },
  { id: 'school', keys: extra('school') },
  { id: 'work', keys: extra('work') },
  { id: 'wins', keys: [...extra('wins'), 'sparkle'] },
];

export const EXTRA_KEYS = new Set<string>(EXTRA_ICON_OPTIONS.map((o) => o.key));
