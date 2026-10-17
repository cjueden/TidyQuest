export type TaskIconKey =
  | 'sparkle' | 'dishes' | 'sink' | 'stove' | 'counter' | 'fridge' | 'oven'
  | 'microwave' | 'kettle' | 'rangehood' | 'pantry' | 'cabinet'
  | 'bed' | 'pillow' | 'sheets' | 'mattress' | 'nightstand'
  | 'toilet' | 'shower' | 'mirror' | 'towel' | 'drain' | 'bathmat'
  | 'showerhead' | 'toothbrush' | 'grout'
  | 'vacuum' | 'mop' | 'dust' | 'sweep'
  | 'window' | 'curtain' | 'lightswitch'
  | 'sofa' | 'tv' | 'lamp' | 'furniture' | 'rug'
  | 'desk' | 'keyboard' | 'monitor' | 'cable' | 'chair'
  | 'trash' | 'broom'
  | 'washer' | 'dryer' | 'detergent' | 'iron' | 'clothes'
  | 'tools' | 'cobweb' | 'chemicals' | 'garagedoor'
  | 'shelf' | 'drawer' | 'closet'
  // Round 3: family activities (client/src/components/icons/TaskIconsExtra.tsx draws these)
  | 'dog' | 'cat' | 'petfood' | 'litter' | 'poop' | 'leash' | 'petbed' | 'petmeds' | 'fishtank'
  | 'mower' | 'rake' | 'wateringcan' | 'plant' | 'pool' | 'skimmer' | 'hose' | 'shovel' | 'weeds'
  | 'car' | 'carwash' | 'bike'
  | 'smokealarm' | 'extinguisher' | 'airfilter' | 'waterfilter' | 'battery' | 'lightbulb' | 'recycling' | 'mail'
  | 'groceries' | 'cart' | 'bills' | 'piggybank' | 'calendar'
  | 'cooking' | 'lunchbox' | 'table' | 'folding' | 'hanger'
  | 'homework' | 'backpack' | 'reportcard' | 'bus' | 'alarmclock' | 'bedtime' | 'hairbrush' | 'shoes' | 'toys' | 'reading'
  | 'briefcase' | 'phone' | 'trophy' | 'star' | 'streak' | 'medal' | 'heart';

/**
 * Family activities, checked before the room-by-room rules below (so "Wash Dog & Cat Beds" is a pet
 * bed, not a bed, and "Smoke Alarm Batteries" a smoke alarm). English words, matched as whole words.
 */
const ACTIVITY_RULES: Array<[RegExp, TaskIconKey]> = [
  [/\blitter\b/, 'litter'], [/\bpoop\b|\bpooper/, 'poop'], [/\bflea|\bheartworm|\bpet meds?\b|\bvet\b/, 'petmeds'],
  [/\bwalk\b.*\bdogs?\b|\bdogs?\b.*\bwalk/, 'leash'], [/\bfeed|\bpet food\b|\bpet bowls?\b/, 'petfood'],
  [/\b(dog|cat|pet)s?\b.*\bbeds?\b/, 'petbed'], [/\baquarium\b|\bfish tank\b/, 'fishtank'],
  [/\bdogs?\b|\bpupp(y|ies)\b/, 'dog'], [/\bcats?\b|\bkitten/, 'cat'],
  [/\bskim/, 'skimmer'], [/\bpool\b/, 'pool'], [/\bmow/, 'mower'], [/\brake\b|\bleaves\b/, 'rake'],
  [/\bwater\b.*\bplants?\b/, 'wateringcan'], [/\bhose\b/, 'hose'], [/\bweed/, 'weeds'], [/\bplants?\b|\bgarden/, 'plant'], [/\bsnow\b|\bshovel/, 'shovel'],
  [/\bcars?\b.*\bwash|\bwash\b.*\bcars?\b/, 'carwash'], [/\bcars?\b|\bvacuum the car/, 'car'], [/\bbikes?\b|\bbicycle/, 'bike'],
  [/\bsmoke\b|\bco alarm/, 'smokealarm'], [/\bextinguisher/, 'extinguisher'], [/\bhvac\b|\bair filter|\bfurnace filter/, 'airfilter'],
  [/\bwater filter/, 'waterfilter'], [/\bbatter(y|ies)\b/, 'battery'], [/\blight ?bulbs?\b|\bbulbs?\b/, 'lightbulb'], [/\bmail\b|\bpost office\b/, 'mail'],
  [/\bgrocer/, 'groceries'], [/\bshopping\b|\berrand/, 'cart'], [/\bbills?\b|\bbudget/, 'bills'], [/\bsav(e|ing)s?\b|\bpiggy/, 'piggybank'], [/\bcalendar\b|\bplanner\b/, 'calendar'],
  [/\bcook|\bmeal\b|\bdinner prep/, 'cooking'], [/\blunch/, 'lunchbox'], [/\bset\b.*\btable\b|\btable\b.*\bset\b/, 'table'],
  [/\bfold(s|ing|ed)?\b/, 'folding'], [/\bhang\b|\bhangers?\b/, 'hanger'],
  [/\bbedtime\b|\bbed time\b/, 'bedtime'], [/\bteeth\b|\btooth/, 'toothbrush'],
  [/\bhomework\b|\bstudy|\bschoolwork/, 'homework'], [/\bbackpack|\blaunch pad\b/, 'backpack'], [/\breport card|\bgrades?\b|\btest scores?\b/, 'reportcard'],
  [/\bbus\b/, 'bus'], [/\bstreak/, 'streak'], [/\bwake\b|\bon time\b|\balarm clock/, 'alarmclock'],
  [/\bhair\b/, 'hairbrush'], [/\bshoes?\b/, 'shoes'], [/\btoys?\b/, 'toys'], [/\bread(ing)?\b|\bbooks?\b/, 'reading'],
  [/\bwork\b|\bjob\b|\bshift\b/, 'briefcase'], [/\bphone\b|\bcheck[- ]in\b/, 'phone'],
  [/\bmedal\b/, 'medal'], [/\btroph|\bwin\b|\bwinner|\baward/, 'trophy'], [/\bawesome\b|\bstar\b/, 'star'], [/\bkind(ness)?\b|\bhelp(ed|ing)? (a |your )?(sibling|brother|sister)/, 'heart'],
];

export function suggestTaskIcon(name?: string | null, translationKey?: string | null): TaskIconKey {
  const s = `${name || ''} ${translationKey || ''}`.toLowerCase();

  for (const [re, key] of ACTIVITY_RULES) if (re.test(s)) return key;

  // Kitchen
  if (s.includes('dish') || s.includes('dishwasher') || s.includes('vaisselle') || s.includes('geschirrspul') || s.includes('lavaplatos')) return 'dishes';
  if (s.includes('sink') || s.includes('évier') || s.includes('evier') || s.includes('spüle') || s.includes('fregadero') || s.includes('clean_sink')) return 'sink';
  if (s.includes('stove') || s.includes('stovetop') || s.includes('plaque') || s.includes('herd') || s.includes('estufa') || s.includes('wipe_stovetop')) return 'stove';
  if (s.includes('counter') || s.includes('comptoir') || s.includes('arbeitsfl') || s.includes('encimera') || s.includes('clean_counters')) return 'counter';
  if (s.includes('fridge') || s.includes('freezer') || s.includes('congélateur') || s.includes('congelateur') || s.includes('gefrier') || s.includes('congelador') || s.includes('réfri') || s.includes('refri') || s.includes('kühlschrank') || s.includes('nevera') || s.includes('frigorifico') || s.includes('defrost_freezer')) return 'fridge';
  if (s.includes('oven') || s.includes('four') || s.includes('backofen') || s.includes('horno')) return 'oven';
  if (s.includes('microwave') || s.includes('micro-onde') || s.includes('mikrowelle') || s.includes('microondas')) return 'microwave';
  if (s.includes('kettle') || s.includes('bouilloire') || s.includes('wasserkocher') || s.includes('hervidor') || s.includes('descale_kettle')) return 'kettle';
  if (s.includes('range hood') || s.includes('hotte') || s.includes('dunstabzug') || s.includes('campana') || s.includes('range_hood')) return 'rangehood';
  if (s.includes('pantry') || s.includes('garde-manger') || s.includes('speisekammer') || s.includes('despensa') || s.includes('organize_pantry')) return 'pantry';
  if (s.includes('cabinet') || s.includes('placard') || s.includes('schrank') || s.includes('armario') || s.includes('cabinet_fronts')) return 'cabinet';
  if (s.includes('appliance') || s.includes('wipe_appliances')) return 'counter';

  // Bedroom
  if (s.includes('mattress') || s.includes('matelas') || s.includes('matratze') || s.includes('colchón') || s.includes('colchon') || s.includes('flip_mattress')) return 'mattress';
  if (s.includes('pillow') || s.includes('oreiller') || s.includes('kissen') || s.includes('almohada') || s.includes('wash_pillows')) return 'pillow';
  if (s.includes('sheet') || s.includes('drap') || s.includes('bettwäsche') || s.includes('bettwaesche') || s.includes('sábana') || s.includes('sabana') || s.includes('change_sheets')) return 'sheets';
  if (s.includes('duvet') || s.includes('comforter') || s.includes('couette') || s.includes('bettdecke') || s.includes('edredón') || s.includes('wash_duvet')) return 'sheets';
  if (s.includes('nightstand') || s.includes('table de nuit') || s.includes('nachttisch') || s.includes('mesita') || s.includes('tidy_nightstand')) return 'nightstand';
  if (s.includes('make bed') || s.includes('bed') || s.includes('make_bed') || s.includes('clean_under_bed')) return 'bed';

  // Bathroom
  if (s.includes('toilet') || s.includes('toilette') || s.includes('wc') || s.includes('scrub_toilet')) return 'toilet';
  if (s.includes('showerhead') || s.includes('pomme de douche') || s.includes('duschkopf') || s.includes('alcachofa') || s.includes('descale_showerhead')) return 'showerhead';
  if (s.includes('shower') || s.includes('douche') || s.includes('dusche') || s.includes('ducha') || s.includes('squeegee') || s.includes('shower_tub') || s.includes('shower_curtain') || s.includes('clean_shower')) return 'shower';
  if (s.includes('mirror') || s.includes('miroir') || s.includes('spiegel') || s.includes('espejo') || s.includes('clean_mirror')) return 'mirror';
  if (s.includes('towel') || s.includes('serviette') || s.includes('handtuch') || s.includes('toalla') || s.includes('wash_towels')) return 'towel';
  if (s.includes('drain') || s.includes('siphon') || s.includes('abfluss') || s.includes('desagüe') || s.includes('desague') || s.includes('shower_drain')) return 'drain';
  if (s.includes('bath mat') || s.includes('tapis de bain') || s.includes('badematte') || s.includes('alfombra de baño') || s.includes('wash_bath_mat')) return 'bathmat';
  if (s.includes('toothbrush') || s.includes('brosse à dent') || s.includes('zahnbürste') || s.includes('cepillo de diente') || s.includes('replace_toothbrush')) return 'toothbrush';
  if (s.includes('grout') || s.includes('joint') || s.includes('fuge') || s.includes('lechada') || s.includes('clean_grout')) return 'grout';

  // Cleaning actions
  if (s.includes('vacuum') || s.includes('aspirat') || s.includes('staubsaug') || s.includes('aspira')) return 'vacuum';
  if (s.includes('mop') || s.includes('serpill') || s.includes('wisch') || s.includes('fregona') || s.includes('mop_floor') || s.includes('hose_floor')) return 'mop';
  if (s.includes('dust') || s.includes('poussière') || s.includes('poussiere') || s.includes('staub') || s.includes('polvo') || s.includes('dust_surfaces') || s.includes('dust_shelves') || s.includes('dust_lampshades')) return 'dust';
  if (s.includes('sweep') || s.includes('balay') || s.includes('feg') || s.includes('barr') || s.includes('sweep_floor') || s.includes('sweep_mop')) return 'sweep';

  // Living room
  if (s.includes('sofa') || s.includes('couch') || s.includes('canapé') || s.includes('canape') || s.includes('cushion') || s.includes('coussin') || s.includes('vacuum_sofa') || s.includes('fluff_cushion')) return 'sofa';
  if (s.includes('tv') || s.includes('television') || s.includes('remote') || s.includes('télécommande') || s.includes('fernseh') || s.includes('fernbedien') || s.includes('wipe_tv') || s.includes('clean_remotes')) return 'tv';
  if (s.includes('lamp') || s.includes('light fixture') || s.includes('lampe') || s.includes('lámpara') || s.includes('lampshade') || s.includes('desk_lamp')) return 'lamp';
  if (s.includes('furniture') || s.includes('meuble') || s.includes('möbel') || s.includes('mueble') || s.includes('polish') || s.includes('clean_behind')) return 'furniture';
  if (s.includes('rug') || s.includes('carpet') || s.includes('tapis') || s.includes('teppich') || s.includes('alfombra') || s.includes('deep_clean_carpet')) return 'rug';

  // Windows & switches
  if (s.includes('curtain') || s.includes('blind') || s.includes('rideau') || s.includes('vorhang') || s.includes('cortina') || s.includes('jalousie') || s.includes('wash_curtains') || s.includes('curtains_blinds')) return 'curtain';
  if (s.includes('window') || s.includes('fenêtre') || s.includes('fenetre') || s.includes('fenster') || s.includes('ventana') || s.includes('clean_windows')) return 'window';
  if (s.includes('switch') || s.includes('handle') || s.includes('interrupteur') || s.includes('poignée') || s.includes('schalter') || s.includes('griff') || s.includes('wipe_switches') || s.includes('door_handle')) return 'lightswitch';

  // Office
  if (s.includes('keyboard') || s.includes('mouse') || s.includes('clavier') || s.includes('souris') || s.includes('tastatur') || s.includes('maus') || s.includes('teclado') || s.includes('ratón') || s.includes('clean_keyboard')) return 'keyboard';
  if (s.includes('monitor') || s.includes('écran') || s.includes('ecran') || s.includes('bildschirm') || s.includes('wipe_monitor')) return 'monitor';
  if (s.includes('cable') || s.includes('câble') || s.includes('kabel') || s.includes('organize_cables')) return 'cable';
  if (s.includes('chair') || s.includes('chaise') || s.includes('stuhl') || s.includes('silla') || s.includes('clean_chair')) return 'chair';
  if (s.includes('desk') || s.includes('bureau') || s.includes('schreibtisch') || s.includes('escritorio') || s.includes('clear_desk') || s.includes('wipe_desk')) return 'desk';

  // Laundry
  if (s.includes('dryer vent') || s.includes('lint') || s.includes('peluche') || s.includes('flusensieb') || s.includes('pelusa') || s.includes('lint_filter') || s.includes('dryer_vent')) return 'dryer';
  if (s.includes('washer') || s.includes('washing') || s.includes('lave-linge') || s.includes('waschmaschine') || s.includes('lavadora') || s.includes('washer_seal') || s.includes('cleaning_cycle') || s.includes('machine_exterior')) return 'washer';
  if (s.includes('detergent') || s.includes('lessive') || s.includes('waschmittel') || s.includes('detergente') || s.includes('detergent_drawer') || s.includes('organize_supplies')) return 'detergent';
  if (s.includes('fold') || s.includes('iron') || s.includes('pli') || s.includes('repass') || s.includes('bügel') || s.includes('planch') || s.includes('folding_surface')) return 'iron';
  if (s.includes('cloth') || s.includes('donat') || s.includes('vêtement') || s.includes('kleidung') || s.includes('ropa') || s.includes('sort_donate')) return 'clothes';

  // Garage
  if (s.includes('cobweb') || s.includes('spider') || s.includes('toile') || s.includes('araignée') || s.includes('araignee') || s.includes('spinnennetz') || s.includes('telaraña') || s.includes('telarana') || s.includes('clear_cobwebs')) return 'cobweb';
  if (s.includes('chemical') || s.includes('produit chimique') || s.includes('chemikalie') || s.includes('químico') || s.includes('quimico') || s.includes('check_chemicals')) return 'chemicals';
  if (s.includes('garage door') || s.includes('porte de garage') || s.includes('garagentor') || s.includes('puerta de garaje') || s.includes('door_tracks')) return 'garagedoor';
  if (s.includes('tool') || s.includes('workbench') || s.includes('outil') || s.includes('werkzeug') || s.includes('herramienta') || s.includes('power_tools') || s.includes('organize_tools') || s.includes('clean_workbench')) return 'tools';

  // Organize
  if (s.includes('closet') || s.includes('wardrobe') || s.includes('penderie') || s.includes('kleiderschrank') || s.includes('armario') || s.includes('organize_closet')) return 'closet';
  if (s.includes('drawer') || s.includes('filing') || s.includes('tiroir') || s.includes('schublade') || s.includes('cajón') || s.includes('cajon') || s.includes('organize_drawers') || s.includes('organize_cabinets')) return 'drawer';
  if (s.includes('shelf') || s.includes('shelv') || s.includes('étagère') || s.includes('etagere') || s.includes('regal') || s.includes('estante') || s.includes('organize_shelves') || s.includes('storage')) return 'shelf';

  // Trash
  if (s.includes('trash') || s.includes('recycl') || s.includes('waste') || s.includes('compost') || s.includes('poubelle') || s.includes('müll') || s.includes('muell') || s.includes('basura') || s.includes('empty_trash') || s.includes('paper_trash') || s.includes('sort_recycling')) return 'trash';

  // Tidy / general
  if (s.includes('tidy') || s.includes('ranger') || s.includes('aufräum') || s.includes('aufraeum') || s.includes('ordenar') || s.includes('tidy_up') || s.includes('put_things')) return 'broom';

  return 'sparkle';
}
