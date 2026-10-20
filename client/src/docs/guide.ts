/**
 * The in-app guide (Settings → Guide & help → /guide). English is here; each other language is a GUIDE_<LANG>
 * array in guide.<lang>.ts with the same sections and blocks. A guide change goes into all six
 * (check them with devtools/guide_check.mjs).
 */
export type GuideBlock =
  | { p: string }
  | { ul: string[] }
  | { ol: string[] }
  /** Where to find it, e.g. "Settings → Features" */
  | { where: string }
  | { tip: string }
  /** A how-it-connects chain, read top to bottom */
  | { flow: Array<{ title: string; text: string }> }
  /** Troubleshooting: what you see, then why and what to do */
  | { qa: Array<{ q: string; a: string[] }> }
  | { h: string };

export interface GuideSection {
  id: string;
  icon: string;
  title: string;
  /** Mostly for parents (shown with a tag) */
  parents?: boolean;
  blocks: GuideBlock[];
}

export const GUIDE_EN: GuideSection[] = [
  {
    id: 'start',
    icon: '🚀',
    title: 'Getting started',
    parents: true,
    blocks: [
      { p: 'TidyQuest turns housework into a game: chores earn coins, coins buy rewards, and levels, badges and a family mascot keep everyone going. Here is the order that works best for setting it up.' },
      { ol: [
        'Install it (see "Installing and updating"), open it in a browser and sign up. The first person to sign up becomes a parent (admin).',
        'Add everyone in Settings → Family Members: a name, a login and a role (see "People and roles"). Set each kid’s Task view and Kid mode there too.',
        'Make your rooms on the Rooms page. A room type adds suggested chores you can untick. Give a room to one person ("assigned to") to make it theirs, like a bedroom.',
        'Add or adjust chores in each room: how often, effort or coins, who can do it, and an icon (see "Chores").',
        'Set the coin values in Settings → Coins per effort, then build the Rewards Catalog with prices kids can reach (see "Coins, rewards and goals").',
        'Give each kid a weekly goal in Settings → Goals by member, with a bonus for reaching it. The same section has the family team goal shown on the Board.',
        'Turn on Strict Mode in Settings → General if a parent should approve kids’ chores before the coins count.',
        'Set up notifications (see "Notifications"): a family channel, then each person’s own phone if you like.',
        'Look through Settings → Features and switch off any extras you don’t want (Rescue Mission, mascot, team-ups, holidays…).',
        'Download a backup in Settings → Data & Privacy once everything is set up, and now and then after that.',
      ] },
      { tip: 'Start small: a handful of chores per kid and a few cheap rewards they can earn in the first week. You can add more any time.' },
    ],
  },
  {
    id: 'connections',
    icon: '🔗',
    title: 'How it all connects',
    blocks: [
      { p: 'Almost everything starts with a chore being done. This is the chain, from tapping Done to the rewards at the end.' },
      { flow: [
        { title: '1. A chore comes due', text: 'Each chore has a schedule (every N days, set weekdays, or anytime). Its health drops from 100% to 0% over its interval; house health on Home is the average of all chores, weighted by effort.' },
        { title: '2. Someone taps Done', text: 'Alone, or as a team-up. With Strict Mode on, a kid’s chore waits for a parent to approve it; nothing below happens until then (except that the coins are already worked out).' },
        { title: '3. Coins are worked out', text: 'Custom coins if the chore has them, otherwise Coins per effort. Then the biggest multiplier that applies: a double coins event or today’s Rescue Mission (they don’t stack). Team-ups split the coins plus a team bonus; each share gets the multiplier.' },
        { title: '4. The coins go to work', text: 'They add to the person’s balance (to spend on rewards), their lifetime coins (levels and unlocks), their weekly goal (bonus when reached), the Board (ranks, awards, the family goal) and the family’s total (the mascot grows).' },
        { title: '5. Everything else updates', text: 'The chore’s health resets to 100%, streaks continue, badges are checked (and may pay bonus coins), the chore shows in Activity and "Completed today", and others can cheer it.' },
        { title: '6. Spending', text: 'A kid requests a reward and a parent approves it; the price comes off their balance. Shared rewards fill a pot that several people chip into; when it’s full a parent approves it, and a rejection gives everyone their coins back.' },
      ] },
      { h: 'Two kinds of coins' },
      { ul: [
        'Balance: what you can spend now. It goes down when you buy a reward or chip into a pot.',
        'Lifetime coins earned: chores plus coins given by a parent. It never goes down and decides your level.',
      ] },
      { h: 'What happens by itself' },
      { ul: [
        'Each morning: today’s Rescue Mission is picked (the most-forgotten chore pays extra), and kids can get a "today’s chores" summary. Parents get a recap on Sundays.',
        'During the day: reminders for chores with a set time, then again 2 hours later, then a note to a parent.',
        'Evening: nudges about what’s still undone, a streak about to break, or a goal that’s close.',
        'Monday: a new week starts (weeks run Monday to Sunday) and weekly goals that repeat set themselves up again. A goal’s bonus is paid the moment it’s reached.',
        'Midnight: team-up invites end, and "Completed today" starts over.',
      ] },
    ],
  },
  {
    id: 'people',
    icon: '👨‍👩‍👧‍👦',
    title: 'People and roles',
    parents: true,
    blocks: [
      { where: 'Settings → Family Members' },
      { ul: [
        'Parent (admin): can change everything, approves chores and rewards under Strict Mode, and counts as a "helper" when teaming up with a kid.',
        'Member: an older kid or another adult. Doesn’t need approval and can mark chores done for others.',
        'Child: earns coins; under Strict Mode their chores wait for a parent.',
      ] },
      { h: 'Per-person settings' },
      { ul: [
        'Participates in tasks: off for a parent who only manages; they won’t earn coins or appear on the Board.',
        'Task view: All (they choose), Starts on Mine, or Only theirs (locked).',
        'Kid mode: bigger buttons, fewer cards, coins and goal up front.',
        'Theme and holiday colors follow the person to every device (they can change them in Profile).',
        'Vacation per member: protects their streak and freezes their chores’ health while away.',
        'Adjust coins (Manage member): add or take away coins with a reason. The number is a change, not a new balance: 10 adds 10, -10 takes 10 away. Works for parents too, including yourself. Details in "Coins, rewards and goals" → Adjusting coins.',
        'Password: a parent can set a new one if someone forgets theirs.',
      ] },
      { tip: 'Turn on "Hide other people’s private rooms from kids" in Settings → General if kids shouldn’t see, say, a parent’s own room.' },
    ],
  },
  {
    id: 'rooms',
    icon: '🏠',
    title: 'Rooms and zones',
    parents: true,
    blocks: [
      { p: 'Rooms hold chores. A room assigned to one person is theirs: only they (and parents/members) can do its chores, and it never takes part in team-ups.' },
      { ul: [
        'Create a room on the Rooms page; a room type adds suggested chores you can pick from.',
        'Zones group rooms on the Rooms page (for example "Upstairs" or "Parents’ Quests").',
        'A room’s health is the average of its chores; the worst room is the one the mascot asks for help with.',
      ] },
    ],
  },
  {
    id: 'chores',
    icon: '🧽',
    title: 'Chores',
    parents: true,
    blocks: [
      { where: 'Rooms → a room → Add Task, or the ✏️ on a chore' },
      { h: 'Schedule' },
      { ul: [
        'Every N days: due again N days after it was last done. Its health falls over those days.',
        'Set weekdays: due on chosen days of the week instead.',
        'Monthly: due on a day of the month (29–31 fall on the last day of shorter months, and "Last day" is always the last) or on the first, second, third, fourth or last weekday, like the first Saturday. It doesn’t drift when it’s done late.',
        'Starts on (📅): for any repeating chore. Nothing is due before that day, and it’s first due on it (with set weekdays or Monthly: on the first scheduled day from it). Until then it counts as clean, and the room shows “Starts …”. Once it’s been done on or after that day, the date no longer matters.',
        'Only in season: only due between two months (outside them it doesn’t count toward house health).',
        'On demand (anytime): no schedule; it can be done whenever. Turn on "Show in Dashboard" to list it on Home, and set a repeat limit (per day or week) if it could be farmed.',
        'One-time (to-do): done once, then it’s gone from the lists (it stays in Activity). Optional "Do by" date. Quick-add one with "+ To-do" on Home.',
        'Allow early completion: lets a chore be redone on any new calendar day, even before it’s due (useful for daily routines).',
        'Remind at: a reminder at a set time on the day (or the evening before).',
      ] },
      { h: 'Coins' },
      { ul: [
        'Effort (1–5) sets the coins from Settings → Coins per effort. Custom coins override that for one chore.',
        'Rescue Mission and double coins events multiply them on the day.',
      ] },
      { h: 'Who can do it' },
      { ul: [
        'Nobody assigned: anyone. The first person to finish it gets the coins ("first one wins").',
        'Assigned to some people: only they can do it.',
        'Shared: each assignee does their part and gets an even share.',
        'Custom split: each assignee gets a set percentage.',
        'Rotating: turn by turn, per completion or per calendar week.',
      ] },
      { h: 'Icon' },
      { p: 'Tap the icon button to open the picker. It shows a live preview of the chore, suggests an icon from the chore’s name, and has a search and every icon grouped by area. A new chore left on the ✨ gets the suggested icon automatically.' },
      { h: 'Timer' },
      { ul: [
        'Timer (minutes) in the chore editor gives a chore a countdown, for example 10 minutes to tidy a room. Leave it empty for no timer. The chore’s name doesn’t matter.',
        'The chore then shows ▶ 10 min next to Done. Tap it for a big countdown with Pause and +5 min. Tap ⌄ to hide it: a small timer bar stays at the top of every page, and the timer keeps going after a reload.',
        'At zero it chimes and vibrates, then asks “Time’s up! Done?”. Done finishes the chore as usual (with Strict Mode it still waits for a parent). “Need more time” adds 5 minutes.',
        'Kids start the timer first: on a timer chore, their Done button comes back when the time is up. Parents and members can tap Done any time.',
        'The Tasks page lists every chore with a timer: pick “⏱️ Has a timer” in its filter.',
      ] },
      { h: 'Steps' },
      { p: 'Steps (one per line) list what a chore involves, like “Feet on the floor”, “Lights on”, “Put on the clothes”. They show as tick boxes in One thing at a time. The ticks are only a help: Done still finishes the chore.' },
      { h: 'Finishing a chore' },
      { ul: [
        'Tap Done on Home, in the room, or on the Tasks page. The 📎 button adds a note or photo as proof.',
        'Parents and members can mark a chore done for someone else ("who did it?").',
        'A mistake can be undone from Activity (parents), or with ↩️ Undo next to the chore’s "Done by" in its room (parents; it asks first, because the coins come back off). A team-up is undone for the whole team, and everyone’s coins for it are taken back. A kid can take back their own Done while it waits for approval.',
      ] },
    ],
  },
  {
    id: 'home',
    icon: '🏡',
    title: 'Home and the other pages',
    blocks: [
      { ul: [
        'Home: the holiday greeting, your level, the mascot, team-ups, Rescue Mission, Your usual, Maybe you forgot, Today’s Quests, To-do, Completed today and more. "Customise" chooses which cards you see.',
        'Rooms: every room and its chores. Tasks: every chore in one searchable list.',
        'Calendar: what’s due when, and what was done.',
        'Activity: everything that happened (chores, coin changes, chip-ins), with filters and cheers.',
        'Board: rankings by coins, goal % or most improved, awards like Early Bird and room champions, the trophy shelf and the family goal.',
        'Achievements: badges, your level and what’s next. Rewards: the catalog and your requests.',
        'Search: the 🔍 button, or press / or Ctrl+K on a keyboard.',
      ] },
      { h: 'Arrange your Home' },
      { ul: [
        'Customise (at the top and the bottom of Home) lists your cards in order. Drag a card by its ≡ to move it, or use ▲▼; 👁️ shows or hides it. Reset to default puts everything back.',
        'Your layout is saved for you: it’s the same on every phone and computer you sign in on, and someone else on the same device has their own.',
        'In Kid mode, kids arrange and hide their own cards too (the ones Kid mode shows).',
        'A card added in a later version appears in its usual place.',
      ] },
      { h: 'One thing at a time' },
      { ul: [
        'Today’s chores one at a time, big: the icon, name, coins and the steps as tick boxes, with Done, Skip for now, and ▶ when the chore has a timer.',
        'The order: your own chores due today, then the Rescue Mission, then up to 3 open chores (anyone’s) that are due. Skip for now moves a chore to the back of today’s line.',
        'Dots show how far you are (“3 of 7 today”), and an empty line gets a celebration.',
        'Parents choose per person in Settings → Family Members → One thing at a time: Off, Button on Home, or It is their Home (then “Show all of Home” opens the usual Home). Kids get the button unless a parent changes it. Settings → Features switches it off for everyone.',
      ] },
    ],
  },
  {
    id: 'rewards',
    icon: '🎁',
    title: 'Coins, rewards and goals',
    blocks: [
      { where: 'Settings → Rewards Catalog, Goals by member, Coins per effort' },
      { h: 'Rewards' },
      { ul: [
        'Each reward has a price. Kids request it; a parent approves or turns it down.',
        'Approved one by mistake? Reward requests (under the catalog) has Refund next to each approved reward: the coins go back (a shared pot to everyone who chipped in) and it shows as rejected.',
        'Rules per reward: a limit (per day, week, month or ever; per person or for everyone), a date window, Rotating (only a few show each week), who can see it, a different price per person, and a category.',
        'Shared saving: anyone can chip coins into a pot; when it’s full it goes to a parent. The chip-in box starts at 0, and each chip-in shows in Activity. A full pot can’t be cancelled from My requests ("Shared: a parent decides"): a parent turns it down and everyone gets their coins back.',
      ] },
      { h: 'Goals' },
      { ul: [
        'Weekly goal per person: a coin target with an optional bonus when reached (paid automatically). "Repeats weekly" sets up next week’s goal by itself.',
        'Family team goal (in Goals by member): a weekly coin target for everyone together, with a prize, shown on the Board. Set it to 0 to turn it off.',
      ] },
      { h: 'Adjusting coins' },
      { p: 'Settings → Family Members → Manage member, next to their Balance. The box takes how many coins to add or take away, not the new balance.' },
      { ol: [
        'Type the change in the Adjust box: a plain number adds coins (15 gives 15), a minus sign takes them away (-15 removes 15).',
        'Add a reason if you like (up to 200 characters). They see it in their coin history and Activity, and in the notification they get if theirs are on.',
        'Tap Adjust. "+15 ✓" or "-15 ✓" confirms it, and the Balance updates.',
      ] },
      { ul: [
        'To set an exact balance, type the difference: Balance 71 and it should be 59 → type -12. Balance 40 and it should be 50 → type 10.',
        'A balance can’t go below 0. Taking away more than they have stops at 0, and only what was actually taken is recorded.',
        'Coins added count toward their lifetime coins (level and unlocks) like coins from chores. Taking coins away lowers the balance only; a level is never lost.',
        'Adjustments don’t count toward the weekly goal or the Board, which only count chores.',
      ] },
      { tip: 'Typed 12 when you meant -12? Adjust again with -24 to land where you wanted.' },
      { h: 'Coins from a parent' },
      { ul: [
        'Adjust coins (see above) gives or takes away coins by hand, with a reason.',
        'When approving a chore, ⭐💬 adds a note and an "above and beyond" bonus (+1, +2 or +5).',
        'Rejecting a chore shows "Rejected · Undo" for 5 seconds before it goes through. 💬 Add a reason pauses that and sends the kid one line on what’s missing (with their outcome notification).',
        'Double coins events (Settings → Double coins events): a multiplier for a time window, for everything, chosen rooms, or chosen chores. On Home, tap the event to see every chore it covers that you can do, with its coins and whether it’s ready now; tap one to open it.',
      ] },
    ],
  },
  {
    id: 'extras',
    icon: '✨',
    title: 'Game extras',
    blocks: [
      { where: 'Settings → Features (each one can be switched off for the family)' },
      { ul: [
        'Rescue Mission: each day the most-forgotten chore pays extra (2× by default) to the first person who does it.',
        'Your usual / Maybe you forgot: Home shows the chores you do most (and ones you pin), and chores overdue by a whole interval. 💤 hides one from Maybe you forgot for 3 days, just for you; "Snoozed · Undo" brings it straight back.',
        'To-dos: one-time chores and the To-do card.',
        'Board awards and trophy shelf. Levels and Next badge.',
        'Cheers: 👏 🎉 💪 ⭐ on anyone else’s finished chore (Home’s "Completed today" and Activity). The same emoji again takes it back. The person gets a private notification.',
        'Team-ups: 🤝 on a chore worth 6 or more coins invites one person or anyone. Once someone joins, the chore is the team’s for the day. Either one taps Done; coins split evenly plus a team bonus (10, 20 or 30%). A parent with a kid is a helper and the kid keeps all the coins. Never on someone’s own room, one-person or rotating chores. Not up for it? "No thanks" turns an invite down: an invite just for you ends and the person who asked hears about it, so they can ask someone else; an invite for anyone just disappears for you. The person who started it can "Call off team-up" (it ends for everyone); anyone else can Leave.',
        'House mascot: one of 8 creatures, picked and named here. It grows with the family coins earned while it’s the active mascot (hatches at 500, then 2,000, 5,000 and 10,000), its mood follows house health, and it reacts to birthdays, the family goal and the Rescue Mission.',
        'Swapping mascots: picking a creature you haven’t had starts it as a new egg. Each creature keeps its own growth, name and outfit, so switching back brings it back exactly as it was. The tummy and bedtime are shared.',
        'Playing with the mascot: tap it for a reaction. Its 🍪 tummy fills 5% with every chore (a team-up counts once) and empties over 2 days; when it’s low it just says it’s hungry. "What should I do?" suggests a chore you can do right now. It adds a 🐾 cheer to every finished chore. It sleeps during the family bedtime (set under the mascot in Features, 9 pm to 7 am by default).',
        'Mascot shop (its own switch): anyone can buy it an accessory for 1 to 5 coins. There’s one shared outfit and no closet: a new item goes on right away for everyone and replaces whatever was in that spot (head, face, neck or back). Whoever bought an item, or a parent, can take it off for free. Purchases show in Activity. The shop opens once the mascot hatches. Turning the shop off hides it and the outfit.',
        'Seasonal styling: Halloween in October, Thanksgiving in November, Christmas in December: colors, decorations, a countdown and a costume for the mascot. Each holiday has its own switch and a Preview button.',
      ] },
      { h: 'Streak shields' },
      { ul: [
        'A streak counts the days in a row with at least one chore. Every 7 days in a row earns a 🛡️ shield; you can hold 2.',
        'Buy a shield on Home’s streak card (25 coins by default; parents set the price in Settings → Features).',
        'A missed day uses a shield by itself, just after midnight, and the streak carries on (the missed day doesn’t add to it). Two missed days need two shields; with too few, none are used and the streak starts again.',
        'A chore waiting for a parent’s approval counts for its day.',
        'Parents can give a shield (a sick day, a busy weekend) with 🛡️ Give a shield in Settings → Family Members. Bought, earned, given and used shields show in Activity.',
      ] },
      { h: 'Levels and unlocks' },
      { p: 'Levels come from lifetime coins (level 2 at 50, 5 at 500, 10 at 2,250). Each level unlocks something; pick them in Profile → Unlocks.' },
      { ul: [
        'Frames: bronze (2), silver (6), gold (9), rainbow (10). Crown and diamond badges unlock their own frames.',
        'Celebrations: falling coins (3), fireworks (8). Themes: Forest (4), Galaxy (7), Lava (10). The first 8 themes are free.',
        'Titles (5): your level’s title or any badge you’ve earned, shown on Home, the Board, the sidebar and Activity.',
      ] },
      { h: 'Badges' },
      { p: 'Built-in badges unlock by themselves. Parents can make their own in Settings → Badges (for example "Homework 4 weeks in a row"), with optional bonus coins, and set coins for every built-in badge.' },
    ],
  },
  {
    id: 'notifications',
    icon: '🔔',
    title: 'Notifications',
    parents: true,
    blocks: [
      { where: 'Settings → General → Notifications, then Who gets what, Timing & quiet hours and Notification log' },
      { ol: [
        'Turn notifications on and pick which kinds the family gets.',
        'Set up a family channel: ntfy (a server URL and a topic everyone subscribes to in the ntfy app), Telegram (a bot token and a chat ID), or a Home Assistant notify service. Use the test button.',
        'Optionally give each person their own channel in "Who gets what": their own ntfy topic, Telegram chat, or Home Assistant phone. They then get messages in their own language, and can turn kinds off in Profile.',
        'Set quiet hours (messages wait and go out when they end) and whether kids’ messages wait during school hours on weekdays.',
      ] },
      { ul: [
        'Private kinds (approved/turned down, summaries, nudges, cheers) only go to a person’s own channel, never the family channel.',
        'The Notification log shows what was sent, queued or failed, and why.',
      ] },
    ],
  },
  {
    id: 'insights',
    icon: '📊',
    title: 'Insights for parents',
    parents: true,
    blocks: [
      { where: 'Insights in the menu (parents only)' },
      { ul: [
        'Chores done: bars for a day (by hour), a week or a month (by day), or a year (by month). ◀ ▶ steps back through earlier periods. Tap a bar for its numbers, or use Show as a table.',
        'Measure: Chores counts what was done, Coins what was actually paid (with double coins, the Rescue Mission and team bonuses), and Effort adds up the chores’ effort levels. A chore waiting for approval counts when it was done; its coins count once a parent approves it.',
        'Split by Person (in each person’s color), Room or Chore. Past 8 rooms or chores, the rest are grouped as Other.',
        'Busy and quiet times: weekdays by time of day, averaged over the last 4 or 12 weeks. The strongest colors are when the most gets done; faint squares are bad times to push chores. Show numbers puts the averages in the squares.',
        'Who does how much: each person’s share of the period, and the change from the period before (while a period is still running, up to the same point, like last week by now).',
        'The Everyone menu narrows the bars and the squares to one person. Parents’ own chores are included.',
      ] },
      { tip: 'With game features switched off, Insights still works; only the Coins measure is hidden.' },
    ],
  },
  {
    id: 'data',
    icon: '💾',
    title: 'Backups, spreadsheets and deleted items',
    parents: true,
    blocks: [
      { ul: [
        'Settings → Data & Privacy → Export: a full JSON backup. Keep one before big changes.',
        'Import restores a backup and REPLACES everything. Everyone except the parent doing the import gets a new random password, so set new passwords in Family Members afterwards.',
        'Settings → Spreadsheets: download chores or rewards, edit them in any spreadsheet app, and load them back. You see a preview first and nothing is deleted.',
        'To delete a chore, open it with Edit; Delete task is at the bottom of the form. It goes to Settings → Recently deleted for 30 days and can be restored from there. Rewards work the same way.',
        'Deleting never takes coins away or erases what was done: past completions keep showing in Activity, the Board and goals under the chore’s name, even after it leaves Recently deleted.',
        'Deleting a room (Rooms → 🗑) deletes its chores too, and the room can’t be brought back. Their history and coins stay.',
      ] },
    ],
  },
  {
    id: 'install',
    icon: '🛠️',
    title: 'Installing and updating',
    parents: true,
    blocks: [
      { ul: [
        'TidyQuest runs as one Docker container with a data folder (the database, avatars and proof photos). Back up that folder.',
        'Set JWT_SECRET to a long random string, and TZ to your time zone (for example America/New_York). Without TZ the server uses UTC, and "today", midnight and the week would be off by hours.',
        'Releases are tagged (for example 0.9.0). Pin that number in docker-compose.yml, then run "docker compose pull && docker compose up -d". The ":main" image is the newest code, for trying things out first.',
        'Settings → General shows the version running. To roll back, put the previous version number back and start it again (take a backup first: the database only moves forward).',
        'Phone notifications from the app itself and installing it as an app need a secure (https://) address; until then use ntfy or Telegram.',
      ] },
    ],
  },
  {
    id: 'troubleshooting',
    icon: '🧰',
    title: 'Troubleshooting',
    blocks: [
      { qa: [
        { q: 'The Done button is grey', a: [
          'Its label says why: "Not assigned" (someone else’s chore), "Waiting for approval" (a parent hasn’t approved your last one yet), "Done by …" (someone already did it today), "Done today / this week" (an anytime chore’s repeat limit), or "🤝 names" (a team has claimed it today).',
          'If Done gives a "not yet due" message: the chore isn’t due again yet. A parent can turn on "Allow early completion" for daily routines.',
        ] },
        { q: 'A kid’s chore shows ▶ instead of Done', a: [
          'It has a timer (Timer in the chore editor). The kid taps ▶, and Done comes back when the time is up. A parent can tap Done for them, or empty the timer in the chore editor.',
          'The screen may turn off while the timer runs (over a plain http address, phones don’t let apps keep it on). The timer keeps counting and shows “Time’s up! Done?” when you look again.',
        ] },
        { q: 'I tapped Done but got no coins', a: [
          'With Strict Mode on, a kid’s chore waits for a parent. It shows as waiting in Activity and on the parent’s Home under "Waiting for approval".',
          'Tapped Done by mistake? While it waits, ↩ Take back (next to the button) undoes it; on a team-up it’s taken back for the whole team.',
          'If Gamification is off (Settings → General), there are no coins at all.',
          'If a parent turned it down, the chore is open again; under team-ups it goes back to the team.',
        ] },
        { q: 'A card is missing from Home', a: [
          'It may be hidden: open Customise (the button at the bottom of Home) and tap its 🚫 to show it again, or use Reset to default.',
          'Some cards only show when they have something in them (Your usual, Maybe you forgot, Scheduled, Completed today, Waiting for approval), and some are for parents only.',
        ] },
        { q: 'One thing at a time is missing, or a chore isn’t in it', a: [
          'For parents and members it’s off unless it’s set in Settings → Family Members. Kids get it (a button on Home) unless a parent turned it off there. It can also be hidden in Home → Customise, or switched off in Settings → Features.',
          'It lists chores you can do now: your own that are due today, the Rescue Mission and up to 3 open ones. Anytime chores and chores that aren’t due yet are on Home and the Tasks page.',
        ] },
        { q: 'A chore isn’t showing on Home', a: [
          'Today’s Quests lists chores that are due, most-overdue first (up to 10). Others are in their room and on the Tasks page.',
          'Anytime chores need "Show in Dashboard" turned on.',
          'Out of season (Only in season) or set weekdays: it isn’t due today.',
          'It has a start date (📅 Starts on) that hasn’t come yet: it shows “Starts …” in its room.',
          'Your Task view may be on "Mine" (the switch at the top), or a parent set it to "Only theirs".',
          'One-time chores are in the To-do card, and are gone once done.',
          'You may have snoozed it (💤 in Maybe you forgot): it comes back after 3 days, or tap Undo on the "Snoozed" message right away.',
        ] },
        { q: 'A kid can’t see a room or chore', a: [
          'Settings → General → "Hide other people’s private rooms from kids" hides rooms that belong to someone else.',
          'Their Task view may be "Only theirs" (Settings → Family Members).',
        ] },
        { q: 'The coins for a chore look wrong', a: [
          'Custom coins win over Coins per effort.',
          'A double coins event or the Rescue Mission multiplies them (the bigger one wins; they don’t stack).',
          'Team-ups split the coins plus the team bonus; a parent helper gets nothing so the kid keeps it all.',
          'Badge bonuses and parent bonuses show as separate lines in Activity.',
        ] },
        { q: 'Notifications don’t arrive', a: [
          'Check in order: notifications are on and the kind is ticked (Settings → General); the channel works (use the test button); the person hasn’t turned that kind off (Profile).',
          'Private kinds (outcomes, summaries, nudges, cheers) need the person’s own channel.',
          'Quiet hours and school hours hold messages until they end.',
          'The Notification log shows each message and any error.',
        ] },
        { q: 'Days, midnight or the week are off by a few hours', a: [
          'Set the TZ environment variable on the server to your time zone and restart it (see "Installing and updating").',
        ] },
        { q: 'A rotating chore seems stuck on one person', a: [
          'Check its rotation: "per completion" moves on after each completion (after approval under Strict Mode); "per week" moves on each Monday.',
          'Parents and members can always do it for whoever’s turn it is.',
        ] },
        { q: 'There’s no 🤝 Team up button', a: [
          'Team-ups need a chore worth 6 or more coins that isn’t in someone’s own room, isn’t assigned to just one person, and isn’t rotating.',
          'Only one team-up per chore per day; check the Team-ups card on Home.',
          'Settings → Features → Team-ups must be on.',
        ] },
        { q: 'A team-up invite disappeared', a: [
          'Invites end at midnight, and when someone does the chore another way.',
          'If you tapped "No thanks" on an invite for anyone, it’s hidden for you for the rest of the day.',
          'If the person you invited said no thanks, the invite ended and you can ask someone else.',
        ] },
        { q: 'A theme, frame or celebration is locked', a: [
          'It unlocks at a level (🔒 shows which). Levels come from lifetime coins and never go down.',
        ] },
        { q: 'The mascot is still an egg, or looks sad', a: [
          'It hatches at 500 family coins (everyone’s chores together, all time), then grows at 2,000, 5,000 and 10,000.',
          'Its mood follows house health: below 50% it asks for help with the messiest room; tap "Let’s help".',
        ] },
        { q: 'An accessory someone bought disappeared', a: [
          'There’s one shared outfit and no closet, so buying a new item replaces whatever was in that spot. Activity shows who bought what.',
          'Whoever bought it, or a parent, can also take it off. If the shop causes arguments, a parent can switch it off in Settings → Features.',
        ] },
        { q: 'The mascot turned back into an egg', a: [
          'Someone picked a different creature in Settings → Features: a creature you haven’t had starts as an egg. The old one keeps its growth, name and outfit; pick it again to bring it back.',
        ] },
        { q: 'The mascot is asleep, or says it’s hungry', a: [
          'It sleeps during the family bedtime (Settings → Features, under the mascot), by each device’s clock.',
          'Hungry means fewer chores in the last couple of days; every chore fills its tummy a little. Hunger never affects anything else.',
        ] },
        { q: 'No holiday decorations or colors', a: [
          'Settings → Features → Seasonal styling, and that holiday’s own switch, must be on. It follows the device’s date.',
          'Profile → Holiday colors off keeps your own theme (decorations still show).',
          'Phones set to reduce motion don’t show falling or flying decorations, or confetti.',
        ] },
        { q: 'A streak broke while we were away', a: [
          'Use Vacation Mode (whole house, Settings → General) or vacation per member (Family Members) before leaving; it protects streaks and freezes chore health.',
        ] },
        { q: 'A shield didn’t save the streak', a: [
          'Each missed day needs its own shield. With fewer shields than missed days, none are used: the streak starts again and the shields are kept.',
          'Shields aren’t used during Vacation Mode; vacation already protects the streak.',
        ] },
        { q: 'Someone can’t log in', a: [
          'Too many wrong passwords block logins for up to 15 minutes: 10 for one account, or 20 from one device. Wait and try again; a correct password clears the account’s count.',
          'A parent can set a new password in Settings → Family Members.',
          'After importing a backup, everyone except the parent who imported it needs a new password.',
        ] },
        { q: 'It says "That didn’t work"', a: [
          'The phone couldn’t reach the server (no Wi-Fi or data), or someone changed the same thing at the same moment. The page reloads; check it, then try again.',
        ] },
        { q: 'I deleted something by mistake', a: [
          'Settings → Recently deleted can bring chores and rewards back for 30 days, with their history. A chore whose room was deleted asks which room to go into.',
          'A chore marked done by mistake can be undone from Activity, or with ↩️ Undo in its room (parents).',
        ] },
        { q: 'Is the app up to date?', a: [
          'Settings → General shows the version. See "Installing and updating" to update or roll back.',
        ] },
      ] },
    ],
  },
];

/** The other languages, each loaded the first time the guide opens in it */
const TRANSLATIONS: Record<string, () => Promise<GuideSection[]>> = {
  fr: () => import('./guide.fr').then((m) => m.GUIDE_FR),
  de: () => import('./guide.de').then((m) => m.GUIDE_DE),
  es: () => import('./guide.es').then((m) => m.GUIDE_ES),
  it: () => import('./guide.it').then((m) => m.GUIDE_IT),
  nl: () => import('./guide.nl').then((m) => m.GUIDE_NL),
};
const loading: Record<string, Promise<GuideSection[]>> = {};

/** The guide in this language: English straight away, or a promise of the translation (English if it can't load) */
export function guideFor(language?: string): GuideSection[] | Promise<GuideSection[]> {
  const load = language ? TRANSLATIONS[language] : undefined;
  if (!language || !load) return GUIDE_EN;
  return (loading[language] ??= load().catch(() => GUIDE_EN));
}
